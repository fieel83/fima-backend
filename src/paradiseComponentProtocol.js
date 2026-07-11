export const PARADISE_COMPONENT_SCHEMA_VERSION = "v1";
const PREFIX = "pv";
const SAFE_PART = /^[A-Za-z0-9_-]{1,40}$/;

function assertSafePart(name, value) {
  const result = String(value || "");
  if (!SAFE_PART.test(result)) {
    const error = new Error(`invalid_component_${name}`);
    error.code = `invalid_component_${name}`;
    throw error;
  }
  return result;
}

export function buildParadiseComponentId({ family, guildId, entityId, action, version = PARADISE_COMPONENT_SCHEMA_VERSION } = {}) {
  const id = [PREFIX, assertSafePart("version", version), assertSafePart("family", family), assertSafePart("guild", guildId), assertSafePart("entity", entityId), assertSafePart("action", action)].join(":");
  if (id.length > 100) {
    const error = new Error("component_custom_id_too_long");
    error.code = "component_custom_id_too_long";
    throw error;
  }
  return id;
}

export function parseParadiseComponentId(customId, { guildId, acceptedVersions = [PARADISE_COMPONENT_SCHEMA_VERSION] } = {}) {
  const parts = String(customId || "").split(":");
  if (parts.length !== 6 || parts[0] !== PREFIX) return { ok: false, code: "component_not_paradise_vnext" };
  const [, version, family, scopedGuildId, entityId, action] = parts;
  if (![version, family, scopedGuildId, entityId, action].every(value => SAFE_PART.test(value))) return { ok: false, code: "component_malformed" };
  if (!acceptedVersions.includes(version)) return { ok: false, code: "component_outdated" };
  if (guildId && String(guildId) !== scopedGuildId) return { ok: false, code: "component_cross_guild" };
  return { ok: true, version, family, guildId: scopedGuildId, entityId, action };
}

export function outdatedParadiseComponentMessage(language = "tr") {
  return language === "tr"
    ? "Bu panel eski sürümde. Bir yetkiliden paneli yenilemesini iste."
    : "This panel is outdated. Ask a staff member to repair it.";
}
