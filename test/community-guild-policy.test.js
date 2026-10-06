import assert from "node:assert/strict";
import test from "node:test";
import {
  FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
  communityActivityGuildIds,
  communityActivityGuildPolicy,
  communityRewardGuildIds,
  communityRewardGuildPolicy,
  isCommunityRewardGuild
} from "../src/communityGuildPolicy.js";
import { PARADISE_TEST_GUILD_ID } from "../src/runtimeEnvironment.js";
import fs from "node:fs";

const discordBotSource = fs.readFileSync(new URL("../src/discordBot.js", import.meta.url), "utf8");

test("production XP and cosmetic roles run while paid rewards remain disabled", () => {
  const source = { PARADISE_RUNTIME_ENV: "production", COMMUNITY_ACTIVITY_ENABLED: "true" };
  assert.equal(communityActivityGuildPolicy({ guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID, source }).allowed, true);
  assert.deepEqual(communityActivityGuildIds(source), [PARADISE_TEST_GUILD_ID, FIMA_COMMUNITY_PRODUCTION_GUILD_ID]);
  assert.equal(communityRewardGuildPolicy({ guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID, source }).allowed, false);
  assert.equal(communityActivityGuildPolicy({ guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID, source: { ...source, COMMUNITY_ACTIVITY_ENABLED: "false" } }).allowed, false);
  assert.equal(communityActivityGuildPolicy({ guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID, source: { ...source, PARADISE_RUNTIME_ENV: "development" } }).allowed, false);
  assert.equal(communityActivityGuildPolicy({ guildId: "999999999999999999", source }).allowed, false);
});

test("test guild remains allowed without production settings", () => {
  const source = {};
  assert.equal(isCommunityRewardGuild(PARADISE_TEST_GUILD_ID, source), true);
  assert.deepEqual(communityRewardGuildIds(source), [PARADISE_TEST_GUILD_ID]);
});

test("production rewards are denied by default", () => {
  const policy = communityRewardGuildPolicy({
    guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
    source: { PARADISE_RUNTIME_ENV: "production" }
  });
  assert.equal(policy.allowed, false);
  assert.equal(policy.code, "production_rewards_disabled");
});

test("production rewards require production runtime even with the flag", () => {
  const policy = communityRewardGuildPolicy({
    guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
    source: {
      PARADISE_RUNTIME_ENV: "development",
      FIMA_COMMUNITY_PRODUCTION_REWARDS_ENABLED: "true"
    }
  });
  assert.equal(policy.allowed, false);
  assert.equal(policy.code, "production_rewards_require_production_runtime");
});

test("production rewards require both production runtime and explicit flag", () => {
  const source = {
    PARADISE_RUNTIME_ENV: "production",
    FIMA_COMMUNITY_PRODUCTION_REWARDS_ENABLED: "true"
  };
  assert.equal(isCommunityRewardGuild(FIMA_COMMUNITY_PRODUCTION_GUILD_ID, source), true);
  assert.deepEqual(communityRewardGuildIds(source), [
    PARADISE_TEST_GUILD_ID,
    FIMA_COMMUNITY_PRODUCTION_GUILD_ID
  ]);
});

test("unknown guilds are always rejected", () => {
  const policy = communityRewardGuildPolicy({
    guildId: "999999999999999999",
    source: {
      PARADISE_RUNTIME_ENV: "production",
      FIMA_COMMUNITY_PRODUCTION_REWARDS_ENABLED: "true"
    }
  });
  assert.equal(policy.allowed, false);
  assert.equal(policy.code, "community_guild_not_allowed");
});

test("automatic Discord audits report and target only FT Community", () => {
  assert.match(
    discordBotSource,
    /filter\(guild\s*=>\s*\n?\s*String\(guild\.id\s*\|\|\s*""\)\s*===\s*FIMA_COMMUNITY_PRODUCTION_GUILD_ID\s*\)/u
  );
  assert.match(discordBotSource, /targetGuildCount:\s*1\b/u);
  assert.doesNotMatch(discordBotSource, /targetGuildCount:\s*3\b/u);
});
