import assert from "node:assert/strict";
import test from "node:test";
import { createParadiseBackupEnvelope, validateParadiseBackupEnvelope } from "../src/paradiseBackupIntegrity.js";

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
