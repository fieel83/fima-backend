import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMUNITY_BOOSTER_DAYS_PER_BOOST,
  communityBoosterRewardDays,
  ensureMonthlyCommunityBoosterRewards,
  grantCommunityBoosterReward,
  observeCommunityBoostMessage,
  reconcileCommunityBoosterMember
} from "../src/communityBooster.js";
import { PARADISE_TEST_GUILD_ID } from "../src/runtimeEnvironment.js";

const enabledSource = Object.freeze({
  COMMUNITY_BOOSTER_REWARDS_ENABLED: "true",
  COMMUNITY_BOOSTER_REWARD_WORKER_ENABLED: "true",
  COMMUNITY_BOOSTER_MAX_BOOSTS_PER_MEMBER: "50"
});

function clone(value) {
  if (value == null) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(clone);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  return value;
}

function matchesRewardWhere(reward, where) {
  if (where.guildId && reward.guildId !== where.guildId) return false;
  if (where.periodStartsAt && reward.periodStartsAt.getTime() !== where.periodStartsAt.getTime()) return false;
  if (where.status?.in && !where.status.in.includes(reward.status)) return false;
  return true;
}

function boosterDb({ user = { id: "user-1", email: "booster@example.com", discordUserId: "discord-1" }, license = null } = {}) {
  const state = {
    users: user ? [clone(user)] : [],
    licenses: license ? [clone(license)] : [],
    boosterStates: [],
    observations: [],
    rewards: [],
    grants: [],
    audits: [],
    licenseCreates: 0,
    licenseUpdates: 0
  };

  const db = {
    communityBoosterState: {
      async findUnique({ where }) {
        const key = where.guildId_discordUserId;
        return clone(state.boosterStates.find((item) => item.guildId === key.guildId && item.discordUserId === key.discordUserId) || null);
      },
      async upsert({ where, create, update }) {
        const key = where.guildId_discordUserId;
        let row = state.boosterStates.find((item) => item.guildId === key.guildId && item.discordUserId === key.discordUserId);
        if (row) Object.assign(row, clone(update));
        else {
          row = { id: `state-${state.boosterStates.length + 1}`, ...clone(create) };
          state.boosterStates.push(row);
        }
        return clone(row);
      },
      async findMany({ where }) {
        return clone(state.boosterStates.filter((item) =>
          item.guildId === where.guildId
          && item.active === where.active
          && item.verifiedBoostCount > where.verifiedBoostCount.gt
        ));
      }
    },
    communityBoosterObservation: {
      async findUnique({ where }) {
        return clone(state.observations.find((item) => item.messageId === where.messageId) || null);
      },
      async create({ data }) {
        if (state.observations.some((item) => item.messageId === data.messageId)) {
          const error = new Error("duplicate observation");
          error.code = "P2002";
          throw error;
        }
        const row = { id: `observation-${state.observations.length + 1}`, ...clone(data) };
        state.observations.push(row);
        return clone(row);
      }
    },
    communityBoosterReward: {
      async upsert({ where, create }) {
        const key = where.guildId_periodStartsAt_discordUserId_boostOrdinal;
        let row = state.rewards.find((item) =>
          item.guildId === key.guildId
          && item.periodStartsAt.getTime() === key.periodStartsAt.getTime()
          && item.discordUserId === key.discordUserId
          && item.boostOrdinal === key.boostOrdinal
        );
        if (!row) {
          row = {
            id: `reward-${state.rewards.length + 1}`,
            status: "pending",
            reason: null,
            grantedAt: null,
            userId: null,
            licenseId: null,
            ...clone(create)
          };
          state.rewards.push(row);
        }
        return clone(row);
      },
      async findMany({ where }) {
        return clone(state.rewards.filter((item) => matchesRewardWhere(item, where)));
      },
      async findUnique({ where }) {
        const row = state.rewards.find((item) => item.id === where.id);
        return row ? { ...clone(row), entitlementGrant: clone(state.grants.find((grant) => grant.rewardId === row.id) || null) } : null;
      },
      async update({ where, data }) {
        const row = state.rewards.find((item) => item.id === where.id);
        Object.assign(row, clone(data));
        return clone(row);
      }
    },
    user: {
      async findUnique({ where }) {
        return clone(state.users.find((item) => item.discordUserId === where.discordUserId) || null);
      }
    },
    macroBoosterEntitlementGrant: {
      async findUnique({ where }) {
        return clone(state.grants.find((item) => item.idempotencyKey === where.idempotencyKey) || null);
      },
      async create({ data }) {
        if (state.grants.some((item) => item.idempotencyKey === data.idempotencyKey)) {
          const error = new Error("duplicate grant");
          error.code = "P2002";
          throw error;
        }
        const row = { id: `grant-${state.grants.length + 1}`, ...clone(data) };
        state.grants.push(row);
        return clone(row);
      }
    },
    license: {
      async findUnique() {
        return null;
      },
      async findFirst({ where }) {
        const row = state.licenses.find((item) => {
          if (item.status !== "active" || item.customerEmail.toLowerCase() !== where.customerEmail.equals.toLowerCase()) return false;
          if (where.OR) return item.lifetime || item.expiresAt == null;
          if (where.expiresAt?.gt) return !item.lifetime && item.expiresAt > where.expiresAt.gt;
          return false;
        });
        return clone(row || null);
      },
      async update({ where, data }) {
        const row = state.licenses.find((item) => item.id === where.id);
        Object.assign(row, clone(data));
        state.licenseUpdates += 1;
        return clone(row);
      },
      async create({ data }) {
        const row = { id: `license-${state.licenses.length + 1}`, createdAt: new Date(), ...clone(data) };
        state.licenses.push(row);
        state.licenseCreates += 1;
        return clone(row);
      }
    },
    auditLog: {
      async create({ data }) {
        state.audits.push(clone(data));
        return clone(data);
      }
    },
    async $transaction(callback) {
      return callback(db);
    }
  };

  return { db, state };
}

