import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { GatewayIntentBits, PermissionsBitField } from "discord.js";
import { PARADISE_TEST_GUILD_ID } from "./runtimeEnvironment.js";
import { captureParadiseGuildBackupSnapshot } from "./paradiseGuildRestore.js";
import {
  createParadiseBackupEnvelope,
  paradiseBackupStateDigest,
  validateParadiseBackupEnvelope
} from "./paradiseBackupIntegrity.js";
import { paradisePersistentMutationLockStatus } from "./paradiseMutationLease.js";
import { readParadiseRollbackMarker } from "./paradiseRollbackMarker.js";
import {
  paradisePreviousRehearsalEvidencePath,
  verifyParadiseRehearsalEvidence
} from "./paradiseRehearsalEvidence.js";
import { buildFtCommunityDeploymentReadiness } from "./ftCommunityDeploymentReadiness.js";
import { createVerifiedFtCommunityReleaseBinding } from "./ftCommunityReleaseAttestation.js";

const REQUIRED_INTENTS = Object.freeze([
  "Guilds",
  "GuildMembers",
  "GuildMessages",
  "MessageContent"
]);

const REQUIRED_GUILD_PERMISSIONS = Object.freeze([
  "ManageGuild",
  "ManageChannels",
  "ManageRoles",
  "ManageWebhooks",
  "ManageMessages",
  "ViewChannel",
  "ReadMessageHistory",
  "SendMessages",
  "EmbedLinks",
  "AttachFiles"
]);

const REQUIRED_RESTORE_SCOPES = Object.freeze([
  "guildIdentity",
  "roles",
  "memberRoles",
  "channels",
  "canonicalMessages",
  "contentArchive",
  "autoModRules",
  "webhooks",
  "tickets"
]);

const DEFAULT_ARTIFACT_ROOT = path.resolve(process.cwd(), "artifacts", "post-security-backlog");
const DEFAULT_TEST_GUILD_REHEARSAL_ARTIFACT = "3a71-test-guild-live-proof.json";
const DEFAULT_TEST_GUILD_REHEARSAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function values(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection.values === "function") return [...collection.values()];
  return Object.values(collection);
}

function hasNamedIntent(client, name) {
  const configured = client?.options?.intents ?? client?.intents;
  const bit = GatewayIntentBits[name];
  if (configured?.has && bit != null) {
    try {
      return Boolean(configured.has(bit));
    } catch {
      return false;
    }
  }
  if (Array.isArray(configured)) {
    return configured.some(item => item === name || item === bit || String(item) === String(name));
  }
  if (configured?.bitfield != null && bit != null) {
    try {
      return (BigInt(configured.bitfield) & BigInt(bit)) === BigInt(bit);
    } catch {
      return false;
    }
  }
  return false;
}

function hasNamedPermission(permissions, name) {
  const bit = PermissionsBitField.Flags[name];
  if (!permissions || bit == null) return false;
  if (permissions.has) {
    try {
      return Boolean(permissions.has(bit));
    } catch {
      return false;
    }
  }
  if (Array.isArray(permissions)) return permissions.includes(name) || permissions.includes(bit);
  return false;
}

