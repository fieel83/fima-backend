import assert from "node:assert/strict";
import test from "node:test";
import { buildParadiseRestoreDryRun, createParadiseBackupEnvelope, validateParadiseBackupEnvelope } from "../src/paradiseBackupIntegrity.js";

test("Paradise backup integrity envelope has stable SHA256 validation and count metadata", () => {
  const backup = createParadiseBackupEnvelope({
    status: "snapshot", guild: { id: "guild-a" }, categories: [{ id: "cat" }],
    channels: [{ id: "channel" }], roles: [{ id: "role" }], autoModRules: [], webhooks: []
  }, "2026-07-11T00:00:00.000Z");
  assert.equal(backup.backupSchemaVersion, 1);
  assert.equal(backup.integrity.algorithm, "sha256");
  assert.equal(backup.integrity.counts.channels, 1);
  assert.deepEqual(validateParadiseBackupEnvelope(backup), { valid: true, code: "backup_valid", counts: backup.integrity.counts });
  backup.channels[0].id = "tampered";
  assert.equal(validateParadiseBackupEnvelope(backup).code, "backup_checksum_mismatch");
});

test("restore dry-run is non-mutating and blocks an invalid backup", () => {
  const backup = createParadiseBackupEnvelope({ categories: [], channels: [{ id: "one" }], roles: [], autoModRules: [], webhooks: [] });
  const preview = buildParadiseRestoreDryRun({ backup, currentSnapshot: { categories: [], channels: [], roles: [], autoModRules: [], webhooks: [] } });
  assert.equal(preview.status, "preview_only");
  assert.equal(preview.canRestore, false);
  assert.equal(preview.mutationsPlanned, 0);
  assert.equal(preview.countDelta.channels, 1);
  backup.channels[0].id = "tampered";
  assert.equal(buildParadiseRestoreDryRun({ backup }).status, "blocked");
});
