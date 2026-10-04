import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PARADISE_TEST_GUILD_ID } from "./runtimeEnvironment.js";

export const PARADISE_REHEARSAL_EVIDENCE_KIND = "fima_test_guild_rehearsal_evidence";
export const PARADISE_REHEARSAL_EVIDENCE_SCHEMA_VERSION = 4;
export const PARADISE_REHEARSAL_EVIDENCE_SOURCE = "paradise_test_guild_runner";
export const PARADISE_REHEARSAL_EVIDENCE_EXECUTION_MODE = "live_discord_test_guild";
export const PARADISE_REHEARSAL_EVIDENCE_SECRET_ENV = "PARADISE_REHEARSAL_EVIDENCE_SECRET";
export const PARADISE_REHEARSAL_EVIDENCE_DEFAULT_PATH = path.resolve(
  process.cwd(),
  "artifacts",
  "post-security-backlog",
  "3a71-test-guild-live-proof.json"
);

export function paradisePreviousRehearsalEvidencePath(evidencePath) {
  const resolvedPath = path.resolve(evidencePath);
  const parsed = path.parse(resolvedPath);
  return path.join(parsed.dir, `${parsed.name}.previous${parsed.ext}`);
}

const MIN_SECRET_BYTES = 32;
const HEX_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const HMAC_PATTERN = /^hmac-sha256:[a-f0-9]{64}$/;
const BACKUP_DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const RELEASE_REVISION_PATTERN = /^[a-f0-9]{40}$/;

function evidenceError(code) {
  return Object.assign(new Error(code), { code });
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validSecret(secret) {
  return Buffer.byteLength(String(secret || ""), "utf8") >= MIN_SECRET_BYTES;
}

function exactKeys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length
    && expected.slice().sort().every((key, index) => key === actual[index]);
}

