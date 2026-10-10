import { PARADISE_TEST_GUILD_ID, resolveRuntimeEnvironment } from "./runtimeEnvironment.js";

export const FIMA_COMMUNITY_PRODUCTION_GUILD_ID = "1419335632324657306";

function enabled(value) {
  return String(value || "false").trim().toLowerCase() === "true";
}

export function communityProductionRewardsEnabled(source = process.env) {
  return enabled(source.FIMA_COMMUNITY_PRODUCTION_REWARDS_ENABLED);
}

export function communityRewardGuildPolicy({ guildId, source = process.env } = {}) {
  const targetGuildId = String(guildId || "").trim();
  const environment = resolveRuntimeEnvironment(source);
  const productionFlagEnabled = communityProductionRewardsEnabled(source);
  if (!targetGuildId) return { allowed: false, code: "missing_guild_id", environment, productionFlagEnabled };
  if (targetGuildId === PARADISE_TEST_GUILD_ID) {
    return { allowed: true, code: "test_guild_allowed", environment, productionFlagEnabled };
  }
  if (targetGuildId !== FIMA_COMMUNITY_PRODUCTION_GUILD_ID) {
    return { allowed: false, code: "community_guild_not_allowed", environment, productionFlagEnabled };
  }
  if (!environment.production) {
    return { allowed: false, code: "production_rewards_require_production_runtime", environment, productionFlagEnabled };
  }
  if (!productionFlagEnabled) {
    return { allowed: false, code: "production_rewards_disabled", environment, productionFlagEnabled };
  }
  return { allowed: true, code: "production_guild_allowed", environment, productionFlagEnabled };
}

export function assertCommunityRewardGuild(input = {}) {
  const policy = communityRewardGuildPolicy(input);
  if (policy.allowed) return policy;
  const error = new Error(policy.code);
  error.code = policy.code;
  error.policy = policy;
  throw error;
}

export function isCommunityRewardGuild(guildId, source = process.env) {
  return communityRewardGuildPolicy({ guildId, source }).allowed;
}

export function communityRewardGuildIds(source = process.env) {
  const ids = [PARADISE_TEST_GUILD_ID];
  if (isCommunityRewardGuild(FIMA_COMMUNITY_PRODUCTION_GUILD_ID, source)) ids.push(FIMA_COMMUNITY_PRODUCTION_GUILD_ID);
  return ids;
}

// XP and cosmetic roles do not grant paid entitlements.
export function communityActivityGuildPolicy({ guildId, source = process.env } = {}) {
  const policy = communityRewardGuildPolicy({ guildId, source });
  if (policy.code !== "production_rewards_disabled") return policy;
  return enabled(source.COMMUNITY_ACTIVITY_ENABLED)
    ? { ...policy, allowed: true, code: "production_activity_allowed" }
    : { ...policy, code: "production_activity_disabled" };
}

export function assertCommunityActivityGuild(input = {}) {
  const policy = communityActivityGuildPolicy(input);
  if (policy.allowed) return policy;
  const error = new Error(policy.code);
  error.code = policy.code;
  error.policy = policy;
  throw error;
}

export function isCommunityActivityGuild(guildId, source = process.env) {
  return communityActivityGuildPolicy({ guildId, source }).allowed;
}

export function communityActivityGuildIds(source = process.env) {
  const ids = [PARADISE_TEST_GUILD_ID];
  if (communityActivityGuildPolicy({ guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID, source }).allowed) ids.push(FIMA_COMMUNITY_PRODUCTION_GUILD_ID);
  return ids;
}
