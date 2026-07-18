import crypto from "node:crypto";
import { prisma } from "./db.js";
import { generateUniqueLicenseKey } from "./license.js";
import { PARADISE_TEST_GUILD_ID, assertParadiseTestGuildMutation } from "./runtimeEnvironment.js";

export const COMMUNITY_ACTIVITY_PRIZE_DAYS = Object.freeze({ 1: 15, 2: 10, 3: 7 });
export const COMMUNITY_ACTIVITY_BOARDS = Object.freeze(["text", "voice"]);

const activeWorkers = new WeakMap();

function intFromEnv(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function enabled(value) {
  return String(value || "false").trim().toLowerCase() === "true";
}

export function communityActivityConfig(source = process.env) {
  return Object.freeze({
    enabled: enabled(source.COMMUNITY_ACTIVITY_ENABLED),
    rewardWorkerEnabled: enabled(source.COMMUNITY_ACTIVITY_REWARD_WORKER_ENABLED),
    messageContentIntent: enabled(source.DISCORD_MESSAGE_CONTENT_INTENT),
    textXpPerMessage: intFromEnv(source.COMMUNITY_ACTIVITY_TEXT_XP_PER_MESSAGE, 10, { min: 1, max: 100 }),
    voiceXpPerMinute: intFromEnv(source.COMMUNITY_ACTIVITY_VOICE_XP_PER_MINUTE, 5, { min: 1, max: 100 }),
    workerIntervalMs: intFromEnv(source.COMMUNITY_ACTIVITY_WORKER_INTERVAL_MS, 300_000, { min: 60_000, max: 3_600_000 }),
    textHashCooldownSeconds: intFromEnv(source.COMMUNITY_ACTIVITY_TEXT_HASH_COOLDOWN_SECONDS, 300, { min: 30, max: 86_400 }),
    textMaxPerMinute: intFromEnv(source.COMMUNITY_ACTIVITY_TEXT_MAX_PER_MINUTE, 4, { min: 1, max: 20 }),
    voiceMaxGapSeconds: intFromEnv(source.COMMUNITY_ACTIVITY_VOICE_MAX_GAP_SECONDS, 360, { min: 60, max: 900 })
  });
}

export function communityActivitySeasonWindow(input = new Date()) {
  const now = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(now.getTime())) throw new TypeError("invalid_activity_date");
  const startMonth = now.getUTCMonth();
  const startsAt = new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
  const endsAt = new Date(Date.UTC(now.getUTCFullYear(), startMonth + 1, 1));
  return Object.freeze({
    startsAt,
    endsAt,
    key: `${startsAt.getUTCFullYear()}-${String(startsAt.getUTCMonth() + 1).padStart(2, "0")}`
  });
}

export function normalizeCommunityText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/https?:\/\/\S+/gi, " <url> ")
    .replace(/<@!?\d+>|<@&\d+>|<#\d+>/g, " <mention> ")
    .replace(/\s+/g, " ")
    .trim();
}