function claimFromEvidence(evidence) {
  return {
    kind: evidence.kind,
    schemaVersion: evidence.schemaVersion,
    source: evidence.source,
    executionMode: evidence.executionMode,
    verifiedAt: evidence.verifiedAt,
    release: evidence.release,
    guild: evidence.guild,
    rehearsal: evidence.rehearsal
  };
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(canonicalJson(value), "utf8").digest("hex")}`;
}

function hmac(value, secret) {
  return `hmac-sha256:${crypto.createHmac("sha256", secret).update(canonicalJson(value), "utf8").digest("hex")}`;
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createParadiseRehearsalEvidence({ guildId, result, verifiedAt, release } = {}, options = {}) {
  const secret = String(options.secret ?? process.env[PARADISE_REHEARSAL_EVIDENCE_SECRET_ENV] ?? "");
  if (!validSecret(secret)) throw evidenceError("test_guild_rehearsal_secret_unavailable");
  if (String(guildId || "") !== PARADISE_TEST_GUILD_ID) throw evidenceError("test_guild_rehearsal_wrong_guild");
  const fullRehearsalVerified = result?.action === "rehearsal"
    && result?.status === "LIVE DISCORD VERIFIED"
    && result?.smokeRunsCompleted === 2
    && result?.fullSmokeRunsVerified === true
    && result?.initialBackupVerified === true
    && result?.persistedBackupVerified === true
    && result?.restoredOriginalState === true
    && result?.originalStateCanRestore === true
    && result?.originalStateMutationsPlanned === 0;
  if (!fullRehearsalVerified) {
    throw evidenceError("test_guild_rehearsal_not_live_verified");
  }

  if (!exactKeys(release, ["revision", "criticalDigest"])
    || !RELEASE_REVISION_PATTERN.test(String(release?.revision || ""))
    || !BACKUP_DIGEST_PATTERN.test(String(release?.criticalDigest || ""))) {
    throw evidenceError("test_guild_rehearsal_release_binding_invalid");
  }

  const backup = {
    algorithm: result?.backupAlgorithm,
    artifactDigest: result?.backupArtifactDigest,
    stateDigest: result?.backupStateDigest,
    persistedArtifactDigest: result?.persistedBackupArtifactDigest,
    persistedStateDigest: result?.persistedBackupStateDigest
  };
  if (backup.algorithm !== "sha256"
    || !BACKUP_DIGEST_PATTERN.test(String(backup.artifactDigest || ""))
    || !BACKUP_DIGEST_PATTERN.test(String(backup.stateDigest || ""))
    || !BACKUP_DIGEST_PATTERN.test(String(backup.persistedArtifactDigest || ""))
    || !BACKUP_DIGEST_PATTERN.test(String(backup.persistedStateDigest || ""))) {
    throw evidenceError("test_guild_rehearsal_backup_binding_invalid");
  }
  if (!constantTimeEqual(backup.artifactDigest, backup.persistedArtifactDigest)
    || !constantTimeEqual(backup.stateDigest, backup.persistedStateDigest)) {
    throw evidenceError("test_guild_rehearsal_backup_readback_mismatch");
  }

  const verifiedAtIso = new Date(verifiedAt ?? options.nowMs ?? Date.now()).toISOString();
  const claim = {
    kind: PARADISE_REHEARSAL_EVIDENCE_KIND,
    schemaVersion: PARADISE_REHEARSAL_EVIDENCE_SCHEMA_VERSION,
    source: PARADISE_REHEARSAL_EVIDENCE_SOURCE,
    executionMode: PARADISE_REHEARSAL_EVIDENCE_EXECUTION_MODE,
    verifiedAt: verifiedAtIso,
    release: {
      revision: release.revision,
      criticalDigest: release.criticalDigest
    },
    guild: {
      id: PARADISE_TEST_GUILD_ID,
      mainProductionGuildTouched: false
    },
    rehearsal: {
      action: "rehearsal",
      completed: true,
      lastError: null,
      smokeRunsCompleted: 2,
      fullSmokeRunsVerified: true,
      initialBackupVerified: true,
      persistedBackupVerified: true,
      backup,
      restoredOriginalState: true,
      originalStateCanRestore: true,
      originalStateMutationsPlanned: 0
    }
  };
  const unsigned = {
    ...claim,
    artifact: {
      algorithm: "sha256",
      digest: sha256(claim),
      revision: release.revision
    }
  };
  return Object.freeze({
    ...unsigned,
    signature: hmac(unsigned, secret)
  });
}

export function verifyParadiseRehearsalEvidence(evidence, options = {}) {
  const secret = String(options.secret ?? process.env[PARADISE_REHEARSAL_EVIDENCE_SECRET_ENV] ?? "");
  if (!validSecret(secret)) return { ok: false, code: "test_guild_rehearsal_secret_unavailable" };
  if (!exactKeys(evidence, [
    "kind", "schemaVersion", "source", "executionMode", "verifiedAt", "release", "guild", "rehearsal", "artifact", "signature"
  ])
    || !exactKeys(evidence.release, ["revision", "criticalDigest"])
    || !exactKeys(evidence.guild, ["id", "mainProductionGuildTouched"])
    || !exactKeys(evidence.rehearsal, [
      "action", "completed", "lastError", "smokeRunsCompleted", "fullSmokeRunsVerified",
      "initialBackupVerified", "persistedBackupVerified", "backup", "restoredOriginalState",
      "originalStateCanRestore", "originalStateMutationsPlanned"
    ])
    || !exactKeys(evidence.rehearsal?.backup, [
      "algorithm", "artifactDigest", "stateDigest", "persistedArtifactDigest", "persistedStateDigest"
    ])
    || !exactKeys(evidence.artifact, ["algorithm", "digest", "revision"])) {
    return { ok: false, code: "test_guild_rehearsal_schema_invalid" };
  }
  if (evidence.kind !== PARADISE_REHEARSAL_EVIDENCE_KIND
    || evidence.schemaVersion !== PARADISE_REHEARSAL_EVIDENCE_SCHEMA_VERSION
    || evidence.source !== PARADISE_REHEARSAL_EVIDENCE_SOURCE) {
    return { ok: false, code: "test_guild_rehearsal_provenance_invalid" };
  }
  if (evidence.executionMode !== PARADISE_REHEARSAL_EVIDENCE_EXECUTION_MODE) {
    return { ok: false, code: "test_guild_rehearsal_execution_mode_invalid" };
  }
  if (!RELEASE_REVISION_PATTERN.test(String(evidence.release?.revision || ""))
    || !BACKUP_DIGEST_PATTERN.test(String(evidence.release?.criticalDigest || ""))
    || evidence.artifact?.revision !== evidence.release?.revision) {
    return { ok: false, code: "test_guild_rehearsal_release_binding_invalid" };
  }
  const rehearsal = evidence.rehearsal;
  if (rehearsal.action !== "rehearsal"
    || rehearsal.completed !== true
    || rehearsal.lastError !== null
    || rehearsal.smokeRunsCompleted !== 2
    || rehearsal.fullSmokeRunsVerified !== true
    || rehearsal.initialBackupVerified !== true
    || rehearsal.persistedBackupVerified !== true
    || rehearsal.restoredOriginalState !== true
    || rehearsal.originalStateCanRestore !== true
    || rehearsal.originalStateMutationsPlanned !== 0) {
    return { ok: false, code: "test_guild_rehearsal_not_live_verified" };
  }
  const backup = rehearsal.backup;
  if (backup.algorithm !== "sha256"
    || !BACKUP_DIGEST_PATTERN.test(String(backup.artifactDigest || ""))
    || !BACKUP_DIGEST_PATTERN.test(String(backup.stateDigest || ""))
    || !BACKUP_DIGEST_PATTERN.test(String(backup.persistedArtifactDigest || ""))
    || !BACKUP_DIGEST_PATTERN.test(String(backup.persistedStateDigest || ""))) {
    return { ok: false, code: "test_guild_rehearsal_backup_binding_invalid" };
  }
  if (!constantTimeEqual(backup.artifactDigest, backup.persistedArtifactDigest)
    || !constantTimeEqual(backup.stateDigest, backup.persistedStateDigest)) {
    return { ok: false, code: "test_guild_rehearsal_backup_readback_mismatch" };
  }
  if (evidence.artifact.algorithm !== "sha256"
    || !HEX_DIGEST_PATTERN.test(String(evidence.artifact.digest || ""))) {
    return { ok: false, code: "test_guild_rehearsal_digest_invalid" };
  }
  const claim = claimFromEvidence(evidence);
  if (!constantTimeEqual(evidence.artifact.digest, sha256(claim))) {
    return { ok: false, code: "test_guild_rehearsal_digest_invalid" };
  }
  if (!HMAC_PATTERN.test(String(evidence.signature || ""))) {
    return { ok: false, code: "test_guild_rehearsal_signature_missing" };
  }
  const { signature, ...unsigned } = evidence;
  if (!constantTimeEqual(signature, hmac(unsigned, secret))) {
    return { ok: false, code: "test_guild_rehearsal_signature_invalid" };
  }
  return { ok: true, code: "ok" };
}

export async function persistParadiseRehearsalEvidence(evidencePath, evidence, options = {}) {
  const fileApi = options.fileApi || fs;
  const resolvedPath = path.resolve(evidencePath);
  const previousPath = paradisePreviousRehearsalEvidencePath(resolvedPath);
  const temporaryPath = `${resolvedPath}.${crypto.randomUUID()}.tmp`;
  const previousTemporaryPath = `${previousPath}.${crypto.randomUUID()}.tmp`;
  const authenticity = verifyParadiseRehearsalEvidence(evidence, { secret: options.secret });
  if (!authenticity.ok) throw evidenceError(authenticity.code);

  let existingEvidence = null;
  try {
    existingEvidence = JSON.parse(await fileApi.readFile(resolvedPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw evidenceError("test_guild_rehearsal_existing_evidence_invalid");
  }
  if (existingEvidence) {
    const existingAuthenticity = verifyParadiseRehearsalEvidence(existingEvidence, { secret: options.secret });
    if (!existingAuthenticity.ok) throw evidenceError("test_guild_rehearsal_existing_evidence_invalid");
  }

  const sameRun = Boolean(existingEvidence
    && existingEvidence.verifiedAt === evidence.verifiedAt
    && existingEvidence.artifact?.digest === evidence.artifact?.digest
    && existingEvidence.signature === evidence.signature);
  if (existingEvidence && !sameRun) {
    const existingVerifiedAtMs = Date.parse(existingEvidence.verifiedAt);
    const nextVerifiedAtMs = Date.parse(evidence.verifiedAt);
    if (!Number.isFinite(existingVerifiedAtMs) || !Number.isFinite(nextVerifiedAtMs)
      || nextVerifiedAtMs <= existingVerifiedAtMs) {
      throw evidenceError(nextVerifiedAtMs === existingVerifiedAtMs
        ? "test_guild_rehearsal_timestamp_conflict"
        : "test_guild_rehearsal_history_order_invalid");
    }
    if (existingEvidence.artifact?.digest === evidence.artifact?.digest
      || existingEvidence.signature === evidence.signature) {
      throw evidenceError("test_guild_rehearsal_runs_not_distinct");
    }
    if (existingEvidence.rehearsal?.backup?.artifactDigest
      === evidence.rehearsal?.backup?.artifactDigest) {
      throw evidenceError("test_guild_rehearsal_backup_not_distinct");
    }
  }
  if (sameRun) return resolvedPath;
  await fileApi.mkdir(path.dirname(resolvedPath), { recursive: true });
  try {
    await fileApi.writeFile(temporaryPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    if (existingEvidence && !sameRun) {
      await fileApi.writeFile(
        previousTemporaryPath,
        `${JSON.stringify(existingEvidence, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 }
      );
      await fileApi.rename(previousTemporaryPath, previousPath);
    }
    await fileApi.rename(temporaryPath, resolvedPath);
  } finally {
    await fileApi.rm(temporaryPath, { force: true }).catch(() => {});
    await fileApi.rm(previousTemporaryPath, { force: true }).catch(() => {});
  }
  return resolvedPath;
}
