import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  armParadiseRollbackMarker,
  assertNoUnresolvedParadiseRollback,
  paradiseRollbackMarkerPath,
  readParadiseRollbackMarker,
  resolveParadiseRollbackMarker,
  updateParadiseRollbackMarker
} from "../src/paradiseRollbackMarker.js";

const GUILD_ID = "1520519015661961257";
const BACKUP_DIGEST = "a".repeat(64);

async function temporaryRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fima-rollback-marker-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function markerInput(overrides = {}) {
  return {
    guildId: GUILD_ID,
    backupArtifact: "D:\\safe-backups\\guild-backup.json",
    backupDigest: BACKUP_DIGEST,
    mode: "test_guild_rebuild",
    confirmation: `RESTORE ${GUILD_ID} ${BACKUP_DIGEST.slice(0, 12)}`,
    correlationId: "test-correlation",
    ...overrides
  };
}

test("rollback marker arms, survives a new reader and resolves with reconciliation", async t => {
  const root = await temporaryRoot(t);
  const armed = await armParadiseRollbackMarker(markerInput(), { root });

  assert.equal(armed.status, "armed");
  assert.equal(armed.guildId, GUILD_ID);
  assert.equal(armed.backupDigest, BACKUP_DIGEST);
  const restartedReader = await readParadiseRollbackMarker(GUILD_ID, { root });
  assert.equal(restartedReader.markerId, armed.markerId);
  await assert.rejects(
    assertNoUnresolvedParadiseRollback(GUILD_ID, { root }),
    { code: "unresolved_rollback_marker" }
  );

  const reconciliation = { canRestore: true, mutationsPlanned: 0 };
  const resolved = await resolveParadiseRollbackMarker(
    GUILD_ID,
    armed.markerId,
    reconciliation,
    { root }
  );
  assert.equal(resolved.status, "resolved");
  assert.deepEqual(resolved.reconciliation, reconciliation);
  assert.equal((await assertNoUnresolvedParadiseRollback(GUILD_ID, { root })).status, "resolved");
});

test("a second marker cannot arm while an unresolved marker exists", async t => {
  const root = await temporaryRoot(t);
  await armParadiseRollbackMarker(markerInput(), { root });

  await assert.rejects(
    armParadiseRollbackMarker(markerInput({ correlationId: "second" }), { root }),
    { code: "unresolved_rollback_marker" }
  );
});

test("corrupt and schema-invalid markers fail closed", async t => {
  const root = await temporaryRoot(t);
  const markerPath = paradiseRollbackMarkerPath(GUILD_ID, { root });
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(markerPath, "{not-json", "utf8");

  await assert.rejects(
    assertNoUnresolvedParadiseRollback(GUILD_ID, { root }),
    { code: "rollback_marker_corrupt" }
  );

  await fs.writeFile(markerPath, JSON.stringify({ schemaVersion: 1, guildId: GUILD_ID }), "utf8");
  await assert.rejects(
    assertNoUnresolvedParadiseRollback(GUILD_ID, { root }),
    { code: "rollback_marker_schema_invalid" }
  );
});

test("marker ownership mismatch prevents update and resolve", async t => {
  const root = await temporaryRoot(t);
  await armParadiseRollbackMarker(markerInput(), { root });

  await assert.rejects(
    updateParadiseRollbackMarker(GUILD_ID, "different-owner", { status: "rollback_required" }, { root }),
    { code: "rollback_marker_owner_mismatch" }
  );
  await assert.rejects(
    resolveParadiseRollbackMarker(GUILD_ID, "different-owner", null, { root }),
    { code: "rollback_marker_owner_mismatch" }
  );
});

test("rollback_required remains restart-safe and blocks another rebuild", async t => {
  const root = await temporaryRoot(t);
  const armed = await armParadiseRollbackMarker(markerInput(), { root });
  const required = await updateParadiseRollbackMarker(
    GUILD_ID,
    armed.markerId,
    {
      status: "rollback_required",
      rollbackError: { code: "automatic_rollback_reconciliation_failed" }
    },
    { root }
  );

  assert.equal(required.status, "rollback_required");
  await assert.rejects(
    assertNoUnresolvedParadiseRollback(GUILD_ID, { root }),
    { code: "unresolved_rollback_marker" }
  );
  await assert.rejects(
    armParadiseRollbackMarker(markerInput({ correlationId: "blocked-rebuild" }), { root }),
    { code: "unresolved_rollback_marker" }
  );
});

test("Windows replace fallback preserves an existing marker and installs the new marker", async t => {
  const root = await temporaryRoot(t);
  const first = await armParadiseRollbackMarker(markerInput(), { root });
  let simulatedReplaceFailure = false;
  const fileApi = new Proxy(fs, {
    get(target, property) {
      if (property === "rename") {
        return async (from, to) => {
          if (!simulatedReplaceFailure && String(to).endsWith(`${GUILD_ID}.json`)) {
            simulatedReplaceFailure = true;
            const error = new Error("simulated Windows replace contention");
            error.code = "EPERM";
            throw error;
          }
          return target.rename(from, to);
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });

  const updated = await updateParadiseRollbackMarker(
    GUILD_ID,
    first.markerId,
    { status: "rollback_required", rollback: { attempted: true } },
    { root, fileApi }
  );

  assert.equal(simulatedReplaceFailure, true);
  assert.equal(updated.status, "rollback_required");
  assert.deepEqual((await readParadiseRollbackMarker(GUILD_ID, { root })).rollback, { attempted: true });
  const files = await fs.readdir(root);
  assert.deepEqual(files, [`${GUILD_ID}.json`]);
});

test("rollback marker redacts raw Discord failure messages, IDs and tokens", async t => {
  const root = await temporaryRoot(t);
  const armed = await armParadiseRollbackMarker(markerInput(), { root });
  const leakedDiscordId = "100000000000009931";
  const leakedToken = "sensitive-token-must-not-persist";
  const updated = await updateParadiseRollbackMarker(
    GUILD_ID,
    armed.markerId,
    {
      status: "rollback_required",
      failure: {
        code: "restore_automod_create_failed",
        message: `Discord 50035 for ${leakedDiscordId} with ${leakedToken}`,
        context: {
          operation: "create",
          resourceKind: "auto_mod_rule",
          index: 4,
          channelId: leakedDiscordId,
          token: leakedToken
        }
      },
      rollbackError: {
        code: 50035,
        message: `Invalid Form Body ${leakedDiscordId} ${leakedToken}`
      }
    },
    { root }
  );

  assert.deepEqual(updated.failure, {
    code: "restore_automod_create_failed",
    context: { operation: "create", resourceKind: "auto_mod_rule", index: 4 }
  });
  assert.deepEqual(updated.rollbackError, { code: "automatic_rollback_failed" });
  const persisted = await readParadiseRollbackMarker(GUILD_ID, { root });
  for (const failure of [persisted.failure, persisted.rollbackError]) {
    const serialized = JSON.stringify(failure);
    assert.doesNotMatch(serialized, /Discord 50035|Invalid Form Body/);
    assert.doesNotMatch(serialized, new RegExp(leakedDiscordId));
    assert.doesNotMatch(serialized, new RegExp(leakedToken));
  }
});
