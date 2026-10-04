import assert from "node:assert/strict";
import test from "node:test";
import {
  buildParadiseRestoreDryRun,
  createParadiseBackupEnvelope,
  paradiseBackupStateDigest,
  validateParadiseBackupArtifactCopies,
  validateParadiseBackupEnvelope
} from "../src/paradiseBackupIntegrity.js";

test("Paradise backup integrity envelope has stable SHA256 validation and count metadata", () => {
  const backup = createParadiseBackupEnvelope({
    status: "snapshot", guild: { id: "guild-a" }, categories: [{ id: "cat" }],
    channels: [{ id: "channel" }], roles: [{ id: "role" }], memberRoles: [],
    canonicalMessages: [], contentArchive: [], autoModRules: [], webhooks: [], tickets: []
  }, "2026-07-11T00:00:00.000Z");
  assert.equal(backup.backupSchemaVersion, 3);
  assert.equal(backup.integrity.algorithm, "sha256");
  assert.equal(backup.integrity.counts.channels, 1);
  assert.deepEqual(validateParadiseBackupEnvelope(backup), { valid: true, code: "backup_valid", counts: backup.integrity.counts });
  backup.channels[0].id = "tampered";
  assert.equal(validateParadiseBackupEnvelope(backup).code, "backup_checksum_mismatch");
});

test("preflight state digest ignores capture time but rejects real guild state changes", () => {
  const first = {
    capturedAt: "2026-07-11T00:00:00.000Z",
    guildId: "guild-a",
    channels: [{ id: "channel-a", name: "general" }],
    roles: []
  };
  const recaptured = { ...structuredClone(first), capturedAt: "2026-07-11T00:01:00.000Z" };
  const changed = structuredClone(recaptured);
  changed.channels[0].name = "announcements";

  assert.equal(paradiseBackupStateDigest(first), paradiseBackupStateDigest(recaptured));
  assert.notEqual(paradiseBackupStateDigest(first), paradiseBackupStateDigest(changed));

  const firstEnvelope = createParadiseBackupEnvelope(first, first.capturedAt);
  const recapturedEnvelope = createParadiseBackupEnvelope(recaptured, recaptured.capturedAt);
  assert.notEqual(firstEnvelope.integrity.digest, recapturedEnvelope.integrity.digest);
  assert.equal(firstEnvelope.integrity.stateDigest, recapturedEnvelope.integrity.stateDigest);
});

test("restore dry-run is actionable only for a complete same-guild allowlisted snapshot", () => {
  const guildId = "test-guild";
  const restoreCapabilities = {
    version: 2, guildIdentity: true, roles: true, memberRoles: true, channels: true,
    canonicalMessages: true, contentArchive: true, autoModRules: true, webhooks: true, tickets: true
  };
  const backup = createParadiseBackupEnvelope({
    guild: { id: guildId, name: "FIMA" }, restoreCapabilities,
    categories: [], channels: [{ id: "one", name: "chat", type: 0 }], roles: [], memberRoles: [],
    canonicalMessages: [], contentArchive: [{ id: "archive-only", automaticRestore: false }], autoModRules: [], webhooks: [], tickets: []
  });
  const preview = buildParadiseRestoreDryRun({
    backup,
    currentSnapshot: {
      guild: { id: guildId, name: "FIMA" }, categories: [], channels: [], roles: [], memberRoles: [],
      canonicalMessages: [], contentArchive: [], autoModRules: [], webhooks: [], tickets: []
    },
    expectedGuildId: guildId,
    allowedGuildId: guildId
  });
  assert.equal(preview.status, "ready");
  assert.equal(preview.canRestore, true);
  assert.equal(preview.mutationsPlanned, 1);
  assert.equal(preview.countDelta.channels, 1);
  assert.equal(preview.plan.channels.create[0].sourceId, "one");
  assert.equal(Object.hasOwn(preview.plan, "contentArchive"), false);
  backup.channels[0].id = "tampered";
  assert.equal(buildParadiseRestoreDryRun({ backup }).status, "blocked");
});