export function qualifyCommunityTextMessage(message, { source = process.env } = {}) {
  const config = communityActivityConfig(source);
  if (!config.enabled) return { accepted: false, reason: "activity_disabled" };
  if (!config.messageContentIntent) return { accepted: false, reason: "message_content_intent_disabled" };
  if (!message?.guildId || !message?.id || !message?.channelId || !message?.author?.id) return { accepted: false, reason: "incomplete_message" };
  if (message.author.bot || message.webhookId) return { accepted: false, reason: "automated_message" };

  const normalized = normalizeCommunityText(message.content);
  const meaningful = normalized.replace(/<url>|<mention>/g, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const compact = meaningful.replace(/\s/g, "");
  const uniqueCharacters = new Set(compact).size;
  if (compact.length < 8 || uniqueCharacters < 3) return { accepted: false, reason: "message_too_short_or_repetitive" };
  if (/^(.)\1{7,}$/u.test(compact)) return { accepted: false, reason: "message_too_repetitive" };

  return {
    accepted: true,
    contentHash: crypto.createHash("sha256").update(normalized).digest("hex"),
    xp: config.textXpPerMessage
  };
}

function assertActivityMutation(guildId, source) {
  return assertParadiseTestGuildMutation({ guildId, operation: "community_activity_mutation", source });
}

async function ensureSeason(db, guildId, now) {
  const window = communityActivitySeasonWindow(now);
  return db.communityActivitySeason.upsert({
    where: { guildId_startsAt: { guildId, startsAt: window.startsAt } },
    create: { guildId, startsAt: window.startsAt, endsAt: window.endsAt },
    update: {},
  });
}

async function ensureMember(db, season, guildId, discordUserId) {
  return db.communityActivityMember.upsert({
    where: { seasonId_discordUserId: { seasonId: season.id, discordUserId } },
    create: { seasonId: season.id, guildId, discordUserId },
    update: {}
  });
}

export async function handleCommunityTextActivity(message, { db = prisma, source = process.env, now = new Date() } = {}) {
  const qualification = qualifyCommunityTextMessage(message, { source });
  if (!qualification.accepted) return qualification;
  assertActivityMutation(message.guildId, source);
  const config = communityActivityConfig(source);
  const acceptedAt = now instanceof Date ? now : new Date(now);
  const minuteAgo = new Date(acceptedAt.getTime() - 60_000);
  const hashCooldownAt = new Date(acceptedAt.getTime() - config.textHashCooldownSeconds * 1000);

  try {
    return await db.$transaction(async (tx) => {
      const duplicate = await tx.communityTextActivity.findUnique({ where: { messageId: message.id } });
      if (duplicate) return { accepted: false, reason: "duplicate_message" };
      const season = await ensureSeason(tx, message.guildId, acceptedAt);
      const [minuteCount, repeatedHash] = await Promise.all([
        tx.communityTextActivity.count({ where: { seasonId: season.id, discordUserId: message.author.id, acceptedAt: { gte: minuteAgo } } }),
        tx.communityTextActivity.findFirst({
          where: { seasonId: season.id, discordUserId: message.author.id, contentHash: qualification.contentHash, acceptedAt: { gte: hashCooldownAt } },
          select: { id: true }
        })
      ]);
      if (minuteCount >= config.textMaxPerMinute) return { accepted: false, reason: "message_rate_limited" };
      if (repeatedHash) return { accepted: false, reason: "duplicate_content_cooldown" };

      const member = await ensureMember(tx, season, message.guildId, message.author.id);
      await tx.communityTextActivity.create({
        data: {
          seasonId: season.id,
          memberId: member.id,
          guildId: message.guildId,
          discordUserId: message.author.id,
          messageId: message.id,
          channelId: message.channelId,
          contentHash: qualification.contentHash,
          xp: qualification.xp,
          acceptedAt
        }
      });
      const updated = await tx.communityActivityMember.update({
        where: { id: member.id },
        data: { textXp: { increment: qualification.xp }, textMessages: { increment: 1 }, lastTextAt: acceptedAt }
      });
      return { accepted: true, reason: "qualified", xp: qualification.xp, totalXp: updated.textXp, seasonId: season.id };
    });
  } catch (error) {
    if (error?.code === "P2002") return { accepted: false, reason: "duplicate_message" };
    throw error;
  }
}

export function calculateVoiceAccrual({ lastAccruedAt, now = new Date(), previousRemainderSeconds = 0, xpPerMinute = 5, maxGapSeconds = 360 } = {}) {
  const from = lastAccruedAt instanceof Date ? lastAccruedAt : new Date(lastAccruedAt);
  const to = now instanceof Date ? now : new Date(now);
  const rawSeconds = Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));
  const elapsedSeconds = Math.min(rawSeconds, maxGapSeconds);
  const combinedSeconds = Math.max(0, Number(previousRemainderSeconds) || 0) + elapsedSeconds;
  const qualifyingMinutes = Math.floor(combinedSeconds / 60);
  return Object.freeze({
    elapsedSeconds,
    qualifyingMinutes,
    xp: qualifyingMinutes * xpPerMinute,
    resultingRemainderSeconds: combinedSeconds % 60,
    gapCapped: rawSeconds > maxGapSeconds
  });
}

function voiceStateEligible(state, guild) {
  if (!state?.channelId || !state.member || state.member.user?.bot) return false;
  if (state.channelId === guild?.afkChannelId) return false;
  return !state.selfDeaf && !state.serverDeaf && !state.deaf;
}