function member({ active = true, premiumSince = "2026-07-18T10:00:00.000Z" } = {}) {
  return {
    id: "discord-1",
    guild: { id: PARADISE_TEST_GUILD_ID },
    user: { id: "discord-1", bot: false },
    premiumSince: active ? new Date(premiumSince) : null
  };
}

function boostMessage(id, createdAt = "2026-07-18T10:00:10.000Z") {
  return {
    id,
    type: 8,
    guildId: PARADISE_TEST_GUILD_ID,
    author: { id: "discord-1", bot: false },
    member: member(),
    createdAt: new Date(createdAt)
  };
}

test("each verified boost is worth exactly three days", () => {
  assert.equal(COMMUNITY_BOOSTER_DAYS_PER_BOOST, 3);
  assert.equal(communityBoosterRewardDays(1), 3);
  assert.equal(communityBoosterRewardDays(2), 6);
});

test("first event confirms the member fallback and a second unique event increments it", async () => {
  const { db, state } = boosterDb();
  const now = new Date("2026-07-18T10:00:15.000Z");
  await reconcileCommunityBoosterMember(null, member(), { db, source: enabledSource, now });
  const first = await observeCommunityBoostMessage(boostMessage("boost-message-1"), { db, source: enabledSource, now });
  const duplicate = await observeCommunityBoostMessage(boostMessage("boost-message-1"), { db, source: enabledSource, now });
  const second = await observeCommunityBoostMessage(boostMessage("boost-message-2", "2026-07-18T10:05:00.000Z"), {
    db,
    source: enabledSource,
    now: new Date("2026-07-18T10:05:01.000Z")
  });
  assert.equal(first.boostCount, 1);
  assert.equal(duplicate.reason, "duplicate_boost_message");
  assert.equal(second.boostCount, 2);
  assert.equal(state.observations.length, 2);
  assert.equal(state.boosterStates[0].verifiedBoostCount, 2);
});

test("Discord event time prevents delayed first-event processing from becoming a false second boost", async () => {
  const { db, state } = boosterDb();
  await reconcileCommunityBoosterMember(null, member(), {
    db,
    source: enabledSource,
    now: new Date("2026-07-18T10:00:05.000Z")
  });
  const delayed = await observeCommunityBoostMessage(boostMessage("delayed-boost-message", "2026-07-18T10:00:10.000Z"), {
    db,
    source: enabledSource,
    now: new Date("2026-07-18T10:30:00.000Z")
  });
  assert.equal(delayed.boostCount, 1);
  assert.equal(state.boosterStates[0].lastBoostEventAt.toISOString(), "2026-07-18T10:00:10.000Z");
});

test("a boost event arriving before member reconciliation is still counted once", async () => {
  const { db, state } = boosterDb();
  const first = await observeCommunityBoostMessage(boostMessage("boost-message-1"), {
    db,
    source: enabledSource,
    now: new Date("2026-07-18T10:00:15.000Z")
  });
  const reconciled = await reconcileCommunityBoosterMember(null, member(), {
    db,
    source: enabledSource,
    now: new Date("2026-07-18T10:00:16.000Z")
  });
  assert.equal(first.boostCount, 1);
  assert.equal(reconciled.boostCount, 1);
  assert.equal(state.boosterStates[0].verifiedBoostCount, 1);
});

