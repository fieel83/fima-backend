import { PARADISE_APPLICATION_TYPES } from "./paradiseApplicationSettings.js";

const WEBSITE_APPLICATION_TYPE_SET = new Set(PARADISE_APPLICATION_TYPES);
const BUSINESS_APPLICATION_TYPES = new Set(["partnership", "creator", "reseller"]);

function accessError(code, statusCode) {
  return Object.assign(new Error(code), { code, statusCode });
}

export function normalizeDiscordOAuthScopes(value) {
  return new Set(String(value || "").split(/\s+/).filter(Boolean));
}

export async function verifyParadiseApplicationOAuthAccess({
  link,
  requestedGuildId = null,
  decryptAccessToken,
  fetchGuildMemberships,
  now = Date.now()
} = {}) {
  if (!link || !String(link.providerSubject || "").trim()) {
    throw accessError("discord_link_required", 409);
  }
  const discordUserId = String(link.providerSubject).trim();
  const scopes = normalizeDiscordOAuthScopes(link.scopes);
  const expiresAt = link.tokenExpiresAt instanceof Date
    ? link.tokenExpiresAt.getTime()
    : Date.parse(String(link.tokenExpiresAt || ""));
  if (!scopes.has("guilds") || !Number.isFinite(expiresAt) || expiresAt <= Number(now)) {
    throw accessError("discord_reauthorization_required", 401);
  }
  const accessToken = decryptAccessToken?.(link.accessTokenCipher);
  if (!accessToken) throw accessError("discord_reauthorization_required", 401);

  let memberships;
  try {
    memberships = await fetchGuildMemberships(accessToken);
  } catch (error) {
    if (error?.code === "discord_reauthorization_required") {
      throw accessError("discord_reauthorization_required", 401);
    }
    throw accessError("discord_membership_unavailable", 503);
  }
  if (!Array.isArray(memberships)) throw accessError("discord_membership_unavailable", 503);

  const guildIds = new Set(memberships.map(item => String(item?.id || "")).filter(Boolean));
  const guildId = String(requestedGuildId || "").trim();
  if (guildId && !guildIds.has(guildId)) {
    throw accessError("discord_membership_required", 403);
  }
  return { discordUserId, guildIds, memberships };
}

export function requireHelperWebsiteApplicationScope(input = {}) {
  const workflow = String(input.workflow || "staff").trim().toLowerCase();
  const type = String(input.type || "helper").trim().toLowerCase();
  if (workflow !== "staff" || type !== "helper") {
    throw accessError("helper_application_scope_required", 400);
  }
  return { workflow: "staff", type: "helper" };
}

export function normalizeWebsiteApplicationScope(input = {}, { requireType = true } = {}) {
  const workflow = String(input.workflow || "staff").trim().toLowerCase();
  if (!new Set(["staff", "business"]).has(workflow)) {
    throw accessError("invalid_application_workflow", 400);
  }

  const rawType = String(input.type || "").trim().toLowerCase();
  if (!rawType) {
    if (requireType) throw accessError("invalid_application_type", 400);
    return { workflow, type: null };
  }
  if (!/^[a-z][a-z0-9_]{0,47}$/.test(rawType)) {
    throw accessError("invalid_application_type", 400);
  }
  if (!WEBSITE_APPLICATION_TYPE_SET.has(rawType)) {
    throw accessError("invalid_application_type", 400);
  }

  const expectedWorkflow = BUSINESS_APPLICATION_TYPES.has(rawType) ? "business" : "staff";
  if (workflow !== expectedWorkflow) {
    throw accessError("invalid_application_workflow_for_type", 400);
  }
  return { workflow, type: rawType };
}