function currentQualifyingVoiceUsers(guild) {
  const states = [...(guild?.voiceStates?.cache?.values?.() || [])].filter(state => voiceStateEligible(state, guild));
  const byChannel = new Map();
  for (const state of states) {
    const members = byChannel.get(state.channelId) || [];
    members.push(state);
    byChannel.set(state.channelId, members);
  }
  const qualifying = new Map();
  for (const [channelId, members] of byChannel) {
    if (members.length < 2) continue;
    for (const state of members) qualifying.set(state.member.id, channelId);
  }
  return qualifying;
}

async function accrueVoiceSession(db, session, { now, config, close }) {
  const accrualUntil = session.season?.endsAt && session.season.endsAt < now ? session.season.endsAt : now;
  const calculation = calculateVoiceAccrual({
    lastAccruedAt: session.lastAccruedAt,
    now: accrualUntil,
    previousRemainderSeconds: session.member.voiceRemainderSeconds,
    xpPerMinute: config.voiceXpPerMinute,
    maxGapSeconds: config.voiceMaxGapSeconds
  });
  const shouldClose = close || accrualUntil < now;
  await db.$transaction(async (tx) => {
    await tx.communityActivityMember.update({
      where: { id: session.memberId },
      data: {
        voiceXp: { increment: calculation.xp },
        voiceSeconds: { increment: calculation.elapsedSeconds },
        voiceRemainderSeconds: calculation.resultingRemainderSeconds,
        lastVoiceAt: calculation.elapsedSeconds ? accrualUntil : session.member.lastVoiceAt
      }
    });
    await tx.communityVoiceSession.update({
      where: { id: session.id },
      data: {
        accruedSeconds: { increment: calculation.elapsedSeconds },
        lastAccruedAt: accrualUntil,
        active: !shouldClose,
        leftAt: shouldClose ? accrualUntil : null
      }
    });
  });
  return calculation;
}

export async function reconcileCommunityVoiceGuild(guild, { db = prisma, source = process.env, now = new Date() } = {}) {
  const config = communityActivityConfig(source);
  if (!config.enabled) return { accepted: false, reason: "activity_disabled" };
  const guildId = String(guild?.id || "");
  assertActivityMutation(guildId, source);
  const currentTime = now instanceof Date ? now : new Date(now);
  const season = await ensureSeason(db, guildId, currentTime);
  const qualifying = currentQualifyingVoiceUsers(guild);
  const activeSessions = await db.communityVoiceSession.findMany({
    where: { guildId, active: true },
    include: { member: true, season: true },
    orderBy: { createdAt: "asc" }
  });
  const continuingUsers = new Set();
  let accruedSeconds = 0;
  let closed = 0;

  for (const session of activeSessions) {
    const currentChannelId = qualifying.get(session.discordUserId);
    const continues = session.seasonId === season.id && currentChannelId === session.channelId && !continuingUsers.has(session.discordUserId);
    const result = await accrueVoiceSession(db, session, { now: currentTime, config, close: !continues });
    accruedSeconds += result.elapsedSeconds;
    if (continues) continuingUsers.add(session.discordUserId);
    else closed += 1;
  }

  let opened = 0;
  for (const [discordUserId, channelId] of qualifying) {
    if (continuingUsers.has(discordUserId)) continue;
    const member = await ensureMember(db, season, guildId, discordUserId);
    await db.communityVoiceSession.create({
      data: {
        seasonId: season.id,
        memberId: member.id,
        guildId,
        discordUserId,
        channelId,
        joinedAt: currentTime,
        lastAccruedAt: currentTime
      }
    });
    opened += 1;
  }
  return { accepted: true, reason: "voice_reconciled", seasonId: season.id, qualifyingUsers: qualifying.size, opened, closed, accruedSeconds };
}

export async function handleCommunityVoiceActivity(oldState, newState, options = {}) {
  const guild = newState?.guild || oldState?.guild;
  if (!guild) return { accepted: false, reason: "missing_guild" };
  return reconcileCommunityVoiceGuild(guild, options);
}

function assertActivityReadGuild(guildId) {
  if (String(guildId || "") !== PARADISE_TEST_GUILD_ID) {
    const error = new Error("activity_test_guild_only");
    error.code = "activity_test_guild_only";
    throw error;
  }
}

async function findSeasonForDate(db, guildId, now) {
  const window = communityActivitySeasonWindow(now);
  return db.communityActivitySeason.findUnique({ where: { guildId_startsAt: { guildId, startsAt: window.startsAt } } });
}