function snapshotSummary(snapshot) {
  const categories = Array.isArray(snapshot?.categories) ? snapshot.categories : [];
  const channels = Array.isArray(snapshot?.channels) ? snapshot.channels : [];
  const roles = Array.isArray(snapshot?.roles) ? snapshot.roles : [];
  const memberRoles = Array.isArray(snapshot?.memberRoles) ? snapshot.memberRoles : [];
  const canonicalMessages = Array.isArray(snapshot?.canonicalMessages) ? snapshot.canonicalMessages : [];
  const contentArchive = Array.isArray(snapshot?.contentArchive) ? snapshot.contentArchive : [];
  const autoModRules = Array.isArray(snapshot?.autoModRules) ? snapshot.autoModRules : [];
  const webhooks = Array.isArray(snapshot?.webhooks) ? snapshot.webhooks : [];
  const tickets = Array.isArray(snapshot?.tickets) ? snapshot.tickets : [];
  return {
    guildId: String(snapshot?.guildId || snapshot?.guild?.id || ""),
    capturedAt: snapshot?.capturedAt || null,
    restoreCapabilities: { ...(snapshot?.restoreCapabilities || {}) },
    captureErrorCount: Array.isArray(snapshot?.captureErrors) ? snapshot.captureErrors.length : 0,
    counts: {
      categories: categories.length,
      channels: channels.length,
      roles: roles.length,
      memberRoles: memberRoles.length,
      canonicalMessages: canonicalMessages.length,
      contentArchive: contentArchive.length,
      autoModRules: autoModRules.length,
      webhooks: webhooks.length,
      tickets: tickets.length
    }
  };
}

function safeErrorCode(error, fallback) {
  return String(error?.code || fallback).slice(0, 120);
}

async function inspectTestGuildRehearsalEvidence({
  fileApi,
  artifactRoot,
  evidencePath,
  evidenceSecret,
  expectedGuildId,
  maxAgeMs,
  nowMs
}) {
  const resolvedPath = path.resolve(
    evidencePath || path.join(artifactRoot, DEFAULT_TEST_GUILD_REHEARSAL_ARTIFACT)
  );
  let evidence;
  try {
    evidence = JSON.parse(await fileApi.readFile(resolvedPath, "utf8"));
  } catch (error) {
    return {
      ok: false,
      code: error instanceof SyntaxError
        ? "test_guild_rehearsal_evidence_malformed"
        : "test_guild_rehearsal_evidence_unreadable",
      details: { readable: false }
    };
  }

  const authenticity = verifyParadiseRehearsalEvidence(evidence, { secret: evidenceSecret });
  if (!authenticity.ok) {
    return {
      ok: false,
      code: authenticity.code,
      details: {
        readable: true,
        provenanceVerified: false
      }
    };
  }

  const verifiedAtMs = Date.parse(String(evidence?.verifiedAt || ""));
  const ageMs = Number.isFinite(verifiedAtMs) ? nowMs - verifiedAtMs : null;
  const checks = [
    ["test_guild_rehearsal_wrong_guild", String(evidence?.guild?.id || "") === String(expectedGuildId || "")],
    ["test_guild_rehearsal_not_live_verified", evidence?.rehearsal?.action === "rehearsal"],
    ["test_guild_rehearsal_incomplete", evidence?.rehearsal?.completed === true],
    ["test_guild_rehearsal_has_error", evidence?.rehearsal?.lastError == null],
    ["test_guild_rehearsal_smoke_runs_incomplete", evidence?.rehearsal?.smokeRunsCompleted === 2],
    ["test_guild_rehearsal_smoke_runs_unverified", evidence?.rehearsal?.fullSmokeRunsVerified === true],
    ["test_guild_rehearsal_initial_backup_unverified", evidence?.rehearsal?.initialBackupVerified === true],
    ["test_guild_rehearsal_persisted_backup_unverified", evidence?.rehearsal?.persistedBackupVerified === true],
    ["test_guild_rehearsal_restore_incomplete", evidence?.rehearsal?.restoredOriginalState === true],
    ["test_guild_rehearsal_restore_unverified", evidence?.rehearsal?.originalStateCanRestore === true],
    ["test_guild_rehearsal_original_state_drift", evidence?.rehearsal?.originalStateMutationsPlanned === 0],
    ["test_guild_rehearsal_touched_production", evidence?.guild?.mainProductionGuildTouched === false],
    ["test_guild_rehearsal_timestamp_invalid", Number.isFinite(verifiedAtMs)],
    ["test_guild_rehearsal_timestamp_future", Number.isFinite(ageMs) && ageMs >= 0],
    ["test_guild_rehearsal_stale", Number.isFinite(ageMs) && ageMs <= maxAgeMs]
  ];
  const checkPassed = Object.fromEntries(checks);
  const failed = checks.find(([, ok]) => !ok);
  return {
    ok: !failed,
    code: failed?.[0] || "ok",
    evidence: failed ? null : evidence,
    details: {
      guildMatches: checkPassed.test_guild_rehearsal_wrong_guild,
      provenanceVerified: true,
      liveVerified: checkPassed.test_guild_rehearsal_not_live_verified,
      smokeCompleted: checkPassed.test_guild_rehearsal_smoke_runs_incomplete,
      lastErrorAbsent: checkPassed.test_guild_rehearsal_has_error,
      fullRehearsalVerified: [
        "test_guild_rehearsal_has_error",
        "test_guild_rehearsal_smoke_runs_incomplete",
        "test_guild_rehearsal_smoke_runs_unverified",
        "test_guild_rehearsal_initial_backup_unverified",
        "test_guild_rehearsal_persisted_backup_unverified",
        "test_guild_rehearsal_restore_incomplete",
        "test_guild_rehearsal_restore_unverified",
        "test_guild_rehearsal_original_state_drift"
      ].every(code => checkPassed[code]),
      productionUntouched: checkPassed.test_guild_rehearsal_touched_production,
      timestampValid: checkPassed.test_guild_rehearsal_timestamp_invalid,
      timestampNotFuture: checkPassed.test_guild_rehearsal_timestamp_future,
      fresh: checkPassed.test_guild_rehearsal_stale,
      ageMs
    }
  };
}

