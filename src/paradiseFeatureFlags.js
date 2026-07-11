import { PARADISE_TEST_GUILD_ID } from "./runtimeEnvironment.js";

export const PARADISE_FEATURE_STATES = Object.freeze(["disabled", "owner_only", "test_guild", "allowlist", "enabled"]);
export const PARADISE_HIGH_RISK_FEATURES = Object.freeze([
  "ai_assistant", "ticket_ai", "profile_transfer", "premium_billing", "social_feeds", "challenge_transaction",
  "template_repair", "scheduled_rewards", "automod_destructive_actions", "production_license_repair"
]);

function normalizeState(value) {
  return PARADISE_FEATURE_STATES.includes(value) ? value : "disabled";
}

export function resolveParadiseFeatureFlag({ feature, flags = {}, guildId, userId, isOwner = false, testGuildId = PARADISE_TEST_GUILD_ID } = {}) {
  const config = flags?.[feature] || {};
  const state = normalizeState(config.state);
  const targetGuildId = String(guildId || "");
  const allowedGuilds = new Set(Array.isArray(config.guildAllowlist) ? config.guildAllowlist.map(String) : []);
  const allowedUsers = new Set(Array.isArray(config.userAllowlist) ? config.userAllowlist.map(String) : []);
  const allowed = state === "enabled"
    || (state === "owner_only" && Boolean(isOwner || allowedUsers.has(String(userId || ""))))
    || (state === "test_guild" && targetGuildId === String(testGuildId))
    || (state === "allowlist" && (allowedGuilds.has(targetGuildId) || (isOwner && allowedUsers.has(String(userId || "")))));
  return Object.freeze({ feature: String(feature || ""), state, allowed, guildId: targetGuildId, reason: allowed ? "feature_allowed" : `feature_${state}` });
}

export function assertParadiseFeatureEnabled(input = {}) {
  const result = resolveParadiseFeatureFlag(input);
  if (result.allowed) return result;
  const error = new Error(result.reason);
  error.code = result.reason;
  error.feature = result.feature;
  throw error;
}
