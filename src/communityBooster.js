import { prisma } from "./db.js";
import { generateUniqueLicenseKey } from "./license.js";
import { communityActivitySeasonWindow } from "./communityActivity.js";
import { PARADISE_TEST_GUILD_ID, assertParadiseTestGuildMutation } from "./runtimeEnvironment.js";

export const COMMUNITY_BOOSTER_DAYS_PER_BOOST = 3;
export const DISCORD_GUILD_BOOST_MESSAGE_TYPE = 8;

const activeWorkers = new WeakMap();

function enabled(value) {
  return String(value || "false").trim().toLowerCase() === "true";
}

function intFromEnv(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function communityBoosterConfig(source = process.env) {
  return Object.freeze({
    enabled: enabled(source.COMMUNITY_BOOSTER_REWARDS_ENABLED),
    rewardWorkerEnabled: enabled(source.COMMUNITY_BOOSTER_REWARD_WORKER_ENABLED),
    maxBoostsPerMember: intFromEnv(source.COMMUNITY_BOOSTER_MAX_BOOSTS_PER_MEMBER, 50, { min: 1, max: 250 }),
    workerIntervalMs: intFromEnv(source.COMMUNITY_BOOSTER_WORKER_INTERVAL_MS, 300_000, { min: 60_000, max: 3_600_000 })
  });
}

export function communityBoosterRewardDays(boostCount) {
  const normalized = Math.max(0, Math.floor(Number(boostCount) || 0));
  return normalized * COMMUNITY_BOOSTER_DAYS_PER_BOOST;
}

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function assertBoosterMutation(guildId, source) {
  return assertParadiseTestGuildMutation({ guildId, operation: "community_booster_mutation", source });
}

function boosterMemberId(oldMember, newMember) {
  return String(newMember?.id || oldMember?.id || newMember?.user?.id || oldMember?.user?.id || "");
}

export async function observeCommunityBoostMessage(message, { db = prisma, source = process.env, now = new Date() } = {}) {
  const config = communityBoosterConfig(source);
  if (!config.enabled) return { accepted: false, reason: "booster_rewards_disabled" };
  if (Number(message?.type) !== DISCORD_GUILD_BOOST_MESSAGE_TYPE) return { accepted: false, reason: "not_guild_boost_message" };
  const guildId = String(message?.guildId || message?.guild?.id || "");
  const discordUserId = String(message?.author?.id || message?.member?.id || "");
  const messageId = String(message?.id || "");
  if (!guildId || !discordUserId || !messageId || message?.author?.bot) return { accepted: false, reason: "incomplete_boost_message" };
  assertBoosterMutation(guildId, source);
  const observedAt = asDate(now) || new Date();
  const boostEventAt = asDate(message?.createdAt || message?.createdTimestamp) || observedAt;
  const premiumSince = asDate(message?.member?.premiumSince || message?.member?.premiumSinceTimestamp);

  try {
    return await db.$transaction(async (tx) => {
      const duplicate = await tx.communityBoosterObservation.findUnique({ where: { messageId } });
      if (duplicate) return { accepted: false, reason: "duplicate_boost_message", boostCount: duplicate.countAfter };
      const state = await tx.communityBoosterState.findUnique({
        where: { guildId_discordUserId: { guildId, discordUserId } }
      });
      const currentCount = state?.active ? Math.max(0, Number(state.verifiedBoostCount) || 0) : 0;
      const statePremiumSince = premiumSince || asDate(state?.premiumSince);
      const nearInitialBoost = Boolean(
        currentCount <= 1 &&
        state?.countProvenance === "member_active_fallback" &&
        statePremiumSince &&
        Math.abs(boostEventAt.getTime() - statePremiumSince.getTime()) <= 10 * 60_000
      );
      const nextCount = Math.min(config.maxBoostsPerMember, currentCount === 0 || nearInitialBoost ? 1 : currentCount + 1);
      await tx.communityBoosterObservation.create({
        data: { messageId, guildId, discordUserId, observedAt, countAfter: nextCount, messageType: "guild_boost" }
      });
      const nextState = await tx.communityBoosterState.upsert({
        where: { guildId_discordUserId: { guildId, discordUserId } },
        create: {
          guildId,
          discordUserId,
          active: true,
          verifiedBoostCount: nextCount,
          countProvenance: "discord_system_message",
          premiumSince: statePremiumSince,
          lastBoostEventAt: boostEventAt,
          lastObservedAt: observedAt
        },
        update: {
          active: true,
          verifiedBoostCount: nextCount,
          countProvenance: "discord_system_message",
          premiumSince: statePremiumSince,
          lastBoostEventAt: boostEventAt,
          lastObservedAt: observedAt,
          endedAt: null
        }
      });
      return { accepted: true, reason: "boost_observed", boostCount: nextCount, state: nextState };
    });
  } catch (error) {
    if (error?.code === "P2002") return { accepted: false, reason: "duplicate_boost_message" };
    throw error;
  }
}

export async function reconcileCommunityBoosterMember(oldMember, newMember, { db = prisma, source = process.env, now = new Date() } = {}) {
  const config = communityBoosterConfig(source);
  if (!config.enabled) return { accepted: false, reason: "booster_rewards_disabled" };
  const member = newMember || oldMember;
  const guildId = String(member?.guild?.id || "");
  const discordUserId = boosterMemberId(oldMember, newMember);
  if (!guildId || !discordUserId || member?.user?.bot) return { accepted: false, reason: "incomplete_member" };
  assertBoosterMutation(guildId, source);
  const observedAt = asDate(now) || new Date();
  const premiumSince = asDate(newMember?.premiumSince || newMember?.premiumSinceTimestamp);
  const active = Boolean(newMember && premiumSince);
  const existing = await db.communityBoosterState.findUnique({
    where: { guildId_discordUserId: { guildId, discordUserId } }
  });

  if (!active) {
    const state = await db.communityBoosterState.upsert({
      where: { guildId_discordUserId: { guildId, discordUserId } },
      create: {
        guildId,
        discordUserId,
        active: false,
        verifiedBoostCount: 0,
        countProvenance: "member_inactive",
        lastObservedAt: observedAt,
        endedAt: observedAt
      },
      update: {
        active: false,
        verifiedBoostCount: 0,
        countProvenance: "member_inactive",
        lastObservedAt: observedAt,
        endedAt: observedAt
      }
    });
    return { accepted: true, reason: "booster_inactive", boostCount: 0, state };
  }

  const preserveObservedCount = Boolean(existing?.active && Number(existing.verifiedBoostCount) > 0);
  const verifiedBoostCount = Math.min(config.maxBoostsPerMember, preserveObservedCount ? Number(existing.verifiedBoostCount) : 1);
  const countProvenance = preserveObservedCount ? existing.countProvenance : "member_active_fallback";
  const state = await db.communityBoosterState.upsert({
    where: { guildId_discordUserId: { guildId, discordUserId } },
    create: {
      guildId,
      discordUserId,
      active: true,
      verifiedBoostCount,
      countProvenance,
      premiumSince,
      lastObservedAt: observedAt
    },
    update: {
      active: true,
      verifiedBoostCount,
      countProvenance,
      premiumSince,
      lastObservedAt: observedAt,
      endedAt: null
    }
  });
  return { accepted: true, reason: "booster_active", boostCount: verifiedBoostCount, state };
}

export async function grantCommunityBoosterReward(rewardId, { db = prisma, source = process.env, now = new Date() } = {}) {
  const reward = await db.communityBoosterReward.findUnique({ where: { id: rewardId }, include: { entitlementGrant: true } });
  if (!reward) return { granted: false, reason: "reward_not_found" };
  assertBoosterMutation(reward.guildId, source);
  if (reward.entitlementGrant) return { granted: true, reason: "already_granted", reward };
  const user = await db.user.findUnique({ where: { discordUserId: reward.discordUserId } });
  if (!user) {
    await db.communityBoosterReward.update({ where: { id: reward.id }, data: { status: "blocked", reason: "account_not_linked" } });
    return { granted: false, reason: "account_not_linked", reward };
  }

  try {
    return await db.$transaction(async (tx) => {
      const alreadyGranted = await tx.macroBoosterEntitlementGrant.findUnique({ where: { idempotencyKey: reward.idempotencyKey } });
      if (alreadyGranted) return { granted: true, reason: "already_granted", grant: alreadyGranted };
      const lifetimeLicense = await tx.license.findFirst({
        where: { customerEmail: { equals: user.email, mode: "insensitive" }, status: "active", OR: [{ lifetime: true }, { expiresAt: null }] },
        orderBy: { createdAt: "desc" }
      });
      const activeTimedLicense = lifetimeLicense ? null : await tx.license.findFirst({
        where: { customerEmail: { equals: user.email, mode: "insensitive" }, status: "active", lifetime: false, expiresAt: { gt: now } },
        orderBy: { expiresAt: "desc" }
      });
      const previousExpiresAt = activeTimedLicense?.expiresAt || null;
      let license = lifetimeLicense || activeTimedLicense;
      let action = "lifetime_unchanged";
      let resultingExpiresAt = lifetimeLicense?.expiresAt || null;

      if (activeTimedLicense) {
        action = "extended";
        resultingExpiresAt = new Date(activeTimedLicense.expiresAt.getTime() + reward.days * 86_400_000);
        license = await tx.license.update({ where: { id: activeTimedLicense.id }, data: { expiresAt: resultingExpiresAt } });
      } else if (!lifetimeLicense) {
        action = "created";
        resultingExpiresAt = new Date(now.getTime() + reward.days * 86_400_000);
        license = await tx.license.create({
          data: {
            licenseKey: await generateUniqueLicenseKey(tx),
            customerEmail: user.email,
            plan: "3days",
            status: "active",
            expiresAt: resultingExpiresAt,
            lifetime: false,
            notes: `community_booster_reward period:${reward.periodStartsAt.toISOString()} boost:${reward.boostOrdinal} days:${reward.days}`
          }
        });
      }
      const grant = await tx.macroBoosterEntitlementGrant.create({
        data: {
          rewardId: reward.id,
          idempotencyKey: reward.idempotencyKey,
          userId: user.id,
          licenseId: license?.id || null,
          days: reward.days,
          action,
          previousExpiresAt,
          resultingExpiresAt
        }
      });
      await tx.communityBoosterReward.update({
        where: { id: reward.id },
        data: { status: "granted", reason: null, userId: user.id, licenseId: license?.id || null, grantedAt: now }
      });
      await tx.auditLog.create({
        data: {
          action: "community_booster_macro_entitlement_granted",
          targetType: "community_booster_reward",
          targetId: reward.id,
          metadata: {
            guildId: reward.guildId,
            periodStartsAt: reward.periodStartsAt,
            discordUserId: reward.discordUserId,
            boostOrdinal: reward.boostOrdinal,
            days: reward.days,
            userId: user.id,
            licenseId: license?.id || null,
            entitlementAction: action,
            provenance: reward.provenance
          }
        }
      });
      return { granted: true, reason: action, reward, grant, license };
    });
  } catch (error) {
    if (error?.code === "P2002") return { granted: true, reason: "already_granted" };
    throw error;
  }
}

export async function ensureMonthlyCommunityBoosterRewards({ guildId = PARADISE_TEST_GUILD_ID, db = prisma, source = process.env, now = new Date() } = {}) {
  const config = communityBoosterConfig(source);
  if (!config.enabled) return { ran: false, reason: "booster_rewards_disabled" };
  assertBoosterMutation(guildId, source);
  const period = communityActivitySeasonWindow(now);
  const states = await db.communityBoosterState.findMany({
    where: { guildId, active: true, verifiedBoostCount: { gt: 0 } },
    orderBy: { discordUserId: "asc" }
  });
  let ensuredRewardCount = 0;
  for (const state of states) {
    const boostCount = Math.min(config.maxBoostsPerMember, Math.max(1, Number(state.verifiedBoostCount) || 1));
    for (let boostOrdinal = 1; boostOrdinal <= boostCount; boostOrdinal += 1) {
      await db.communityBoosterReward.upsert({
        where: {
          guildId_periodStartsAt_discordUserId_boostOrdinal: {
            guildId,
            periodStartsAt: period.startsAt,
            discordUserId: state.discordUserId,
            boostOrdinal
          }
        },
        create: {
          guildId,
          periodStartsAt: period.startsAt,
          periodEndsAt: period.endsAt,
          discordUserId: state.discordUserId,
          boostOrdinal,
          days: COMMUNITY_BOOSTER_DAYS_PER_BOOST,
          provenance: state.countProvenance,
          idempotencyKey: `community-booster:${guildId}:${period.key}:${state.discordUserId}:${boostOrdinal}`,
          metadata: { verifiedBoostCount: boostCount, lastObservedAt: state.lastObservedAt || null }
        },
        update: {}
      });
      ensuredRewardCount += 1;
    }
  }
  const pending = config.rewardWorkerEnabled
    ? await db.communityBoosterReward.findMany({
      where: { guildId, periodStartsAt: period.startsAt, status: { in: ["pending", "blocked"] } },
      orderBy: [{ discordUserId: "asc" }, { boostOrdinal: "asc" }]
    })
    : [];
  const grants = [];
  for (const reward of pending) grants.push(await grantCommunityBoosterReward(reward.id, { db, source, now }));
  return { ran: true, period, activeBoosters: states.length, ensuredRewardCount, grants };
}

export async function runCommunityBoosterWorker(client, { db = prisma, source = process.env, now = new Date() } = {}) {
  const config = communityBoosterConfig(source);
  if (!config.enabled) return { ran: false, reason: "booster_rewards_disabled" };
  const guild = client?.guilds?.cache?.get?.(PARADISE_TEST_GUILD_ID) || null;
  if (!guild) return { ran: false, reason: "test_guild_unavailable" };
  assertBoosterMutation(guild.id, source);

  let members = guild.members?.cache || new Map();
  let authoritativeMemberSnapshot = false;
  if (typeof guild.members?.fetch === "function") {
    try {
      members = await guild.members.fetch();
      authoritativeMemberSnapshot = true;
    } catch (error) {
      console.warn("FIMA booster member refresh failed; preserving prior active state", { message: error.message });
    }
  }
  const activeDiscordUserIds = [];
  for (const member of members?.values?.() || []) {
    if (member?.user?.bot || !asDate(member?.premiumSince || member?.premiumSinceTimestamp)) continue;
    activeDiscordUserIds.push(String(member.id));
    await reconcileCommunityBoosterMember(null, member, { db, source, now });
  }
  if (authoritativeMemberSnapshot) {
    await db.communityBoosterState.updateMany({
      where: { guildId: guild.id, active: true, discordUserId: { notIn: activeDiscordUserIds } },
      data: { active: false, verifiedBoostCount: 0, countProvenance: "authoritative_member_snapshot_inactive", lastObservedAt: now, endedAt: now }
    });
  }
  const rewards = await ensureMonthlyCommunityBoosterRewards({ guildId: guild.id, db, source, now });
  return { ran: true, authoritativeMemberSnapshot, activeMembers: activeDiscordUserIds.length, rewards };
}

export function startCommunityBoosterWorker(client, { db = prisma, source = process.env } = {}) {
  const config = communityBoosterConfig(source);
  if (!config.enabled) return { started: false, reason: "booster_rewards_disabled" };
  if (activeWorkers.has(client)) return { started: false, reason: "already_started" };
  const run = () => runCommunityBoosterWorker(client, { db, source }).catch((error) => {
    console.warn("FIMA community booster worker failed", { message: error.message, code: error.code || null });
  });
  const timer = setInterval(run, config.workerIntervalMs);
  timer.unref?.();
  activeWorkers.set(client, timer);
  void run();
  return { started: true, intervalMs: config.workerIntervalMs, rewardWorkerEnabled: config.rewardWorkerEnabled };
}

export function stopCommunityBoosterWorker(client) {
  const timer = activeWorkers.get(client);
  if (!timer) return false;
  clearInterval(timer);
  activeWorkers.delete(client);
  return true;
}