test("restore dry-run blocks wrong guild, non-allowlisted targets and incomplete snapshots", () => {
  const backup = createParadiseBackupEnvelope({
    guildId: "test-guild", restoreCapabilities: { version: 2 },
    categories: [], channels: [], roles: [], memberRoles: [], canonicalMessages: [], contentArchive: [], autoModRules: [], webhooks: [], tickets: []
  });
  const currentSnapshot = { guildId: "test-guild", categories: [], channels: [], roles: [] };
  assert.equal(buildParadiseRestoreDryRun({
    backup, currentSnapshot, expectedGuildId: "other", allowedGuildId: "other"
  }).code, "backup_guild_mismatch");
  assert.equal(buildParadiseRestoreDryRun({
    backup, currentSnapshot, expectedGuildId: "test-guild", allowedGuildId: "production"
  }).code, "restore_target_not_allowlisted");
  assert.equal(buildParadiseRestoreDryRun({
    backup, currentSnapshot, expectedGuildId: "test-guild", allowedGuildId: "test-guild"
  }).code, "backup_restore_scope_incomplete");
});

test("restore dry-run detects integrity metadata tampering", () => {
  const backup = createParadiseBackupEnvelope({ guildId: "test-guild", categories: [], channels: [], roles: [] });
  backup.integrity.counts.channels = 99;
  assert.equal(validateParadiseBackupEnvelope(backup).code, "backup_count_metadata_mismatch");
});

test("both persisted backup artifacts must independently match the source digest, guild and counts", () => {
  const guildId = "test-guild";
  const backup = createParadiseBackupEnvelope({
    guild: { id: guildId, name: "FIMA" }, categories: [],
    channels: [{ id: "chat", name: "chat", type: 0 }], roles: [], memberRoles: [],
    canonicalMessages: [], contentArchive: [], autoModRules: [], webhooks: [], tickets: []
  }, "2026-07-19T00:00:00.000Z");
  const copy = () => structuredClone(backup);

  const valid = validateParadiseBackupArtifactCopies({
    timestampedBackup: copy(), canonicalBackup: copy(), expectedBackup: backup, expectedGuildId: guildId
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.code, "backup_artifact_copies_valid");
  assert.equal(valid.artifacts.timestamped.countsMatch, true);
  assert.equal(valid.artifacts.canonical.countsMatch, true);

  const corruptCanonical = copy();
  corruptCanonical.channels[0].name = "tampered";
  assert.deepEqual(
    validateParadiseBackupArtifactCopies({
      timestampedBackup: copy(), canonicalBackup: corruptCanonical, expectedBackup: backup, expectedGuildId: guildId
    }).code,
    "canonical_backup_invalid"
  );

  const differentCanonical = createParadiseBackupEnvelope({
    guild: { id: guildId, name: "FIMA" }, categories: [],
    channels: [{ id: "other", name: "other", type: 0 }], roles: [], memberRoles: [],
    canonicalMessages: [], contentArchive: [], autoModRules: [], webhooks: [], tickets: []
  }, "2026-07-19T00:00:00.000Z");
  assert.equal(
    validateParadiseBackupArtifactCopies({
      timestampedBackup: copy(), canonicalBackup: differentCanonical, expectedBackup: backup, expectedGuildId: guildId
    }).code,
    "canonical_backup_digest_mismatch"
  );
});

test("restore comparison ignores stale AutoMod exemptions absent from backup resources", () => {
  const guildId = "test-guild";
  const staleRoleId = "100000000000009911";
  const staleChannelId = "100000000000009912";
  const restoreCapabilities = {
    version: 2, guildIdentity: true, roles: true, memberRoles: true, channels: true,
    canonicalMessages: true, contentArchive: true, autoModRules: true, webhooks: true, tickets: true
  };
  const snapshot = {
    guild: { id: guildId, name: "FIMA" }, restoreCapabilities,
    categories: [], channels: [], roles: [], memberRoles: [], canonicalMessages: [], contentArchive: [],
    autoModRules: [{
      id: "rule-source", name: "Block spam", eventType: 1, triggerType: 5,
      triggerMetadata: {}, actions: [{ type: 1, metadata: {} }], enabled: true,
      exemptRoleIds: [staleRoleId], exemptChannelIds: [staleChannelId]
    }],
    webhooks: [], tickets: []
  };
  const backup = createParadiseBackupEnvelope(snapshot);
  const currentSnapshot = structuredClone(snapshot);
  currentSnapshot.autoModRules[0].id = "rule-current";
  currentSnapshot.autoModRules[0].exemptRoleIds = [];
  currentSnapshot.autoModRules[0].exemptChannelIds = [];

  const dryRun = buildParadiseRestoreDryRun({
    backup,
    currentSnapshot,
    expectedGuildId: guildId,
    allowedGuildId: guildId
  });
  assert.equal(dryRun.canRestore, true);
  assert.equal(dryRun.mutationsPlanned, 0);
});