async function inspectTestGuildRehearsalPair({
  fileApi,
  artifactRoot,
  evidencePath,
  previousEvidencePath,
  evidenceSecret,
  expectedGuildId,
  expectedRelease,
  maxAgeMs,
  nowMs
}) {
  const currentPath = path.resolve(
    evidencePath || path.join(artifactRoot, DEFAULT_TEST_GUILD_REHEARSAL_ARTIFACT)
  );
  const resolvedPreviousPath = path.resolve(
    previousEvidencePath || paradisePreviousRehearsalEvidencePath(currentPath)
  );
  const current = await inspectTestGuildRehearsalEvidence({
    fileApi,
    artifactRoot,
    evidencePath: currentPath,
    evidenceSecret,
    expectedGuildId,
    maxAgeMs,
    nowMs
  });
  if (!current.ok) {
    return {
      ok: false,
      code: current.code,
      details: {
        verifiedCount: 0,
        current: current.details,
        previous: { readable: false, provenanceVerified: false }
      }
    };
  }

  const previous = await inspectTestGuildRehearsalEvidence({
    fileApi,
    artifactRoot,
    evidencePath: resolvedPreviousPath,
    evidenceSecret,
    expectedGuildId,
    maxAgeMs,
    nowMs
  });
  if (!previous.ok) {
    return {
      ok: false,
      code: previous.code,
      details: {
        verifiedCount: 1,
        current: current.details,
        previous: previous.details
      }
    };
  }

  const currentVerifiedAtMs = Date.parse(current.evidence.verifiedAt);
  const previousVerifiedAtMs = Date.parse(previous.evidence.verifiedAt);
  const timestampsDistinct = current.evidence.verifiedAt !== previous.evidence.verifiedAt;
  const signaturesDistinct = current.evidence.signature !== previous.evidence.signature;
  const digestsDistinct = current.evidence.artifact.digest !== previous.evidence.artifact.digest;
  const releaseRevisionMatches = current.evidence.release.revision === previous.evidence.release.revision;
  const releaseDigestMatches = current.evidence.release.criticalDigest === previous.evidence.release.criticalDigest;
  const releaseMatches = releaseRevisionMatches && releaseDigestMatches;
  const expectedRevision = String(expectedRelease?.revision || "").trim().toLowerCase();
  const expectedDigest = String(expectedRelease?.criticalDigest || "").trim().toLowerCase();
  const expectedReleaseProvided = Boolean(expectedRevision || expectedDigest);
  const productionReleaseMatches = !expectedReleaseProvided || (
    /^[a-f0-9]{40}$/u.test(expectedRevision)
    && /^[a-f0-9]{64}$/u.test(expectedDigest)
    && current.evidence.release.revision === expectedRevision
    && current.evidence.release.criticalDigest === expectedDigest
    && previous.evidence.release.revision === expectedRevision
    && previous.evidence.release.criticalDigest === expectedDigest
  );
  const backupArtifactsDistinct = current.evidence.rehearsal.backup.artifactDigest
    !== previous.evidence.rehearsal.backup.artifactDigest;
  const chronological = previousVerifiedAtMs < currentVerifiedAtMs;
  const distinct = timestampsDistinct && signaturesDistinct && digestsDistinct;
  const code = !releaseMatches
    ? "test_guild_rehearsal_release_mismatch"
    : !productionReleaseMatches
      ? "test_guild_rehearsal_release_drift"
    : !backupArtifactsDistinct
      ? "test_guild_rehearsal_backup_not_distinct"
      : !distinct
    ? "test_guild_rehearsal_runs_not_distinct"
    : !chronological
      ? "test_guild_rehearsal_history_order_invalid"
      : "ok";
  return {
    ok: releaseMatches && productionReleaseMatches && backupArtifactsDistinct && distinct && chronological,
    code,
    details: {
      verifiedCount: 2,
      provenanceVerified: true,
      timestampsDistinct,
      signaturesDistinct,
      digestsDistinct,
      releaseMatches,
      productionReleaseMatches,
      backupArtifactsDistinct,
      chronological,
      current: {
        verifiedAt: current.evidence.verifiedAt,
        ageMs: current.details.ageMs,
        smokeCompleted: current.details.smokeCompleted,
        fullRehearsalVerified: current.details.fullRehearsalVerified,
        productionUntouched: current.details.productionUntouched
      },
      previous: {
        verifiedAt: previous.evidence.verifiedAt,
        ageMs: previous.details.ageMs,
        smokeCompleted: previous.details.smokeCompleted,
        fullRehearsalVerified: previous.details.fullRehearsalVerified,
        productionUntouched: previous.details.productionUntouched
      }
    }
  };
}

