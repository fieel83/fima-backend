import crypto from "node:crypto";

export const PARADISE_CONFIG_SCHEMA_VERSION = 1;
const SENSITIVE_KEY = /(secret|token|password|cookie|license.?key|hwid|webhook|authorization)/i;

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function redactParadiseConfig(value, key = "") {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map(item => redactParadiseConfig(item));
  if (!plainObject(value)) return clone(value);
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactParadiseConfig(childValue, childKey)]));
}

function diffValues(before, after, path = "") {
  const leafKey = path.split(".").at(-1) || "";
  if (SENSITIVE_KEY.test(leafKey)) return [];
  if (Object.is(before, after)) return [];
  const beforeObject = plainObject(before);
  const afterObject = plainObject(after);
  if (!beforeObject || !afterObject) {
    return [{ path: path || "$", before: redactParadiseConfig(before, path), after: redactParadiseConfig(after, path) }];
  }
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.flatMap(key => diffValues(before[key], after[key], path ? `${path}.${key}` : key));
}

export function createParadiseConfigVersion({ guildId, previous = {}, next = {}, actorId = null, source = "unknown", now = new Date() } = {}) {
  const normalizedGuildId = String(guildId || "").trim();
  if (!normalizedGuildId) {
    const error = new Error("guild_id_required");
    error.code = "guild_id_required";
    throw error;
  }
  return {
    versionId: crypto.randomUUID(),
    schemaVersion: PARADISE_CONFIG_SCHEMA_VERSION,
    guildId: normalizedGuildId,
    actorId: actorId ? String(actorId) : null,
    source: String(source || "unknown"),
    createdAt: new Date(now).toISOString(),
    previous: redactParadiseConfig(previous),
    next: redactParadiseConfig(next),
    diff: diffValues(previous, next)
  };
}

export function canRollbackParadiseConfig(version, currentGuildId) {
  return Boolean(version && version.schemaVersion === PARADISE_CONFIG_SCHEMA_VERSION && String(version.guildId) === String(currentGuildId) && plainObject(version.previous));
}
