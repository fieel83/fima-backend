import { FIMA_BOT_APPLICATIONS } from "./fimaBotExperienceContract.js";

const DISCORD_ID = /^\d{16,22}$/;
const TYPE = /^[a-z][a-z0-9_]{1,47}$/;

const COMMON_FIELDS = Object.freeze([
  Object.freeze({ name: "discordHandle", type: "text", required: true, maxLength: 64 }),
  Object.freeze({ name: "timezone", type: "text", required: true, maxLength: 80 }),
  Object.freeze({ name: "availability", type: "textarea", required: true, maxLength: 1000 }),
  Object.freeze({ name: "motivation", type: "textarea", required: true, maxLength: 2000 })
]);

const PRIVATE_TYPES = new Set(["clan_mainer", "war_hoster", "tryout_hoster", "referee"]);

function slugFor(application) {
  return application.slug || application.type.replaceAll("_", "-");
}

function policyFor(application) {
  const responseField = Object.freeze({
    name: `${application.type}Response`,
    type: "textarea",
    required: true,
    maxLength: 2000
  });
  const fields = Object.freeze([...COMMON_FIELDS, responseField]);
  const slug = slugFor(application);
  return Object.freeze({
    type: application.type,
    slug,
    family: application.family,
    submission: application.submission,
    publicFormPath: application.pathname,
    guildSettingsPathTemplate: `/fima-bot/dashboard/:guildId/applications/${slug}`,
    submitPath: application.submission === "public"
      ? `/api/fima-bot/applications/${application.type}`
      : `/api/fima-bot/guilds/:guildId/applications/${application.type}`,
    fields,
    allowedFieldNames: Object.freeze(fields.map(field => field.name)),
    reviewMode: application.submission === "public" ? "manual_review" : "guild_private_review",
    applicantAccess: application.submission === "public" ? "account_and_discord" : "guild_private_surface",
    autoGrantRole: false
  });
}

export const FIMA_BOT_APPLICATION_FAMILIES = Object.freeze([
  "Community Staff",
  "Clan Operations",
  "Competitive / TSBTR",
  "Partnership",
  "Creator / Media",
  "Reseller / Affiliate"
]);

export const FIMA_BOT_APPLICATION_POLICIES = Object.freeze(Object.fromEntries(
  Object.values(FIMA_BOT_APPLICATIONS).map(application => [application.type, policyFor(application)])
));

export function fimaBotApplicationSettingsPath(guildId, type) {
  const policy = FIMA_BOT_APPLICATION_POLICIES[String(type || "")];
  if (!DISCORD_ID.test(String(guildId || "")) || !policy) return null;
  return policy.guildSettingsPathTemplate.replace(":guildId", String(guildId));
}

export function resolveFimaBotApplicationSettingsPage(pathname, authorizedGuildIds = []) {
  const match = String(pathname || "").split(/[?#]/, 1)[0]
    .match(/^\/fima-bot\/dashboard\/(\d{16,22})\/applications\/([a-z][a-z0-9-]{1,47})$/);
  if (!match) return null;
  const [, guildId, slug] = match;
  const policy = Object.values(FIMA_BOT_APPLICATION_POLICIES).find(candidate => candidate.slug === slug);
  if (!policy) return null;
  if (!new Set(authorizedGuildIds.map(String)).has(guildId)) {
    return Object.freeze({ kind: "deny", code: "guild_not_authorized" });
  }
  return Object.freeze({ kind: "page", guildId, policy });
}

export function validateFimaBotApplicationFields(type, submitted = {}) {
  const policy = FIMA_BOT_APPLICATION_POLICIES[String(type || "")];
  if (!policy || !TYPE.test(String(type || ""))) return Object.freeze({ allowed: false, code: "application_type_unknown" });
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) {
    return Object.freeze({ allowed: false, code: "application_fields_invalid" });
  }
  const submittedKeys = Object.keys(submitted);
  if (submittedKeys.some(key => !policy.allowedFieldNames.includes(key))) {
    return Object.freeze({ allowed: false, code: "application_field_forbidden" });
  }
  for (const field of policy.fields) {
    const value = submitted[field.name];
    if (field.required && (typeof value !== "string" || value.trim() === "")) {
      return Object.freeze({ allowed: false, code: "application_field_required", field: field.name });
    }
    if (value !== undefined && (typeof value !== "string" || value.length > field.maxLength)) {
      return Object.freeze({ allowed: false, code: "application_field_invalid", field: field.name });
    }
  }
  return Object.freeze({ allowed: true, code: policy.reviewMode, type: policy.type, autoGrantRole: false });
}

export function auditFimaBotApplicationRegistry() {
  const policies = Object.values(FIMA_BOT_APPLICATION_POLICIES);
  const families = new Set(policies.map(policy => policy.family));
  const publicCount = policies.filter(policy => policy.submission === "public").length;
  const privateCount = policies.filter(policy => policy.submission === "guild_private").length;
  return Object.freeze({
    valid: policies.length === 21
      && families.size === FIMA_BOT_APPLICATION_FAMILIES.length
      && FIMA_BOT_APPLICATION_FAMILIES.every(family => families.has(family))
      && publicCount === 17
      && privateCount === PRIVATE_TYPES.size
      && [...PRIVATE_TYPES].every(type => FIMA_BOT_APPLICATION_POLICIES[type]?.submission === "guild_private")
      && policies.every(policy => policy.fields.length === 5 && policy.autoGrantRole === false),
    policyCount: policies.length,
    familyCount: families.size,
    publicCount,
    privateCount
  });
}