async function probeArtifactStorage({ fileApi, artifactRoot, guildId }) {
  const nonce = crypto.randomUUID();
  const probePath = path.join(path.resolve(artifactRoot), `.rebuild-preflight-${guildId}-${nonce}.json`);
  const expected = `${JSON.stringify({ kind: "paradise_rebuild_preflight", guildId, nonce })}\n`;
  let writeSucceeded = false;
  let readSucceeded = false;
  let cleanupSucceeded = false;
  let failure = null;
  try {
    await fileApi.mkdir(path.dirname(probePath), { recursive: true });
    await fileApi.writeFile(probePath, expected, "utf8");
    writeSucceeded = true;
    const actual = await fileApi.readFile(probePath, "utf8");
    if (actual !== expected) {
      const error = new Error("artifact_probe_readback_mismatch");
      error.code = "artifact_probe_readback_mismatch";
      throw error;
    }
    readSucceeded = true;
  } catch (error) {
    failure = safeErrorCode(error, "artifact_probe_failed");
  } finally {
    try {
      await fileApi.rm(probePath, { force: true });
      try {
        await fileApi.stat(probePath);
        failure ||= "artifact_probe_cleanup_failed";
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        cleanupSucceeded = true;
      }
    } catch (error) {
      failure ||= safeErrorCode(error, "artifact_probe_cleanup_failed");
    }
  }
  return {
    ok: writeSucceeded && readSucceeded && cleanupSucceeded && !failure,
    writeSucceeded,
    readSucceeded,
    cleanupSucceeded,
    failure
  };
}

function isTextBackupChannel(channel) {
  return !channel?.isThread?.() && Boolean(channel?.isTextBased?.());
}

