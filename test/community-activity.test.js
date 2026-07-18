import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMUNITY_ACTIVITY_PRIZE_DAYS,
  calculateVoiceAccrual,
  communityActivitySeasonWindow,
  grantCommunityActivityReward,
  handleCommunityTextActivity,
  normalizeCommunityText,
  qualifyCommunityTextMessage
} from "../src/communityActivity.js";
import { PARADISE_TEST_GUILD_ID } from "../src/runtimeEnvironment.js";

const enabledSource = Object.freeze({
  COMMUNITY_ACTIVITY_ENABLED: "true",
  DISCORD_MESSAGE_CONTENT_INTENT: "true",
  COMMUNITY_ACTIVITY_TEXT_XP_PER_MESSAGE: "10"
});

function message(overrides = {}) {
  return {
    guildId: PARADISE_TEST_GUILD_ID,
    id: "message-1",
    channelId: "channel-1",
    content: "FIMA topluluğunda bugün birlikte antrenman yapalım.",
    webhookId: null,
    author: { id: "discord-1", bot: false },
    ...overrides
  };
}

test("activity seasons use exact monthly UTC boundaries including December rollover", () => {
  const january = communityActivitySeasonWindow(new Date("2026-01-31T23:59:59.999Z"));
  assert.equal(january.key, "2026-01");
  assert.equal(january.startsAt.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(january.endsAt.toISOString(), "2026-02-01T00:00:00.000Z");

  const december = communityActivitySeasonWindow(new Date("2026-12-31T23:59:59.999Z"));
  assert.equal(december.key, "2026-12");
  assert.equal(december.startsAt.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(december.endsAt.toISOString(), "2027-01-01T00:00:00.000Z");

  const januaryRollover = communityActivitySeasonWindow(new Date("2027-01-01T00:00:00.000Z"));
  assert.equal(januaryRollover.key, "2027-01");
  assert.equal(januaryRollover.startsAt.toISOString(), december.endsAt.toISOString());
  assert.equal(januaryRollover.endsAt.toISOString(), "2027-02-01T00:00:00.000Z");
});

test("both leaderboards use the 15, 10 and 7 day prize mapping", () => {
  assert.deepEqual(COMMUNITY_ACTIVITY_PRIZE_DAYS, { 1: 15, 2: 10, 3: 7 });
});

test("text normalization is stable and qualification retains only a hash", () => {
  const raw = "  FİMA   takımına https://example.com Katıl <@123456789012345678>  ";
  assert.equal(normalizeCommunityText(raw), "fi̇ma takımına <url> katıl <mention>");
  const result = qualifyCommunityTextMessage(message({ content: raw }), { source: enabledSource });
  assert.equal(result.accepted, true);
  assert.match(result.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(result, "content"), false);
  assert.equal(JSON.stringify(result).includes(raw), false);
});

test("text activity fails closed without Message Content intent", () => {
  const result = qualifyCommunityTextMessage(message(), {
    source: { COMMUNITY_ACTIVITY_ENABLED: "true", DISCORD_MESSAGE_CONTENT_INTENT: "false" }
  });
  assert.deepEqual(result, { accepted: false, reason: "message_content_intent_disabled" });
});

test("automated, short and repetitive messages never earn text XP", () => {
  assert.equal(qualifyCommunityTextMessage(message({ author: { id: "discord-1", bot: true } }), { source: enabledSource }).reason, "automated_message");
  assert.equal(qualifyCommunityTextMessage(message({ webhookId: "webhook-1" }), { source: enabledSource }).reason, "automated_message");
  assert.equal(qualifyCommunityTextMessage(message({ content: "selam" }), { source: enabledSource }).reason, "message_too_short_or_repetitive");
  assert.equal(qualifyCommunityTextMessage(message({ content: "aaaaaaaaaaaaaaaa" }), { source: enabledSource }).reason, "message_too_short_or_repetitive");
});

test("voice accrual caps long gaps and preserves sub-minute remainder", () => {
  const result = calculateVoiceAccrual({
    lastAccruedAt: new Date("2026-07-18T10:00:00.000Z"),
    now: new Date("2026-07-18T10:20:00.000Z"),
    previousRemainderSeconds: 35,
    xpPerMinute: 5,
    maxGapSeconds: 360
  });
  assert.deepEqual(result, {
    elapsedSeconds: 360,
    qualifyingMinutes: 6,
    xp: 30,
    resultingRemainderSeconds: 35,
    gapCapped: true
  });
});

test("activity mutations are rejected outside the exact test guild", async () => {
  await assert.rejects(
    handleCommunityTextActivity(message({ guildId: "1419335632324657306" }), {
      source: { ...enabledSource, PARADISE_RUNTIME_ENV: "development" },
      db: {}
    }),
    { code: "test_guild_only" }
  );
});

function rewardDb({ rewards, license }) {
  const state = {
    rewards: rewards.map((reward) => ({ ...reward })),
    license: license ? { ...license } : null,
    grants: [],
    licenseCreates: 0,
    licenseUpdates: 0,
    audits: []
  };
  const db = {
    communityActivityReward: {
      async findUnique({ where }) {
        const reward = state.rewards.find((item) => item.id === where.id);
        if (!reward) return null;
        return { ...reward, entitlementGrant: state.grants.find((grant) => grant.rewardId === reward.id) || null };
      },
      async update({ where, data }) {
        const reward = state.rewards.find((item) => item.id === where.id);
        Object.assign(reward, data);
        return { ...reward };
      }
    },
    user: {
      async findUnique() {
        return { id: "user-1", email: "activity@example.com", discordUserId: "discord-1" };
      }
    },
    macroEntitlementGrant: {
      async findUnique({ where }) {
        return state.grants.find((grant) => grant.idempotencyKey === where.idempotencyKey) || null;
      },
      async create({ data }) {
        const grant = { id: `grant-${state.grants.length + 1}`, ...data };
        state.grants.push(grant);
        return grant;
      }
    },
    license: {
      async findFirst({ where }) {
        if (!state.license || state.license.status !== "active") return null;
        if (where.OR) return state.license.lifetime || state.license.expiresAt == null ? { ...state.license } : null;
        if (where.expiresAt?.gt) return !state.license.lifetime && state.license.expiresAt > where.expiresAt.gt ? { ...state.license } : null;
        return null;
      },
      async update({ where, data }) {
        assert.equal(where.id, state.license.id);
        Object.assign(state.license, data);
        state.licenseUpdates += 1;
        return { ...state.license };
      },
      async create({ data }) {
        state.licenseCreates += 1;
        state.license = { id: `license-${state.licenseCreates}`, ...data };
        return { ...state.license };
      }
    },
    auditLog: {
      async create({ data }) {
        state.audits.push(data);
        return data;
      }
    },
    async $transaction(callback) {
      return callback(db);
    }
  };
  return { db, state };
}

function reward(id, board, days = 15) {
  return {
    id,
    guildId: PARADISE_TEST_GUILD_ID,
    seasonId: "season-1",
    discordUserId: "discord-1",
    board,
    rank: 1,
    days,
    idempotencyKey: `community-activity:season-1:${board}:1`,
    entitlementGrant: null
  };
}

test("reward grants are idempotent and never alter a lifetime license", async () => {
  const { db, state } = rewardDb({
    rewards: [reward("reward-text", "text")],
    license: { id: "license-life", status: "active", lifetime: true, expiresAt: null }
  });
  const options = { db, source: enabledSource, now: new Date("2026-07-18T12:00:00.000Z") };
  const first = await grantCommunityActivityReward("reward-text", options);
  const second = await grantCommunityActivityReward("reward-text", options);
  assert.equal(first.reason, "lifetime_unchanged");
  assert.equal(second.reason, "already_granted");
  assert.equal(state.grants.length, 1);
  assert.equal(state.licenseUpdates, 0);
  assert.equal(state.licenseCreates, 0);
  assert.equal(state.license.id, "license-life");
});

test("text and voice Top 3 rewards use separate keys and stack", async () => {
  const initialExpiry = new Date("2026-08-01T00:00:00.000Z");
  const { db, state } = rewardDb({
    rewards: [reward("reward-text", "text"), reward("reward-voice", "voice")],
    license: { id: "license-timed", status: "active", lifetime: false, expiresAt: initialExpiry }
  });
  const options = { db, source: enabledSource, now: new Date("2026-07-18T12:00:00.000Z") };
  await grantCommunityActivityReward("reward-text", options);
  await grantCommunityActivityReward("reward-voice", options);
  assert.equal(state.grants.length, 2);
  assert.notEqual(state.grants[0].idempotencyKey, state.grants[1].idempotencyKey);
  assert.equal(state.licenseUpdates, 2);
  assert.equal(state.license.expiresAt.toISOString(), "2026-08-31T00:00:00.000Z");
});
