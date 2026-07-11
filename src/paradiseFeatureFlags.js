import { PARADISE_TEST_GUILD_ID } from "./runtimeEnvironment.js";

export const PARADISE_FEATURE_STATES = Object.freeze(["disabled", "owner_only", "test_guild", "allowlist", "enabled"]);
export const PARADISE_HIGH_RISK_FEATURES = Object.freeze([
  "ai_assistant", "ticket_ai", "profile_transfer", "premium_billing", "social_feeds", "challenge_transaction",
  "template_repair", "scheduled_rewards", "automod_destructive_actions", "production_license_repair",
  "command_registry_enforcement", "reconciliation_health"
]);

export const PARADISE_MILESTONE_ONE_FEATURE_DEFAULTS = Object.freeze({
  // The new command enforcement path is canaried only in the exact disposable
  // guild until interaction and restart evidence exists.
  command_registry_enforcement: Object.freeze({ state: "test_guild", guildAllowlist: [], userAllowlist: [] }),
  reconciliation_health: Object.freeze({ state: "test_guild", guildAllowlist: [], userAllowlist: [] })
});

const SAFE_MILESTONE_ONE_STATES = new Set(["disabled", "owner_only", "test_guild", "allowlist"]);

function normalizeState(value) {
  return PARADISE_FEATURE_STATES.includes(value) ? value : "disabled";
}

export function resolveParadiseFeatureFlag({ feature, flags = {}, guildId, userId, isOwner = false, testGuildId = PARADISE_TEST_GUILD_ID } = {}) {
  const config = flags?.[feature] || PARADISE_MILESTONE_ONE_FEATURE_DEFAULTS[feature] || {};
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

export function normalizeParadiseFeatureFlags(flags = {}) {
  if (!flags || typeof flags !== "object" || Array.isArray(flags)) {
    const error = new Error("invalid_feature_flags");
    error.code = "invalid_feature_flags";
    throw error;
  }
  const normalized = {};
  for (const feature of PARADISE_HIGH_RISK_FEATURES) {
    const input = flags[feature];
    if (!input) continue;
    const state = normalizeState(input.state);
    if (!SAFE_MILESTONE_ONE_STATES.has(state)) {
      const error = new Error("feature_global_enable_blocked");
      error.code = "feature_global_enable_blocked";
      error.feature = feature;
      throw error;
    }
    const guildAllowlist = [...new Set((Array.isArray(input.guildAllowlist) ? input.guildAllowlist : [])
      .map(value => String(value || "").trim()).filter(Boolean))].slice(0, 50);
    const userAllowlist = [...new Set((Array.isArray(input.userAllowlist) ? input.userAllowlist : [])
      .map(value => String(value || "").trim()).filter(Boolean))].slice(0, 50);
    normalized[feature] = { state, guildAllowlist, userAllowlist };
  }
  return normalized;
}