/**
 * Performs only Discord reads plus a local artifact write/read/delete probe.
 * No Discord create, edit, delete, send, role, webhook, or permission mutation
 * is reachable from this function.
 */
export async function inspectParadiseRebuildPreflight(guild, options = {}) {
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const checkedAt = new Date(nowMs).toISOString();
  const guildId = String(guild?.id || "").trim();
  const allowedGuildId = String(options.allowedGuildId || PARADISE_TEST_GUILD_ID);
  const captureSnapshot = options.captureSnapshot || captureParadiseGuildBackupSnapshot;
  const readLeaseStatus = options.readLeaseStatus || paradisePersistentMutationLockStatus;
  const readRollbackMarker = options.readRollbackMarker || readParadiseRollbackMarker;
  const fileApi = options.fileApi || fs;
  const artifactRoot = options.artifactRoot || DEFAULT_ARTIFACT_ROOT;
  const allowedCorrelationId = String(options.allowedCorrelationId || "").trim() || null;
  const state = options.state && typeof options.state === "object" ? options.state : {};
  const checks = [];
  const blockers = [];
  let capturedSnapshot = null;
  let capturedBackup = null;
  let capturedBackupEnvelope = null;
  let expectedTestGuildRelease = options.expectedTestGuildRelease || null;

  const check = (id, ok, code, details = {}) => {
    const entry = { id, ok: Boolean(ok), code: ok ? "ok" : code, details };
    checks.push(entry);
    if (!ok) blockers.push({ check: id, code, details });
    return Boolean(ok);
  };

  const exactGuild = check("exact_test_guild", guildId === allowedGuildId, "wrong_rebuild_guild", {
    guildId,
    allowedGuildId
  });
  if (!exactGuild) {
    return {
      ready: false,
      code: blockers[0].code,
      checks,
      blockers,
      snapshot: null,
      checkedAt,
      mutationCount: 0
    };
  }

  if (options.requireProductionDeploymentReadiness === true) {
    const deploymentEnvironment = options.deploymentEnvironment || process.env;
    const deployment = buildFtCommunityDeploymentReadiness(
      deploymentEnvironment
    );
    check(
      "production_deployment_environment",
      deployment.ready,
      "production_deployment_environment_not_ready",
      deployment
    );
    if (deployment.ready && !expectedTestGuildRelease) {
      try {
        expectedTestGuildRelease = createVerifiedFtCommunityReleaseBinding(deploymentEnvironment);
      } catch {
        check(
          "production_release_binding",
          false,
          "production_release_binding_unavailable"
        );
      }
    }
  }

  if (options.requireTestGuildRehearsal === true) {
    const rehearsal = await inspectTestGuildRehearsalPair({
      fileApi,
      artifactRoot,
      evidencePath: options.testGuildRehearsalEvidencePath,
      previousEvidencePath: options.testGuildRehearsalPreviousEvidencePath,
      evidenceSecret: options.testGuildRehearsalEvidenceSecret,
      expectedGuildId: options.expectedTestGuildId || PARADISE_TEST_GUILD_ID,
      expectedRelease: expectedTestGuildRelease,
      maxAgeMs: Number.isFinite(options.testGuildRehearsalMaxAgeMs)
        ? options.testGuildRehearsalMaxAgeMs
        : DEFAULT_TEST_GUILD_REHEARSAL_MAX_AGE_MS,
      nowMs
    });
    check("test_guild_rehearsal_pair", rehearsal.ok, rehearsal.code, rehearsal.details);
  }

  try {
    const marker = await readRollbackMarker(guildId);
    check("rollback_marker", !marker || marker.status === "resolved", "unresolved_rollback_marker", {
      present: Boolean(marker),
      status: marker?.status || null,
      markerId: marker?.markerId || null
    });
  } catch (error) {
    check("rollback_marker", false, safeErrorCode(error, "rollback_marker_read_failed"));
  }

  try {
    const lease = await readLeaseStatus(guildId);
    const ownReentrantLease = Boolean(
      lease?.locked
      && allowedCorrelationId
      && String(lease?.correlationId || "") === allowedCorrelationId
    );
    check("mutation_lease", !lease?.locked || ownReentrantLease, "foreign_active_mutation_lease", {
      locked: Boolean(lease?.locked),
      ownReentrantLease,
      operation: lease?.operation || null,
      phase: lease?.phase || null,
      status: lease?.status || null,
      recoverable: Boolean(lease?.recoverable)
    });
  } catch (error) {
    check("mutation_lease", false, safeErrorCode(error, "mutation_lease_read_failed"));
  }

  const clientUserId = String(guild?.client?.user?.id || "").trim();
  check("bot_identity", Boolean(clientUserId), "bot_identity_missing", { present: Boolean(clientUserId) });

  const missingIntents = REQUIRED_INTENTS.filter(name => !hasNamedIntent(guild?.client, name));
  check("gateway_intents", missingIntents.length === 0, "required_gateway_intent_missing", { missing: missingIntents });

  let me = guild?.members?.me || null;
  if (!me && guild?.members?.fetchMe) {
    try {
      me = await guild.members.fetchMe();
    } catch {
      me = null;
    }
  }
  check("bot_guild_member", Boolean(me?.id) && String(me.id) === clientUserId, "bot_guild_member_missing", {
    memberPresent: Boolean(me?.id),
    identityMatches: Boolean(me?.id) && String(me.id) === clientUserId
  });

  const ownerId = String(guild?.ownerId || "").trim();
  check("guild_owner_identity", Boolean(ownerId), "guild_owner_identity_missing", { present: Boolean(ownerId) });

  const missingGuildPermissions = REQUIRED_GUILD_PERMISSIONS.filter(name => !hasNamedPermission(me?.permissions, name));
  check("guild_permissions", missingGuildPermissions.length === 0, "required_guild_permission_missing", {
    missing: missingGuildPermissions
  });

  try {
    capturedSnapshot = await captureSnapshot(guild, { state });
    check("backup_capture", Boolean(capturedSnapshot), "backup_snapshot_missing");
    if (capturedSnapshot) {
      const envelope = createParadiseBackupEnvelope(capturedSnapshot, new Date(nowMs));
      const validation = validateParadiseBackupEnvelope(envelope);
      check("backup_integrity", validation.valid, validation.code || "backup_envelope_validation_failed");
      if (validation.valid) {
        capturedBackupEnvelope = envelope;
        capturedBackup = {
          guildId: String(envelope.guildId || envelope.guild?.id || ""),
          digest: paradiseBackupStateDigest(envelope),
          artifactDigest: envelope.integrity.digest,
          capturedAt: envelope.integrity.capturedAt
        };
      }
    }
  } catch (error) {
    check("backup_capture", false, safeErrorCode(error, "backup_snapshot_capture_failed"));
  }

  if (capturedSnapshot) {
    const missingScopes = REQUIRED_RESTORE_SCOPES.filter(scope => capturedSnapshot?.restoreCapabilities?.[scope] !== true);
    check("backup_restore_scopes", missingScopes.length === 0, "backup_restore_scope_incomplete", {
      missing: missingScopes,
      captureErrorCodes: (capturedSnapshot.captureErrors || []).map(error => String(error?.code || "unknown").slice(0, 120))
    });

    const members = new Set((capturedSnapshot.memberRoles || []).map(member => String(member?.memberId || "")));
    check("owner_member_access", Boolean(ownerId) && members.has(ownerId), "guild_owner_member_not_captured", {
      ownerPresent: Boolean(ownerId) && members.has(ownerId)
    });
    check("bot_member_access", Boolean(clientUserId) && members.has(clientUserId), "bot_member_not_captured", {
      botPresent: Boolean(clientUserId) && members.has(clientUserId)
    });

    const mappedMessageIds = [...new Set((capturedSnapshot.guildConfigReferences?.messageIds || []).map(String).filter(Boolean))];
    const capturedMessageIds = new Set((capturedSnapshot.canonicalMessages || []).map(message => String(message?.id || "")));
    const missingMappedMessageIds = mappedMessageIds.filter(id => !capturedMessageIds.has(id));
    check("mapped_messages", missingMappedMessageIds.length === 0, "mapped_canonical_message_missing", {
      expectedCount: mappedMessageIds.length,
      missingCount: missingMappedMessageIds.length,
      missingIds: missingMappedMessageIds
    });

    const mappedChannelIds = [...new Set((capturedSnapshot.guildConfigReferences?.channelIds || []).map(String).filter(Boolean))];
    const capturedChannelIds = new Set([
      ...(capturedSnapshot.categories || []),
      ...(capturedSnapshot.channels || [])
    ].map(channel => String(channel?.id || "")));
    const missingMappedChannelIds = mappedChannelIds.filter(id => !capturedChannelIds.has(id));
    check("mapped_channels", missingMappedChannelIds.length === 0, "mapped_channel_missing", {
      expectedCount: mappedChannelIds.length,
      missingCount: missingMappedChannelIds.length,
      missingIds: missingMappedChannelIds
    });

    const botHighestPosition = Number(me?.roles?.highest?.position);
    const hierarchyBlockers = (capturedSnapshot.roles || [])
      .filter(role => !role?.managed
        && String(role?.id || "") !== guildId
        && role?.name !== "@everyone"
        && (!Number.isFinite(botHighestPosition) || Number(role?.position || 0) >= botHighestPosition))
      .map(role => ({ id: String(role?.id || ""), name: String(role?.name || ""), position: Number(role?.position || 0) }));
    check("bot_role_hierarchy", Number.isFinite(botHighestPosition) && botHighestPosition > 0 && hierarchyBlockers.length === 0,
      "bot_role_hierarchy_blocked", {
        botHighestPosition: Number.isFinite(botHighestPosition) ? botHighestPosition : null,
        blockedRoles: hierarchyBlockers
      });
  }

  const unreadableChannels = values(guild?.channels?.cache)
    .filter(isTextBackupChannel)
    .flatMap(channel => {
      const permissions = channel?.permissionsFor?.(me);
      const missing = ["ViewChannel", "ReadMessageHistory"].filter(name => !hasNamedPermission(permissions, name));
      return missing.length ? [{ id: String(channel?.id || ""), name: String(channel?.name || ""), missing }] : [];
    });
  check("text_channel_backup_access", unreadableChannels.length === 0, "text_channel_backup_access_missing", {
    blockedChannels: unreadableChannels
  });

  try {
    const artifactProbe = await probeArtifactStorage({ fileApi, artifactRoot, guildId });
    check("artifact_storage", artifactProbe.ok, artifactProbe.failure || "artifact_storage_probe_failed", artifactProbe);
  } catch (error) {
    check("artifact_storage", false, safeErrorCode(error, "artifact_storage_probe_failed"));
  }

  const report = {
    ready: blockers.length === 0,
    code: blockers.length ? blockers[0].code : "paradise_rebuild_preflight_ready",
    checks,
    blockers,
    snapshot: capturedSnapshot ? snapshotSummary(capturedSnapshot) : null,
    backup: capturedBackup,
    checkedAt,
    mutationCount: 0
  };
  // The full backup contains sensitive server state and is intentionally
  // excluded from the public report. Only the server-side production plan
  // creator may opt into receiving it in-memory for sealed persistence.
  if (options.includeBackupEnvelope === true) {
    report.backupEnvelope = capturedBackupEnvelope;
  }
  return report;
}

export const PARADISE_REBUILD_REQUIRED_INTENTS = REQUIRED_INTENTS;
export const PARADISE_REBUILD_REQUIRED_GUILD_PERMISSIONS = REQUIRED_GUILD_PERMISSIONS;
export const PARADISE_REBUILD_REQUIRED_RESTORE_SCOPES = REQUIRED_RESTORE_SCOPES;