export async function communityActivityLeaderboard({ guildId, board = "text", limit = 10, now = new Date(), db = prisma } = {}) {
  assertActivityReadGuild(guildId);
  const normalizedBoard = COMMUNITY_ACTIVITY_BOARDS.includes(board) ? board : "text";
  const season = await findSeasonForDate(db, guildId, now);
  if (!season) return { guildId, board: normalizedBoard, season: communityActivitySeasonWindow(now), entries: [] };
  const scoreField = normalizedBoard === "voice" ? "voiceXp" : "textXp";
  const secondaryField = normalizedBoard === "voice" ? "voiceSeconds" : "textMessages";
  const members = await db.communityActivityMember.findMany({
    where: { seasonId: season.id, [scoreField]: { gt: 0 } },
    orderBy: [{ [scoreField]: "desc" }, { [secondaryField]: "desc" }, { discordUserId: "asc" }],
    take: Math.min(50, Math.max(1, Number(limit) || 10))
  });
  return {
    guildId,
    board: normalizedBoard,
    season,
    entries: members.map((member, index) => ({
      rank: index + 1,
      discordUserId: member.discordUserId,
      xp: member[scoreField],
      textMessages: member.textMessages,
      voiceSeconds: member.voiceSeconds
    }))
  };
}

export async function communityActivityRank({ guildId, discordUserId, now = new Date(), db = prisma } = {}) {
  assertActivityReadGuild(guildId);
  const result = { guildId, discordUserId, season: null, text: null, voice: null };
  const season = await findSeasonForDate(db, guildId, now);
  result.season = season || communityActivitySeasonWindow(now);
  if (!season) return result;
  const member = await db.communityActivityMember.findUnique({ where: { seasonId_discordUserId: { seasonId: season.id, discordUserId } } });
  if (!member) return result;
  for (const board of COMMUNITY_ACTIVITY_BOARDS) {
    const scoreField = board === "voice" ? "voiceXp" : "textXp";
    const ahead = await db.communityActivityMember.count({ where: { seasonId: season.id, [scoreField]: { gt: member[scoreField] } } });
    result[board] = {
      rank: member[scoreField] > 0 ? ahead + 1 : null,
      xp: member[scoreField],
      textMessages: member.textMessages,
      voiceSeconds: member.voiceSeconds
    };
  }
  return result;
}

export async function communityActivityRewards({ guildId, discordUserId, db = prisma } = {}) {
  assertActivityReadGuild(guildId);
  return db.communityActivityReward.findMany({
    where: { guildId, discordUserId },
    include: { season: true, entitlementGrant: true },
    orderBy: [{ createdAt: "desc" }, { board: "asc" }],
    take: 25
  });
}

export async function grantCommunityActivityReward(rewardId, { db = prisma, source = process.env, now = new Date() } = {}) {
  const reward = await db.communityActivityReward.findUnique({ where: { id: rewardId }, include: { entitlementGrant: true } });
  if (!reward) return { granted: false, reason: "reward_not_found" };
  assertActivityMutation(reward.guildId, source);
  if (reward.entitlementGrant) return { granted: true, reason: "already_granted", reward };
  const user = await db.user.findUnique({ where: { discordUserId: reward.discordUserId } });
  if (!user) {
    await db.communityActivityReward.update({ where: { id: reward.id }, data: { status: "blocked", reason: "account_not_linked" } });
    return { granted: false, reason: "account_not_linked", reward };
  }

  try {
    return await db.$transaction(async (tx) => {
      const alreadyGranted = await tx.macroEntitlementGrant.findUnique({ where: { idempotencyKey: reward.idempotencyKey } });
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
            plan: "2weeks",
            status: "active",
            expiresAt: resultingExpiresAt,
            lifetime: false,
            notes: `community_activity_reward season:${reward.seasonId} board:${reward.board} rank:${reward.rank} days:${reward.days}`
          }
        });
      }
      const grant = await tx.macroEntitlementGrant.create({
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
      await tx.communityActivityReward.update({
        where: { id: reward.id },
        data: { status: "granted", reason: null, userId: user.id, licenseId: license?.id || null, grantedAt: now }
      });
      await tx.auditLog.create({
        data: {
          action: "community_activity_macro_entitlement_granted",
          targetType: "community_activity_reward",
          targetId: reward.id,
          metadata: { guildId: reward.guildId, seasonId: reward.seasonId, board: reward.board, rank: reward.rank, days: reward.days, userId: user.id, licenseId: license?.id || null, entitlementAction: action }
        }
      });
      return { granted: true, reason: action, reward, grant, license };
    });
  } catch (error) {
    if (error?.code === "P2002") return { granted: true, reason: "already_granted" };
    throw error;
  }
}

