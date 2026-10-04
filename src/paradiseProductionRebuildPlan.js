import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  paradiseBackupStateDigest,
  validateParadiseBackupEnvelope
} from "./paradiseBackupIntegrity.js";

export const PARADISE_PRODUCTION_REBUILD_PLAN_KIND = "fima_production_rebuild_plan";
export const PARADISE_PRODUCTION_REBUILD_PLAN_SCHEMA_VERSION = 1;
export const PARADISE_PRODUCTION_REBUILD_EXECUTION_PROOF_KIND = "fima_production_rebuild_execution_proof";
export const PARADISE_PRODUCTION_FINALIZATION_RECEIPT_KIND = "fima_production_finalization_receipt";
export const PARADISE_PRODUCTION_FINALIZATION_RECEIPT_INDEX_KIND = "fima_production_finalization_receipt_index";
export const PARADISE_PRODUCTION_REBUILD_PLAN_TTL_MS = 5 * 60 * 1000;
export const PARADISE_PRODUCTION_REBUILD_EXECUTION_PROOF_TTL_MS = 60 * 1000;
export const PARADISE_PRODUCTION_PREFLIGHT_MAX_AGE_MS = 60 * 1000;

const DEFAULT_PLAN_ROOT = path.resolve(
  process.cwd(),
  "artifacts",
  "post-security-backlog",
  "production-rebuild-plans"
);
const PLAN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function planError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonicalize(value[key])])
  );
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function validSecret(secret) {
  return Buffer.byteLength(String(secret || ""), "utf8") >= 32;
}

function requireSecret(secret) {
  const value = String(secret || "");
  if (!validSecret(value)) throw planError("production_rebuild_plan_secret_unavailable");
  return value;
}

function hmac(value, secret) {
  return crypto.createHmac("sha256", secret).update(stableJson(value)).digest("hex");
}

