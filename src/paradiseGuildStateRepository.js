export const PARADISE_GUILD_RECORD_SCHEMA_VERSION = 1;

function required(value, code) {
  const normalized = String(value || "").trim();
  if (normalized) return normalized;
  const error = new Error(code);
  error.code = code;
  throw error;
}

export function paradiseGuildRecordIdentity({ guildId, kind, recordKey } = {}) {
  return Object.freeze({
    guildId: required(guildId, "guild_id_required"),
    kind: required(kind, "guild_record_kind_required"),
    recordKey: required(recordKey, "guild_record_key_required")
  });
}

export function buildParadiseGuildConfigUpsert({ guildId, config, actorId = null, source = "unknown", revision = 1 } = {}) {
  const id = required(guildId, "guild_id_required");
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    const error = new Error("guild_config_object_required");
    error.code = "guild_config_object_required";
    throw error;
  }
  const safeRevision = Math.max(1, Number(revision) || 1);
  const shared = {
    schemaVersion: PARADISE_GUILD_RECORD_SCHEMA_VERSION,
    revision: safeRevision,
    config,
    updatedByUserId: actorId ? String(actorId) : null,
    source: String(source || "unknown")
  };
  return Object.freeze({ where: { guildId: id }, create: { guildId: id, ...shared }, update: shared });
}

export function buildParadiseGuildRecordUpsert({ guildId, kind, recordKey, payload, schemaVersion = PARADISE_GUILD_RECORD_SCHEMA_VERSION } = {}) {
  const identity = paradiseGuildRecordIdentity({ guildId, kind, recordKey });
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    const error = new Error("guild_record_payload_required");
    error.code = "guild_record_payload_required";
    throw error;
  }
  const record = { ...identity, schemaVersion: Math.max(1, Number(schemaVersion) || 1), payload };
  return Object.freeze({
    where: { guildId_kind_recordKey: identity },
    create: record,
    update: { schemaVersion: record.schemaVersion, payload: record.payload }
  });
}

export function assertParadiseGuildRecordScope(record, guildId) {
  if (record && String(record.guildId) === required(guildId, "guild_id_required")) return record;
  const error = new Error("cross_guild_record_access_denied");
  error.code = "cross_guild_record_access_denied";
  throw error;
}