export async function finalizeCommunityActivitySeason(seasonId, { db = prisma, source = process.env, now = new Date() } = {}) {
  const season = await db.communityActivitySeason.findUnique({ where: { id: seasonId } });
  if (!season) return { finalized: false, reason: "season_not_found" };
  assertActivityMutation(season.guildId, source);
  if (season.endsAt > now) return { finalized: false, reason: "season_not_ended" };

  for (const board of COMMUNITY_ACTIVITY_BOARDS) {
    const scoreField = board === "voice" ? "voiceXp" : "textXp";
    const secondaryField = board === "voice" ? "voiceSeconds" : "textMessages";
    const winners = await db.communityActivityMember.findMany({
      where: { seasonId: season.id, [scoreField]: { gt: 0 } },
      orderBy: [{ [scoreField]: "desc" }, { [secondaryField]: "desc" }, { discordUserId: "asc" }],
      take: 3
    });
    for (const [index, member] of winners.entries()) {
      const rank = index + 1;
      await db.communityActivityReward.upsert({
        where: { seasonId_board_rank: { seasonId: season.id, board, rank } },
        create: {
          seasonId: season.id,
          memberId: member.id,
          guildId: season.guildId,
          discordUserId: member.discordUserId,
          board,
          rank,
          days: COMMUNITY_ACTIVITY_PRIZE_DAYS[rank],
          score: member[scoreField],
          idempotencyKey: `community-activity:${season.id}:${board}:${rank}`,
          metadata: { scoring: scoreField, secondary: secondaryField }
        },
        update: {}
      });
    }
  }
  await db.communityActivitySeason.update({ where: { id: season.id }, data: { status: "finalized", finalizedAt: season.finalizedAt || now } });
  const pendingRewards = await db.communityActivityReward.findMany({ where: { seasonId: season.id, status: { in: ["pending", "blocked"] } } });
  const grants = [];
  for (const reward of pendingRewards) grants.push(await grantCommunityActivityReward(reward.id, { db, source, now }));
  return { finalized: true, seasonId: season.id, rewardCount: pendingRewards.length, grants };
}

export async function runCommunityActivityWorker(client, { db = prisma, source = process.env, now = new Date() } = {}) {
  const config = communityActivityConfig(source);
  if (!config.enabled) return { ran: false, reason: "activity_disabled" };
  const guild = client?.guilds?.cache?.get?.(PARADISE_TEST_GUILD_ID) || null;
  if (!guild) return { ran: false, reason: "test_guild_unavailable" };
  const voice = await reconcileCommunityVoiceGuild(guild, { db, source, now });
  const finalized = [];
  if (config.rewardWorkerEnabled) {
    const ended = await db.communityActivitySeason.findMany({ where: { guildId: PARADISE_TEST_GUILD_ID, endsAt: { lte: now }, status: { in: ["active", "finalized"] } } });
    for (const season of ended) finalized.push(await finalizeCommunityActivitySeason(season.id, { db, source, now }));
  }
  return { ran: true, voice, finalized };
}

export function startCommunityActivityWorker(client, { db = prisma, source = process.env } = {}) {
  const config = communityActivityConfig(source);
  if (!config.enabled) return { started: false, reason: "activity_disabled" };
  if (activeWorkers.has(client)) return { started: false, reason: "already_started" };
  const run = () => runCommunityActivityWorker(client, { db, source }).catch(error => {
    console.warn("FIMA community activity worker failed", { message: error.message, code: error.code || null });
  });
  const timer = setInterval(run, config.workerIntervalMs);
  timer.unref?.();
  activeWorkers.set(client, timer);
  void run();
  return { started: true, intervalMs: config.workerIntervalMs, rewardWorkerEnabled: config.rewardWorkerEnabled };
}

export function stopCommunityActivityWorker(client) {
  const timer = activeWorkers.get(client);
  if (!timer) return false;
  clearInterval(timer);
  activeWorkers.delete(client);
  return true;
}