test("monthly worker is idempotent and a later second boost adds only three more days", async () => {
  const initialExpiry = new Date("2026-08-01T00:00:00.000Z");
  const { db, state } = boosterDb({
    license: { id: "license-timed", customerEmail: "booster@example.com", status: "active", lifetime: false, expiresAt: initialExpiry }
  });
  await reconcileCommunityBoosterMember(null, member(), { db, source: enabledSource, now: new Date("2026-07-18T10:00:00.000Z") });
  const firstRun = await ensureMonthlyCommunityBoosterRewards({ guildId: PARADISE_TEST_GUILD_ID, db, source: enabledSource, now: new Date("2026-07-18T12:00:00.000Z") });
  const repeatedRun = await ensureMonthlyCommunityBoosterRewards({ guildId: PARADISE_TEST_GUILD_ID, db, source: enabledSource, now: new Date("2026-07-19T12:00:00.000Z") });
  await observeCommunityBoostMessage(boostMessage("boost-message-1"), { db, source: enabledSource, now: new Date("2026-07-18T10:00:15.000Z") });
  await observeCommunityBoostMessage(boostMessage("boost-message-2", "2026-07-20T10:00:00.000Z"), { db, source: enabledSource, now: new Date("2026-07-20T10:00:01.000Z") });
  const secondBoostRun = await ensureMonthlyCommunityBoosterRewards({ guildId: PARADISE_TEST_GUILD_ID, db, source: enabledSource, now: new Date("2026-07-20T12:00:00.000Z") });

  assert.equal(firstRun.grants.length, 1);
  assert.equal(repeatedRun.grants.length, 0);
  assert.equal(secondBoostRun.grants.length, 1);
  assert.equal(state.rewards.length, 2);
  assert.equal(state.grants.length, 2);
  assert.equal(state.licenseUpdates, 2);
  assert.equal(state.licenses[0].expiresAt.toISOString(), "2026-08-07T00:00:00.000Z");
});

test("lifetime licenses remain unchanged", async () => {
  const { db, state } = boosterDb({
    license: { id: "license-life", customerEmail: "booster@example.com", status: "active", lifetime: true, expiresAt: null }
  });
  await reconcileCommunityBoosterMember(null, member(), { db, source: enabledSource, now: new Date("2026-07-18T10:00:00.000Z") });
  await ensureMonthlyCommunityBoosterRewards({ guildId: PARADISE_TEST_GUILD_ID, db, source: enabledSource, now: new Date("2026-07-18T12:00:00.000Z") });
  assert.equal(state.grants[0].action, "lifetime_unchanged");
  assert.equal(state.licenseUpdates, 0);
  assert.equal(state.licenseCreates, 0);
  assert.equal(state.licenses[0].expiresAt, null);
});

test("an unlinked booster is blocked and linking later safely retries", async () => {
  const { db, state } = boosterDb({ user: null });
  await reconcileCommunityBoosterMember(null, member(), { db, source: enabledSource, now: new Date("2026-07-18T10:00:00.000Z") });
  const blocked = await ensureMonthlyCommunityBoosterRewards({ guildId: PARADISE_TEST_GUILD_ID, db, source: enabledSource, now: new Date("2026-07-18T12:00:00.000Z") });
  assert.equal(blocked.grants[0].reason, "account_not_linked");
  assert.equal(state.rewards[0].status, "blocked");

  state.users.push({ id: "user-1", email: "booster@example.com", discordUserId: "discord-1" });
  const retried = await ensureMonthlyCommunityBoosterRewards({ guildId: PARADISE_TEST_GUILD_ID, db, source: enabledSource, now: new Date("2026-07-19T12:00:00.000Z") });
  assert.equal(retried.grants[0].granted, true);
  assert.equal(state.rewards[0].status, "granted");
  assert.equal(state.grants.length, 1);
  assert.equal(state.licenses[0].expiresAt.toISOString(), "2026-07-22T12:00:00.000Z");
});

test("unboosting prevents future-month rewards and December rolls into January", async () => {
  const { db, state } = boosterDb();
  await reconcileCommunityBoosterMember(null, member({ premiumSince: "2026-12-20T10:00:00.000Z" }), {
    db,
    source: enabledSource,
    now: new Date("2026-12-20T10:00:00.000Z")
  });
  await ensureMonthlyCommunityBoosterRewards({ guildId: PARADISE_TEST_GUILD_ID, db, source: enabledSource, now: new Date("2026-12-31T23:59:59.000Z") });
  await reconcileCommunityBoosterMember(member({ premiumSince: "2026-12-20T10:00:00.000Z" }), member({ active: false }), {
    db,
    source: enabledSource,
    now: new Date("2027-01-01T00:00:00.000Z")
  });
  await ensureMonthlyCommunityBoosterRewards({ guildId: PARADISE_TEST_GUILD_ID, db, source: enabledSource, now: new Date("2027-01-15T00:00:00.000Z") });
  assert.equal(state.rewards.length, 1);
  assert.equal(state.rewards[0].periodStartsAt.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(state.boosterStates[0].active, false);
});

test("booster mutations are rejected outside the isolated test guild", async () => {
  const { db } = boosterDb();
  await assert.rejects(
    reconcileCommunityBoosterMember(null, {
      ...member(),
      guild: { id: "1419335632324657306" }
    }, { db, source: enabledSource }),
    { code: "test_guild_only" }
  );
  await assert.rejects(
    observeCommunityBoostMessage({
      ...boostMessage("production-boost-message"),
      guildId: "1419335632324657306"
    }, { db, source: enabledSource }),
    { code: "test_guild_only" }
  );
});
