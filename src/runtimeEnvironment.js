export const PARADISE_TEST_GUILD_ID = "1520519015661961257";

const ENVIRONMENTS = new Set(["development", "staging", "production"]);

export function resolveRuntimeEnvironment(source = process.env) {
  const candidates = [
    ["PARADISE_RUNTIME_ENV", source.PARADISE_RUNTIME_ENV],
    ["APP_ENV", source.APP_ENV],
    ["NODE_ENV", source.NODE_ENV]
  ];
  const selected = candidates.find(([, value]) => String(value || "").trim());
  const raw = String(selected?.[1] || "development").trim().toLowerCase();
  const name = ENVIRONMENTS.has(raw) ? raw : "development";
  return Object.freeze({
    name,
    source: selected?.[0] || "implicit-development",
    markerValid: Boolean(selected && ENVIRONMENTS.has(raw)),
    production: name === "production"
  });
}

export function paradiseTestGuildAllowlist(source = process.env) {
  const configured = String(source.PARADISE_TEST_GUILD_IDS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  // The owner-designated template lab remains the only default mutation target.
  return [...new Set([PARADISE_TEST_GUILD_ID, ...configured])];
}

export function paradiseGuildMutationPolicy({ guildId, operation = "read_only", source = process.env } = {}) {
  const environment = resolveRuntimeEnvironment(source);
  const targetGuildId = String(guildId || "").trim();
  const isTestGuild = paradiseTestGuildAllowlist(source).includes(targetGuildId);
  const readOnly = operation === "read_only";
  if (!targetGuildId) return { allowed: false, code: "missing_guild_id", environment, isTestGuild: false };
  if (readOnly) return { allowed: true, code: "read_only", environment, isTestGuild };
  if (isTestGuild) return { allowed: true, code: "test_guild_allowed", environment, isTestGuild };
  if (environment.production) {
    return { allowed: false, code: "production_guild_mutation_blocked", environment, isTestGuild };
  }
  return { allowed: false, code: "non_test_guild_mutation_blocked", environment, isTestGuild };
}

export function assertParadiseGuildMutation(input = {}) {
  const policy = paradiseGuildMutationPolicy(input);
  if (policy.allowed) return policy;
  const error = new Error(policy.code);
  error.code = policy.code;
  error.policy = policy;
  throw error;
}
