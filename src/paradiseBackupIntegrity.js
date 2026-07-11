import crypto from "node:crypto";

export const PARADISE_BACKUP_SCHEMA_VERSION = 1;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

export function paradiseBackupDigest(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex");
}

export function createParadiseBackupEnvelope(payload, now = new Date()) {
  const snapshot = structuredClone(payload || {});
  const counts = {
    categories: Array.isArray(snapshot.categories) ? snapshot.categories.length : 0,
    channels: Array.isArray(snapshot.channels) ? snapshot.channels.length : 0,
    roles: Array.isArray(snapshot.roles) ? snapshot.roles.length : 0,
    autoModRules: Array.isArray(snapshot.autoModRules) ? snapshot.autoModRules.length : 0,
    webhooks: Array.isArray(snapshot.webhooks) ? snapshot.webhooks.length : 0
  };
  return {
    ...snapshot,
    backupSchemaVersion: PARADISE_BACKUP_SCHEMA_VERSION,
    integrity: {
      algorithm: "sha256",
      digest: paradiseBackupDigest(snapshot),
      capturedAt: new Date(now).toISOString(),
      counts,
      validated: true
    }
  };
}

export function validateParadiseBackupEnvelope(backup) {
  if (!backup || backup.backupSchemaVersion !== PARADISE_BACKUP_SCHEMA_VERSION) return { valid: false, code: "backup_schema_invalid" };
  if (backup.integrity?.algorithm !== "sha256" || !/^[a-f0-9]{64}$/i.test(String(backup.integrity?.digest || ""))) {
    return { valid: false, code: "backup_integrity_missing" };
  }
  const { integrity, backupSchemaVersion, ...payload } = backup;
  const expected = paradiseBackupDigest(payload);
  if (expected !== integrity.digest) return { valid: false, code: "backup_checksum_mismatch" };
  return { valid: true, code: "backup_valid", counts: integrity.counts };
}
