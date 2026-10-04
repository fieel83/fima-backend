import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { sanitizeParadiseMutationFailure } from "./paradiseMutationLease.js";

const DEFAULT_ROOT = path.resolve(process.cwd(), "artifacts", "post-security-backlog", "rollback-markers");
const WINDOWS_REPLACE_ERRORS = new Set(["EACCES", "EBUSY", "EEXIST", "ENOTEMPTY", "EPERM"]);
const RESOLVED_STATUSES = new Set(["resolved"]);

function markerError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function safeGuildId(guildId) {
  const value = String(guildId || "").trim();
  if (!/^\d{16,22}$/.test(value)) throw markerError("rollback_marker_guild_id_invalid", { guildId: value });
  return value;
}

export function paradiseRollbackMarkerPath(guildId, { root = DEFAULT_ROOT } = {}) {
  return path.join(path.resolve(root), `${safeGuildId(guildId)}.json`);
}

async function readJson(filePath, fileApi) {
  try {
    return JSON.parse(await fileApi.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw markerError("rollback_marker_corrupt", { markerPath: filePath, cause: error });
  }
}

async function exists(fileApi, filePath) {
  try {
    await fileApi.stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function replaceAtomic(fileApi, temporaryPath, filePath) {
  try {
    await fileApi.rename(temporaryPath, filePath);
    return;
  } catch (error) {
    if (!WINDOWS_REPLACE_ERRORS.has(error?.code)) throw error;
  }
  const backupPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.replace-backup`;
  let movedExisting = false;
  try {
    if (await exists(fileApi, filePath)) {
      await fileApi.rename(filePath, backupPath);
      movedExisting = true;
    }
    await fileApi.rename(temporaryPath, filePath);
    if (movedExisting) await fileApi.rm(backupPath, { force: true });
  } catch (error) {
    if (movedExisting && !await exists(fileApi, filePath) && await exists(fileApi, backupPath)) {
      await fileApi.rename(backupPath, filePath).catch(() => {});
    }
    throw error;
  }
}

async function writeJsonAtomic(filePath, value, fileApi) {
  await fileApi.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fileApi.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    await replaceAtomic(fileApi, temporaryPath, filePath);
  } catch (error) {
    await fileApi.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function readParadiseRollbackMarker(guildId, options = {}) {
  const fileApi = options.fileApi || fs;
  const markerPath = paradiseRollbackMarkerPath(guildId, options);
  const marker = await readJson(markerPath, fileApi);
  if (!marker) return null;
  if (Number(marker.schemaVersion) !== 1 || String(marker.guildId || "") !== safeGuildId(guildId) || !marker.markerId) {
    throw markerError("rollback_marker_schema_invalid", { markerPath, marker });
  }
  return marker;
}

export async function assertNoUnresolvedParadiseRollback(guildId, options = {}) {
  const marker = await readParadiseRollbackMarker(guildId, options);
  if (!marker || RESOLVED_STATUSES.has(marker.status)) return marker;
  throw markerError("unresolved_rollback_marker", {
    marker,
    markerPath: paradiseRollbackMarkerPath(guildId, options)
  });
}

export async function armParadiseRollbackMarker({
  guildId,
  backupArtifact,
  backupDigest,
  mode,
  confirmation,
  correlationId = null
}, options = {}) {
  const id = safeGuildId(guildId);
  await assertNoUnresolvedParadiseRollback(id, options);
  if (!backupArtifact || !/^[a-f0-9]{64}$/i.test(String(backupDigest || ""))) {
    throw markerError("rollback_marker_backup_invalid");
  }
  const now = new Date().toISOString();
  const marker = {
    schemaVersion: 1,
    markerId: crypto.randomUUID(),
    guildId: id,
    status: "armed",
    mode: String(mode || ""),
    confirmation: String(confirmation || ""),
    backupArtifact: String(backupArtifact),
    backupDigest: String(backupDigest).toLowerCase(),
    correlationId: correlationId ? String(correlationId) : null,
    armedAt: now,
    updatedAt: now,
    rollback: null,
    reconciliation: null
  };
  await writeJsonAtomic(paradiseRollbackMarkerPath(id, options), marker, options.fileApi || fs);
  return marker;
}

export async function updateParadiseRollbackMarker(guildId, markerId, changes = {}, options = {}) {
  const id = safeGuildId(guildId);
  const current = await readParadiseRollbackMarker(id, options);
  if (!current) throw markerError("rollback_marker_missing");
  if (String(current.markerId) !== String(markerId || "")) throw markerError("rollback_marker_owner_mismatch");
  const sanitizedChanges = structuredClone(changes);
  for (const key of ["failure", "rollbackError"]) {
    if (sanitizedChanges[key] != null) {
      const fallbackCode = key === "rollbackError" ? "automatic_rollback_failed" : "guild_mutation_failed";
      sanitizedChanges[key] = sanitizeParadiseMutationFailure(sanitizedChanges[key], fallbackCode);
    }
  }
  const next = {
    ...current,
    ...sanitizedChanges,
    schemaVersion: 1,
    markerId: current.markerId,
    guildId: id,
    updatedAt: new Date().toISOString()
  };
  await writeJsonAtomic(paradiseRollbackMarkerPath(id, options), next, options.fileApi || fs);
  return next;
}

export async function resolveParadiseRollbackMarker(guildId, markerId, reconciliation = null, options = {}) {
  return updateParadiseRollbackMarker(guildId, markerId, {
    status: "resolved",
    resolvedAt: new Date().toISOString(),
    reconciliation: reconciliation ? structuredClone(reconciliation) : null
  }, options);
}