function timingSafeEqualString(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signedRecord(record, secret) {
  const unsigned = { ...record };
  delete unsigned.recordMac;
  return { ...unsigned, recordMac: hmac(unsigned, secret) };
}

function verifyRecord(record, secret) {
  if (!record || record.kind !== PARADISE_PRODUCTION_REBUILD_PLAN_KIND
      || record.schemaVersion !== PARADISE_PRODUCTION_REBUILD_PLAN_SCHEMA_VERSION) {
    throw planError("production_rebuild_plan_schema_invalid");
  }
  const unsigned = { ...record };
  delete unsigned.recordMac;
  const expected = hmac(unsigned, secret);
  if (!timingSafeEqualString(record.recordMac, expected)) {
    throw planError("production_rebuild_plan_authenticity_invalid");
  }
  return record;
}

function verifyFinalizationReceiptRecord(record, secret) {
  if (!record || record.kind !== PARADISE_PRODUCTION_FINALIZATION_RECEIPT_KIND
      || record.schemaVersion !== PARADISE_PRODUCTION_REBUILD_PLAN_SCHEMA_VERSION) {
    throw planError("production_finalization_receipt_schema_invalid");
  }
  const unsigned = { ...record };
  delete unsigned.recordMac;
  if (!timingSafeEqualString(record.recordMac, hmac(unsigned, secret))) {
    throw planError("production_finalization_receipt_authenticity_invalid");
  }
  return record;
}

function verifyFinalizationReceiptIndex(record, secret) {
  if (!record || record.kind !== PARADISE_PRODUCTION_FINALIZATION_RECEIPT_INDEX_KIND
      || record.schemaVersion !== PARADISE_PRODUCTION_REBUILD_PLAN_SCHEMA_VERSION) {
    throw planError("production_finalization_receipt_index_schema_invalid");
  }
  const unsigned = { ...record };
  delete unsigned.recordMac;
  if (!timingSafeEqualString(record.recordMac, hmac(unsigned, secret))) {
    throw planError("production_finalization_receipt_index_authenticity_invalid");
  }
  return record;
}

function normalizedPlanId(planId) {
  const value = String(planId || "").trim().toLowerCase();
  if (!PLAN_ID_PATTERN.test(value)) throw planError("production_rebuild_plan_id_invalid");
  return value;
}

function planPaths(planRoot, planId) {
  const root = path.resolve(planRoot || DEFAULT_PLAN_ROOT);
  const id = normalizedPlanId(planId);
  return {
    root,
    record: path.join(root, "plans", `${id}.json`),
    backup: path.join(root, "backups", `${id}.json`),
    consumeLock: path.join(root, "plans", `${id}.consumed`),
    finalizationReceipt: path.join(root, "finalization-receipts", `${id}.json`)
  };
}

function finalizationReceiptIndexPath(planRoot, guildId) {
  const root = path.resolve(planRoot || DEFAULT_PLAN_ROOT);
  const target = String(guildId || "").trim();
  if (!/^\d{16,22}$/u.test(target)) {
    throw planError("production_finalization_receipt_target_invalid");
  }
  return path.join(root, "finalization-receipts", `${target}.pending.json`);
}

function normalizedFinalizationMarkerId(markerId) {
  const value = String(markerId || "").trim();
  if (!/^[a-z0-9_-]{8,128}$/iu.test(value)) {
    throw planError("production_finalization_receipt_marker_invalid");
  }
  return value;
}

function finalizationReceiptResolvedIndexPath(planRoot, guildId, markerId) {
  const pendingPath = finalizationReceiptIndexPath(planRoot, guildId);
  const marker = normalizedFinalizationMarkerId(markerId);
  return path.join(path.dirname(pendingPath), `${String(guildId).trim()}.${marker}.resolved.json`);
}

async function writeJsonAtomic(filePath, value, fileApi = fs) {
  await fileApi.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    await fileApi.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    await fileApi.rename(temporaryPath, filePath);
  } catch (error) {
    await fileApi.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function writeJsonAtomicExclusive(filePath, value, fileApi = fs) {
  await fileApi.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  try {
    await fileApi.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx"
    });
    await fileApi.link(temporaryPath, filePath);
    await fileApi.rm(temporaryPath, { force: true });
  } catch (error) {
    await fileApi.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

async function readJson(filePath, fileApi = fs, unavailableCode = "production_rebuild_plan_unavailable") {
  try {
    return JSON.parse(await fileApi.readFile(filePath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw planError("production_rebuild_plan_malformed");
    throw planError(unavailableCode);
  }
}

function ownerBinding(ownerUserId) {
  const value = String(ownerUserId || "").trim();
  if (!value) throw planError("production_rebuild_plan_owner_missing");
  return crypto.createHash("sha256").update(`fima-owner-plan\0${value}`).digest("hex");
}

function backupGuildId(backup) {
  return String(backup?.guildId || backup?.guild?.id || "").trim();
}

function exactConfirmation({ guildId, planId, backupDigest }) {
  return `EXECUTE FT COMMUNITY ${guildId} ${planId} ${backupDigest}`;
}

function safeGateSummary(preflight) {
  const byId = new Map((preflight?.checks || []).map(check => [String(check?.id || ""), check]));
  const gate = id => {
    const check = byId.get(id);
    return { ok: check?.ok === true, code: String(check?.code || "missing") };
  };
  return {
    checkedAt: preflight?.checkedAt || null,
    rehearsal: gate("test_guild_rehearsal_pair"),
    rollback: gate("rollback_marker"),
    lease: gate("mutation_lease"),
    backup: gate("backup_restore_scopes")
  };
}

const REQUIRED_PRODUCTION_PREFLIGHT_GATES = Object.freeze([
  "test_guild_rehearsal_pair",
  "rollback_marker",
  "mutation_lease",
  "backup_restore_scopes"
]);

function assertProductionPreflightGates(preflight, nowMs) {
  if (preflight?.ready !== true || !Array.isArray(preflight?.checks)) {
    throw planError(preflight?.code || "production_rebuild_preflight_blocked");
  }
  const checkedAtMs = Date.parse(String(preflight.checkedAt || ""));
  if (!Number.isFinite(checkedAtMs)) {
    throw planError("production_rebuild_preflight_timestamp_invalid");
  }
  if (checkedAtMs > nowMs) {
    throw planError("production_rebuild_preflight_timestamp_future");
  }
  if (nowMs - checkedAtMs > PARADISE_PRODUCTION_PREFLIGHT_MAX_AGE_MS) {
    throw planError("production_rebuild_preflight_stale");
  }

  const gates = new Map();
  for (const check of preflight.checks) {
    const id = String(check?.id || "");
    if (!REQUIRED_PRODUCTION_PREFLIGHT_GATES.includes(id)) continue;
    if (gates.has(id)) throw planError("production_rebuild_preflight_gate_duplicate");
    gates.set(id, check);
  }
  for (const id of REQUIRED_PRODUCTION_PREFLIGHT_GATES) {
    const gate = gates.get(id);
    if (!gate || gate.ok !== true || String(gate.code || "") !== "ok") {
      throw planError(`production_rebuild_preflight_gate_failed:${id}`);
    }
  }

  const rehearsal = gates.get("test_guild_rehearsal_pair")?.details;
  const previousAtMs = Date.parse(String(rehearsal?.previous?.verifiedAt || ""));
  const currentAtMs = Date.parse(String(rehearsal?.current?.verifiedAt || ""));
  const pairVerified = rehearsal?.verifiedCount === 2
    && rehearsal?.provenanceVerified === true
    && rehearsal?.timestampsDistinct === true
    && rehearsal?.signaturesDistinct === true
    && rehearsal?.digestsDistinct === true
    && rehearsal?.chronological === true
    && rehearsal?.previous?.productionUntouched === true
    && rehearsal?.current?.productionUntouched === true
    && Number.isFinite(previousAtMs)
    && Number.isFinite(currentAtMs)
    && previousAtMs < currentAtMs
    && currentAtMs <= checkedAtMs;
  if (!pairVerified) {
    throw planError("production_rebuild_rehearsal_pair_invalid");
  }
}

function publicStatus(record, nowMs = Date.now()) {
  const expired = record.state === "ready" && nowMs >= Date.parse(record.expiresAt);
  return {
    kind: record.kind,
    schemaVersion: record.schemaVersion,
    planId: record.planId,
    state: expired ? "expired" : record.state,
    mode: record.mode,
    guildId: record.guildId,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    usedAt: record.usedAt || null,
    finishedAt: record.finishedAt || null,
    outcome: record.outcome || null,
    backup: {
      digest: record.backupDigest,
      validated: true
    },
    gates: structuredClone(record.gates || {}),
    requiredConfirmation: expired || record.state !== "ready" ? null : record.requiredConfirmation
  };
}

async function readVerifiedRecord({ planId, planRoot, secret, fileApi = fs }) {
  const signingSecret = requireSecret(secret);
  const paths = planPaths(planRoot, planId);
  const record = await readJson(paths.record, fileApi);
  return { record: verifyRecord(record, signingSecret), paths, signingSecret };
}

function validateImmutableRequest(record, { guildId, mode, backupDigest, ownerUserId, confirmation, nowMs }) {
  if (record.state !== "ready") throw planError("production_rebuild_plan_already_used");
  if (nowMs >= Date.parse(record.expiresAt)) throw planError("production_rebuild_plan_expired");
  if (String(guildId || "") !== record.guildId) throw planError("production_rebuild_plan_target_mismatch");
  if (String(mode || "") !== record.mode) throw planError("production_rebuild_plan_mode_mismatch");
  if (!timingSafeEqualString(backupDigest, record.backupDigest)) {
    throw planError("production_rebuild_plan_digest_mismatch");
  }
  if (!timingSafeEqualString(ownerBinding(ownerUserId), record.ownerBinding)) {
    throw planError("production_rebuild_plan_owner_mismatch");
  }
  if (!timingSafeEqualString(confirmation, record.requiredConfirmation)) {
    throw planError("production_rebuild_plan_confirmation_mismatch");
  }
}

async function verifyPersistedBackup(record, paths, fileApi = fs) {
  const backup = await readJson(
    paths.backup,
    fileApi,
    "production_rebuild_plan_backup_unavailable"
  );
  const validation = validateParadiseBackupEnvelope(backup);
  if (!validation.valid) throw planError("production_rebuild_plan_backup_invalid", { validation });
  if (backupGuildId(backup) !== record.guildId) {
    throw planError("production_rebuild_plan_backup_target_mismatch");
  }
  if (!timingSafeEqualString(backup.integrity?.digest, record.backupArtifactDigest)) {
    throw planError("production_rebuild_plan_backup_changed");
  }
  if (!timingSafeEqualString(paradiseBackupStateDigest(backup), record.backupDigest)) {
    throw planError("production_rebuild_plan_backup_state_changed");
  }
  return backup;
}

function finalizationReceiptDigest(receipt) {
  return crypto.createHash("sha256").update(stableJson(receipt)).digest("hex");
}

function assertFinalizationReceiptBinding(receipt, planRecord, expected = {}) {
  const checks = receipt?.verification || {};
  if (receipt.planId !== planRecord.planId
      || receipt.guildId !== planRecord.guildId
      || receipt.mode !== planRecord.mode
      || receipt.outcome !== "completed"
      || planRecord.state !== "completed"
      || planRecord.outcome !== "completed"
      || !timingSafeEqualString(receipt.backupDigest, planRecord.backupDigest)
      || !timingSafeEqualString(receipt.backupArtifactDigest, planRecord.backupArtifactDigest)
      || checks.postAuditVerified !== true
      || checks.communityProfileReadbackVerified !== true
      || checks.botProfileReadbackVerified !== true) {
    throw planError("production_finalization_receipt_binding_invalid");
  }
  if (expected.guildId != null && String(expected.guildId) !== receipt.guildId) {
    throw planError("production_finalization_receipt_target_mismatch");
  }
  if (expected.mode != null && String(expected.mode) !== receipt.mode) {
    throw planError("production_finalization_receipt_mode_mismatch");
  }
  if (expected.markerId != null && String(expected.markerId) !== receipt.markerId) {
    throw planError("production_finalization_receipt_marker_mismatch");
  }
  if (expected.backupDigest != null
      && !timingSafeEqualString(expected.backupDigest, receipt.backupDigest)) {
    throw planError("production_finalization_receipt_digest_mismatch");
  }
}

async function readReceiptForPlan({ planId, planRoot, secret, fileApi = fs, expected = {} }) {
  const current = await readVerifiedRecord({ planId, planRoot, secret, fileApi });
  const receipt = verifyFinalizationReceiptRecord(
    await readJson(
      current.paths.finalizationReceipt,
      fileApi,
      "production_finalization_receipt_unavailable"
    ),
    current.signingSecret
  );
  assertFinalizationReceiptBinding(receipt, current.record, expected);
  await verifyPersistedBackup(current.record, current.paths, fileApi);
  return { receipt, receiptDigest: finalizationReceiptDigest(receipt) };
}

export async function createParadiseProductionFinalizationReceipt({
  planId,
  guildId,
  mode,
  markerId,
  backupDigest,
  postAuditVerified,
  communityProfileReadbackVerified,
  botProfileReadbackVerified,
  planRoot = DEFAULT_PLAN_ROOT,
  secret,
  nowMs = Date.now(),
  fileApi = fs
} = {}) {
  const current = await readVerifiedRecord({ planId, planRoot, secret, fileApi });
  const target = String(guildId || "").trim();
  const normalizedMarkerId = String(markerId || "").trim();
  if (current.record.state !== "completed" || current.record.outcome !== "completed") {
    throw planError("production_finalization_receipt_plan_not_completed");
  }
  if (target !== current.record.guildId || String(mode || "") !== current.record.mode
      || !/^[a-z0-9_-]{8,128}$/iu.test(normalizedMarkerId)
      || !timingSafeEqualString(backupDigest, current.record.backupDigest)) {
    throw planError("production_finalization_receipt_scope_invalid");
  }
  if (postAuditVerified !== true
      || communityProfileReadbackVerified !== true
      || botProfileReadbackVerified !== true) {
    throw planError("production_finalization_receipt_verification_incomplete");
  }
  await verifyPersistedBackup(current.record, current.paths, fileApi);

  const requestedBinding = {
    guildId: target,
    mode: current.record.mode,
    markerId: normalizedMarkerId,
    backupDigest: current.record.backupDigest
  };
  let receipt;
  try {
    ({ receipt } = await readReceiptForPlan({
      planId: current.record.planId,
      planRoot,
      secret,
      fileApi,
      expected: requestedBinding
    }));
  } catch (error) {
    if (error?.code !== "production_finalization_receipt_unavailable") throw error;
  }

  if (!receipt) {
    receipt = signedRecord({
      kind: PARADISE_PRODUCTION_FINALIZATION_RECEIPT_KIND,
      schemaVersion: PARADISE_PRODUCTION_REBUILD_PLAN_SCHEMA_VERSION,
      receiptId: crypto.randomUUID(),
      nonce: crypto.randomBytes(24).toString("base64url"),
      planId: current.record.planId,
      markerId: normalizedMarkerId,
      guildId: target,
      mode: current.record.mode,
      backupDigest: current.record.backupDigest,
      backupArtifactDigest: current.record.backupArtifactDigest,
      outcome: "completed",
      verification: {
        postAuditVerified: true,
        communityProfileReadbackVerified: true,
        botProfileReadbackVerified: true
      },
      createdAt: new Date(nowMs).toISOString()
    }, current.signingSecret);
    try {
      await writeJsonAtomicExclusive(current.paths.finalizationReceipt, receipt, fileApi);
    } catch (error) {
      if (error?.code !== "EEXIST") throw planError("production_finalization_receipt_write_failed");
      ({ receipt } = await readReceiptForPlan({
        planId: current.record.planId,
        planRoot,
        secret,
        fileApi,
        expected: requestedBinding
      }));
    }
  }

  const receiptDigest = finalizationReceiptDigest(receipt);
  const index = signedRecord({
    kind: PARADISE_PRODUCTION_FINALIZATION_RECEIPT_INDEX_KIND,
    schemaVersion: PARADISE_PRODUCTION_REBUILD_PLAN_SCHEMA_VERSION,
    guildId: target,
    planId: current.record.planId,
    markerId: normalizedMarkerId,
    receiptDigest,
    status: "pending",
    updatedAt: new Date(nowMs).toISOString()
  }, current.signingSecret);
  const indexPath = finalizationReceiptIndexPath(planRoot, target);
  let indexReadback;
  try {
    await writeJsonAtomicExclusive(indexPath, index, fileApi);
    indexReadback = verifyFinalizationReceiptIndex(
      await readJson(indexPath, fileApi, "production_finalization_receipt_index_unavailable"),
      current.signingSecret
    );
  } catch (error) {
    if (error?.code !== "EEXIST") {
      if (String(error?.code || "").startsWith("production_finalization_receipt_")) throw error;
      throw planError("production_finalization_receipt_index_write_failed");
    }
    indexReadback = verifyFinalizationReceiptIndex(
      await readJson(indexPath, fileApi, "production_finalization_receipt_index_unavailable"),
      current.signingSecret
    );
  }
  if (indexReadback.planId !== receipt.planId
      || indexReadback.markerId !== receipt.markerId
      || !timingSafeEqualString(indexReadback.receiptDigest, receiptDigest)) {
    throw planError("production_finalization_receipt_index_collision");
  }
  return Object.freeze({ ...receipt, receiptDigest });
}

export async function readParadiseProductionFinalizationReceipt({
  guildId,
  markerId,
  lifecycle = "pending",
  planRoot = DEFAULT_PLAN_ROOT,
  secret,
  fileApi = fs
} = {}) {
  const signingSecret = requireSecret(secret);
  const target = String(guildId || "").trim();
  const normalizedLifecycle = lifecycle === "resolved" ? "resolved" : "pending";
  const normalizedMarkerId = markerId == null ? null : normalizedFinalizationMarkerId(markerId);
  if (normalizedLifecycle === "resolved" && normalizedMarkerId == null) {
    throw planError("production_finalization_receipt_marker_invalid");
  }
  const indexPath = normalizedLifecycle === "resolved"
    ? finalizationReceiptResolvedIndexPath(planRoot, target, normalizedMarkerId)
    : finalizationReceiptIndexPath(planRoot, target);
  const index = verifyFinalizationReceiptIndex(
    await readJson(
      indexPath,
      fileApi,
      "production_finalization_receipt_index_unavailable"
    ),
    signingSecret
  );
  const indexStatus = index.status == null ? "pending" : String(index.status);
  if (index.guildId !== target
      || index.markerId == null
      || indexStatus !== normalizedLifecycle
      || (normalizedMarkerId != null && index.markerId !== normalizedMarkerId)) {
    throw planError("production_finalization_receipt_index_binding_invalid");
  }
  const result = await readReceiptForPlan({
    planId: index.planId,
    planRoot,
    secret,
    fileApi,
    expected: { guildId: target, markerId: index.markerId }
  });
  if (!timingSafeEqualString(index.receiptDigest, result.receiptDigest)) {
    throw planError("production_finalization_receipt_index_binding_invalid");
  }
  return Object.freeze({ ...result.receipt, receiptDigest: result.receiptDigest });
}

/**
 * Archives the guild's authenticated pending receipt index after the matching
 * rollback marker has been resolved. The immutable per-plan receipt remains
 * in place, while removing the pending pointer allows a later production plan
 * for the same guild to create its own independently bound receipt.
 */
export async function resolveParadiseProductionFinalizationReceipt({
  guildId,
  markerId,
  planId,
  planRoot = DEFAULT_PLAN_ROOT,
  secret,
  nowMs = Date.now(),
  fileApi = fs
} = {}) {
  const signingSecret = requireSecret(secret);
  const target = String(guildId || "").trim();
  const marker = normalizedFinalizationMarkerId(markerId);
  const expectedPlanId = normalizedPlanId(planId);
  const pendingPath = finalizationReceiptIndexPath(planRoot, target);
  const resolvedPath = finalizationReceiptResolvedIndexPath(planRoot, target, marker);

  let pending;
  try {
    pending = verifyFinalizationReceiptIndex(
      await readJson(pendingPath, fileApi, "production_finalization_receipt_index_unavailable"),
      signingSecret
    );
  } catch (error) {
    if (error?.code !== "production_finalization_receipt_index_unavailable") throw error;
    const alreadyResolved = await readParadiseProductionFinalizationReceipt({
      guildId: target,
      markerId: marker,
      lifecycle: "resolved",
      planRoot,
      secret,
      fileApi
    });
    if (alreadyResolved.planId !== expectedPlanId) {
      throw planError("production_finalization_receipt_index_binding_invalid");
    }
    return Object.freeze({
      status: "resolved",
      alreadyResolved: true,
      planId: expectedPlanId,
      markerId: marker
    });
  }

  const pendingStatus = pending.status == null ? "pending" : String(pending.status);
  if (pendingStatus !== "pending"
      || pending.guildId !== target
      || pending.planId !== expectedPlanId
      || pending.markerId !== marker) {
    throw planError("production_finalization_receipt_index_binding_invalid");
  }
  const receipt = await readReceiptForPlan({
    planId: expectedPlanId,
    planRoot,
    secret,
    fileApi,
    expected: { guildId: target, markerId: marker }
  });
  if (!timingSafeEqualString(pending.receiptDigest, receipt.receiptDigest)) {
    throw planError("production_finalization_receipt_index_binding_invalid");
  }

  const resolvedIndex = signedRecord({
    ...pending,
    status: "resolved",
    resolvedAt: new Date(nowMs).toISOString(),
    updatedAt: new Date(nowMs).toISOString()
  }, signingSecret);
  try {
    await writeJsonAtomicExclusive(resolvedPath, resolvedIndex, fileApi);
  } catch (error) {
    if (error?.code !== "EEXIST") {
      throw planError("production_finalization_receipt_index_write_failed");
    }
  }

  const resolvedReadback = verifyFinalizationReceiptIndex(
    await readJson(resolvedPath, fileApi, "production_finalization_receipt_index_unavailable"),
    signingSecret
  );
  if (resolvedReadback.status !== "resolved"
      || resolvedReadback.guildId !== target
      || resolvedReadback.planId !== expectedPlanId
      || resolvedReadback.markerId !== marker
      || !timingSafeEqualString(resolvedReadback.receiptDigest, receipt.receiptDigest)) {
    throw planError("production_finalization_receipt_index_collision");
  }

  const pendingReadback = verifyFinalizationReceiptIndex(
    await readJson(pendingPath, fileApi, "production_finalization_receipt_index_unavailable"),
    signingSecret
  );
  if (pendingReadback.guildId !== target
      || pendingReadback.planId !== expectedPlanId
      || pendingReadback.markerId !== marker
      || !timingSafeEqualString(pendingReadback.receiptDigest, receipt.receiptDigest)) {
    throw planError("production_finalization_receipt_index_collision");
  }
  try {
    await fileApi.rm(pendingPath);
  } catch {
    throw planError("production_finalization_receipt_index_write_failed");
  }

  return Object.freeze({
    status: "resolved",
    alreadyResolved: false,
    planId: expectedPlanId,
    markerId: marker
  });
}

export async function createParadiseProductionRebuildPlan({
  guildId,
  mode,
  backup,
  ownerUserId,
  secret,
  preflight,
  expectedGuildId,
  nowMs = Date.now(),
  ttlMs = PARADISE_PRODUCTION_REBUILD_PLAN_TTL_MS,
  planRoot = DEFAULT_PLAN_ROOT,
  fileApi = fs
} = {}) {
  const signingSecret = requireSecret(secret);
  const target = String(guildId || "").trim();
  if (!target || target !== String(expectedGuildId || "").trim()) {
    throw planError("production_rebuild_plan_target_mismatch");
  }
  if (mode !== "community") throw planError("production_rebuild_plan_mode_mismatch");
  assertProductionPreflightGates(preflight, nowMs);
  const validation = validateParadiseBackupEnvelope(backup);
  if (!validation.valid) throw planError("production_rebuild_plan_backup_invalid", { validation });
  if (backupGuildId(backup) !== target) throw planError("production_rebuild_plan_backup_target_mismatch");

  const planId = crypto.randomUUID();
  const paths = planPaths(planRoot, planId);
  const backupDigest = paradiseBackupStateDigest(backup);
  const backupArtifactDigest = String(backup.integrity.digest);
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + Math.max(30_000, Number(ttlMs) || 0)).toISOString();
  const record = signedRecord({
    kind: PARADISE_PRODUCTION_REBUILD_PLAN_KIND,
    schemaVersion: PARADISE_PRODUCTION_REBUILD_PLAN_SCHEMA_VERSION,
    planId,
    nonce: crypto.randomBytes(24).toString("base64url"),
    state: "ready",
    guildId: target,
    mode,
    backupDigest,
    backupArtifactDigest,
    ownerBinding: ownerBinding(ownerUserId),
    requiredConfirmation: exactConfirmation({ guildId: target, planId, backupDigest }),
    createdAt,
    expiresAt,
    usedAt: null,
    finishedAt: null,
    outcome: null,
    gates: safeGateSummary(preflight)
  }, signingSecret);

  await writeJsonAtomic(paths.backup, backup, fileApi);
  const persistedBackup = await readJson(
    paths.backup,
    fileApi,
    "production_rebuild_plan_backup_unavailable"
  );
  const persistedValidation = validateParadiseBackupEnvelope(persistedBackup);
  if (!persistedValidation.valid
      || backupGuildId(persistedBackup) !== target
      || !timingSafeEqualString(persistedBackup.integrity?.digest, backupArtifactDigest)
      || !timingSafeEqualString(paradiseBackupStateDigest(persistedBackup), backupDigest)) {
    throw planError("production_rebuild_plan_backup_readback_failed");
  }
  await writeJsonAtomic(paths.record, record, fileApi);
  const readback = verifyRecord(await readJson(paths.record, fileApi), signingSecret);
  if (readback.planId !== planId || !timingSafeEqualString(readback.backupDigest, backupDigest)) {
    throw planError("production_rebuild_plan_readback_failed");
  }
  return publicStatus(readback, nowMs);
}

export async function paradiseProductionRebuildPlanStatus({
  planId,
  planRoot = DEFAULT_PLAN_ROOT,
  secret,
  nowMs = Date.now(),
  fileApi = fs
} = {}) {
  const { record } = await readVerifiedRecord({ planId, planRoot, secret, fileApi });
  return publicStatus(record, nowMs);
}

export async function consumeParadiseProductionRebuildPlan({
  planId,
  guildId,
  mode,
  backupDigest,
  ownerUserId,
  confirmation,
  planRoot = DEFAULT_PLAN_ROOT,
  secret,
  nowMs = Date.now(),
  fileApi = fs
} = {}) {
  const initial = await readVerifiedRecord({ planId, planRoot, secret, fileApi });
  validateImmutableRequest(initial.record, {
    guildId, mode, backupDigest, ownerUserId, confirmation, nowMs
  });
  await verifyPersistedBackup(initial.record, initial.paths, fileApi);

  await fileApi.mkdir(path.dirname(initial.paths.consumeLock), { recursive: true });
  let lockHandle;
  try {
    lockHandle = await fileApi.open(initial.paths.consumeLock, "wx", 0o600);
    await lockHandle.writeFile(`${new Date(nowMs).toISOString()}\n`, "utf8");
  } catch (error) {
    await lockHandle?.close?.().catch(() => {});
    if (error?.code === "EEXIST") throw planError("production_rebuild_plan_already_used");
    throw planError("production_rebuild_plan_consume_lock_failed");
  }
  await lockHandle.close();

  const current = await readVerifiedRecord({ planId, planRoot, secret, fileApi });
  validateImmutableRequest(current.record, {
    guildId, mode, backupDigest, ownerUserId, confirmation, nowMs
  });
  await verifyPersistedBackup(current.record, current.paths, fileApi);

  const usedAt = new Date(nowMs).toISOString();
  const executing = signedRecord({
    ...current.record,
    state: "executing",
    usedAt
  }, current.signingSecret);
  await writeJsonAtomic(current.paths.record, executing, fileApi);

  const proofBody = {
    kind: PARADISE_PRODUCTION_REBUILD_EXECUTION_PROOF_KIND,
    schemaVersion: PARADISE_PRODUCTION_REBUILD_PLAN_SCHEMA_VERSION,
    planId: executing.planId,
    guildId: executing.guildId,
    mode: executing.mode,
    backupDigest: executing.backupDigest,
    issuedAt: usedAt,
    expiresAt: new Date(Math.min(
      Date.parse(executing.expiresAt),
      nowMs + PARADISE_PRODUCTION_REBUILD_EXECUTION_PROOF_TTL_MS
    )).toISOString()
  };
  return {
    ...proofBody,
    signature: hmac(proofBody, current.signingSecret)
  };
}

export function verifyParadiseProductionRebuildExecutionProof(proof, {
  secret,
  guildId,
  mode,
  backupDigest,
  planId,
  nowMs = Date.now()
} = {}) {
  const signingSecret = requireSecret(secret);
  if (!proof || proof.kind !== PARADISE_PRODUCTION_REBUILD_EXECUTION_PROOF_KIND
      || proof.schemaVersion !== PARADISE_PRODUCTION_REBUILD_PLAN_SCHEMA_VERSION) {
    return { ok: false, code: "production_rebuild_execution_proof_schema_invalid" };
  }
  const unsigned = { ...proof };
  delete unsigned.signature;
  if (!timingSafeEqualString(proof.signature, hmac(unsigned, signingSecret))) {
    return { ok: false, code: "production_rebuild_execution_proof_authenticity_invalid" };
  }
  if (String(proof.guildId || "") !== String(guildId || "")
      || String(proof.mode || "") !== String(mode || "")
      || String(proof.planId || "") !== String(planId || "")
      || !timingSafeEqualString(proof.backupDigest, backupDigest)) {
    return { ok: false, code: "production_rebuild_execution_proof_scope_mismatch" };
  }
  const issuedAt = Date.parse(proof.issuedAt);
  const expiresAt = Date.parse(proof.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
      || issuedAt > nowMs || nowMs >= expiresAt) {
    return { ok: false, code: "production_rebuild_execution_proof_expired" };
  }
  return { ok: true, code: "ok" };
}

export async function finishParadiseProductionRebuildPlan({
  planId,
  outcome,
  planRoot = DEFAULT_PLAN_ROOT,
  secret,
  nowMs = Date.now(),
  fileApi = fs
} = {}) {
  const current = await readVerifiedRecord({ planId, planRoot, secret, fileApi });
  if (current.record.state !== "executing") {
    throw planError("production_rebuild_plan_not_executing");
  }
  const normalizedOutcome = outcome === "completed" ? "completed" : "failed";
  const finished = signedRecord({
    ...current.record,
    state: normalizedOutcome,
    outcome: normalizedOutcome,
    finishedAt: new Date(nowMs).toISOString()
  }, current.signingSecret);
  await writeJsonAtomic(current.paths.record, finished, fileApi);
  return publicStatus(finished, nowMs);
}

export const PARADISE_PRODUCTION_REBUILD_PLAN_ROOT = DEFAULT_PLAN_ROOT;
