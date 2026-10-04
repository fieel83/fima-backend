import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  PARADISE_TEST_GUILD_ID,
  PARADISE_TEST_REHEARSAL_CONFIRMATION,
  PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
  recoverParadiseTestRollback,
  rehearseParadiseTestTemplate
} from "../src/paradise3a59.js";

const DIGEST = "a".repeat(64);
const STATE_DIGEST = "b".repeat(64);

function rollbackRecoveryFixture(options = {}) {
  const events = [];
  const artifactRoot = path.resolve("artifacts", "post-security-backlog");
  const backup = {
    backupSchemaVersion: 3,
    guildId: options.backupGuildId || PARADISE_TEST_GUILD_ID,
    guild: { id: options.backupGuildId || PARADISE_TEST_GUILD_ID },
    integrity: {
      digest: options.backupDigest || DIGEST,
      stateDigest: options.stateDigest || STATE_DIGEST
    }
  };
  const marker = options.marker === null ? null : {
    schemaVersion: options.markerSchemaVersion ?? 1,
    markerId: options.markerId || "marker-recovery-test",
    guildId: options.markerGuildId || PARADISE_TEST_GUILD_ID,
    status: options.markerStatus || "rollback_required",
    mode: options.markerMode || "test_guild_rebuild:community",
    backupArtifact: options.backupArtifact || path.join(artifactRoot, "backup.json"),
    backupDigest: options.markerDigest || DIGEST
  };
  let markerReadCount = 0;
  let dryRunCount = 0;
  let restoreCount = 0;
  let currentMarkerStatus = marker?.status || null;
  let resolved = null;
  let lockOptions = null;
  const dependencies = {
    artifactRoot,
    withMutationLock: async (_guild, purpose, operation, optionsValue) => {
      events.push(`lock:${purpose}`);
      lockOptions = optionsValue;
      if (options.lockError) throw Object.assign(new Error(options.lockError), { code: options.lockError });
      return operation();
    },
    updateLease: async update => { events.push(`lease:${update.phase}`); },
    readRollback: async () => {
      markerReadCount += 1;
      events.push(`marker_read:${markerReadCount}`);
      if (options.markerReadError) {
        throw Object.assign(new Error(options.markerReadError), { code: options.markerReadError });
      }
      if (options.changedMarker && markerReadCount > 1) {
        return { ...marker, markerId: "changed-marker" };
      }
      return marker ? structuredClone({ ...marker, status: currentMarkerStatus }) : null;
    },
    readBackupArtifact: async () => {
      events.push("backup_read");
      if (options.backupReadError) throw new SyntaxError("invalid backup json");
      return structuredClone(backup);
    },
    validateBackup: () => options.invalidBackup
      ? { valid: false, code: "backup_checksum_mismatch" }
      : { valid: true, code: "backup_valid" },
    backupStateDigest: () => options.calculatedStateDigest || STATE_DIGEST,
    rollbackCacheRefreshTimeoutMs: options.rollbackCacheRefreshTimeoutMs,
    loadState: async () => ({ state: "fresh" }),
    captureSnapshot: async () => {
      events.push(dryRunCount === 0 ? "fresh_snapshot" : "post_restore_snapshot");
      return { guildId: PARADISE_TEST_GUILD_ID };
    },
    createRestoreDryRun: () => {
      dryRunCount += 1;
      const postRestore = dryRunCount > 1;
      return {
        canRestore: postRestore ? options.postRestoreCanRestore !== false : options.canRestore !== false,
        mutationsPlanned: postRestore
          ? Number(options.postRestoreMutationsPlanned || 0)
          : Number(options.mutationsPlanned || 0),
        plan: { discordMutationMethodsCalled: false }
      };
    },
    persistArtifact: async (name, value) => {
      events.push("reconciliation_persisted");
      assert.match(name, /^test-guild-rollback-recovery-reconciliation-.+\.json$/);
      assert.equal(
        value.resolutionEligible,
        value.reconciliation.canRestore === true && Number(value.reconciliation.mutationsPlanned || 0) === 0
      );
      return path.join(artifactRoot, name);
    },
    updateRollback: async (_guildId, markerId, update) => {
      events.push(`marker_update:${update.status}`);
      currentMarkerStatus = update.status;
      return { markerId, status: update.status };
    },
    restoreBackup: async ({
      backup: restoreBackup,
      confirmation,
      allowedGuildId,
      persistRestoredState
    }) => {
      restoreCount += 1;
      events.push("restore_backup");
      assert.deepEqual(restoreBackup, backup);
      assert.equal(allowedGuildId, PARADISE_TEST_GUILD_ID);
      assert.equal(confirmation, `RESTORE TEST ${PARADISE_TEST_GUILD_ID} ${DIGEST.slice(0, 12).toUpperCase()}`);
      assert.equal(typeof persistRestoredState, "function");
      if (options.restoreError) throw Object.assign(new Error("restore failed"), { code: "restore_failed" });
      await persistRestoredState({ guildId: PARADISE_TEST_GUILD_ID });
      return { restored: true };
    },
    persistRestoredState: async () => { events.push("persist_restored_state"); },
    resolveRollback: async (_guildId, markerId, reconciliation) => {
      events.push("marker_resolved");
      if (options.resolveError) {
        throw Object.assign(new Error("resolve failed"), { code: "resolve_failed" });
      }
      resolved = { markerId, reconciliation };
      currentMarkerStatus = "resolved";
      return { markerId, status: "resolved" };
    }
  };
  return {
    guild: {
      id: PARADISE_TEST_GUILD_ID,
      channels: { fetch: async () => {
        events.push("fetch_channels");
        if (options.hangChannelFetch) return new Promise(() => {});
      } },
      roles: { fetch: async () => { events.push("fetch_roles"); } }
    },
    dependencies,
    events,
    marker,
    resolved: () => resolved,
    lockOptions: () => lockOptions,
    counts: () => ({ dryRunCount, restoreCount })
  };
}

test("rollback recovery uses a fail-fast lease and resolves the same marker only after fresh zero-diff evidence", async () => {
  const fixture = rollbackRecoveryFixture();
  const result = await recoverParadiseTestRollback(
    fixture.guild,
    PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
    fixture.dependencies
  );

  assert.deepEqual(result, {
    action: "recover-rollback",
    status: "ok",
    completedAt: result.completedAt,
    mode: "community",
    rollbackRecovered: true,
    reconciliationCanRestore: true,
    reconciliationMutationsPlanned: 0
  });
  assert.equal(fixture.lockOptions().failIfLocked, true);
  assert.equal(fixture.resolved().markerId, fixture.marker.markerId);
  assert.deepEqual(fixture.resolved().reconciliation, {
    canRestore: true,
    mutationsPlanned: 0,
    source: "fresh_test_guild_rollback_recovery_snapshot"
  });
  assert.ok(fixture.events.indexOf("fresh_snapshot") < fixture.events.indexOf("reconciliation_persisted"));
  assert.ok(fixture.events.indexOf("reconciliation_persisted") < fixture.events.indexOf("marker_resolved"));
  assert.equal(fixture.events.some(event => /restore|delete|create_channel|create_role/.test(event)), false);
  assert.deepEqual(fixture.counts(), { dryRunCount: 1, restoreCount: 0 });
});

test("rollback recovery rejects any other guild or confirmation before acquiring a lease", async t => {
  for (const [guild, confirmation, code] of [
    [{ id: "00000000000000000" }, PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION, "test_guild_only"],
    [{ id: PARADISE_TEST_GUILD_ID }, "RECOVER ROLLBACK", "typed_confirmation_mismatch"]
  ]) {
    await t.test(code, async () => {
      const fixture = rollbackRecoveryFixture();
      await assert.rejects(recoverParadiseTestRollback(guild, confirmation, fixture.dependencies), { code });
      assert.equal(fixture.events.length, 0);
    });
  }
});

test("rollback recovery fails closed on an active lease", async () => {
  const fixture = rollbackRecoveryFixture({ lockError: "persistent_mutation_lock_held" });
  await assert.rejects(
    recoverParadiseTestRollback(
      fixture.guild,
      PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
      fixture.dependencies
    ),
    { code: "persistent_mutation_lock_held" }
  );
  assert.deepEqual(fixture.events, ["lock:recover_rollback"]);
});

test("rollback recovery rejects missing, corrupt, resolved, malformed, or changed markers", async t => {
  const cases = [
    ["missing", { marker: null }, "rollback_marker_missing"],
    ["corrupt", { markerReadError: "rollback_marker_corrupt" }, "rollback_marker_corrupt"],
    ["resolved", { markerStatus: "resolved" }, "rollback_marker_not_recoverable"],
    ["wrong mode", { markerMode: "production_ft_community_rebuild:community" }, "rollback_recovery_marker_mode_mismatch"],
    ["wrong guild", { markerGuildId: "00000000000000000" }, "rollback_marker_schema_invalid"],
    ["wrong schema", { markerSchemaVersion: 2 }, "rollback_marker_schema_invalid"],
    ["changed", { changedMarker: true }, "rollback_recovery_marker_changed"]
  ];
  for (const [name, options, code] of cases) {
    await t.test(name, async () => {
      const fixture = rollbackRecoveryFixture(options);
      await assert.rejects(
        recoverParadiseTestRollback(
          fixture.guild,
          PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
          fixture.dependencies
        ),
        { code }
      );
      assert.equal(fixture.resolved(), null);
    });
  }
});

test("rollback recovery rejects traversal and any invalid backup binding", async t => {
  const cases = [
    ["path traversal", { backupArtifact: path.resolve("artifacts", "outside.json") }, "rollback_recovery_backup_path_invalid"],
    ["corrupt json", { backupReadError: true }, "rollback_recovery_backup_artifact_invalid"],
    ["invalid envelope", { invalidBackup: true }, "rollback_recovery_backup_invalid"],
    ["marker digest mismatch", { markerDigest: "c".repeat(64) }, "rollback_recovery_backup_digest_mismatch"],
    ["state digest mismatch", { calculatedStateDigest: "c".repeat(64) }, "rollback_recovery_backup_state_digest_mismatch"],
    ["backup guild mismatch", { backupGuildId: "00000000000000000" }, "rollback_recovery_backup_guild_mismatch"]
  ];
  for (const [name, options, code] of cases) {
    await t.test(name, async () => {
      const fixture = rollbackRecoveryFixture(options);
      await assert.rejects(
        recoverParadiseTestRollback(
          fixture.guild,
          PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
          fixture.dependencies
        ),
        { code }
      );
      assert.equal(fixture.resolved(), null);
      assert.equal(fixture.events.includes("fresh_snapshot"), false);
    });
  }
});

test("rollback recovery keeps the marker open when the fresh snapshot is not safely restorable", async () => {
  const fixture = rollbackRecoveryFixture({ canRestore: false });
  await assert.rejects(
    recoverParadiseTestRollback(
      fixture.guild,
      PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
      fixture.dependencies
    ),
    { code: "rollback_recovery_reconciliation_not_zero" }
  );
  assert.equal(fixture.events.includes("reconciliation_persisted"), true);
  assert.equal(fixture.events.includes("restore_backup"), false);
  assert.equal(fixture.resolved(), null);
});

test("rollback recovery restores nonzero drift and resolves only after a second fresh zero-diff snapshot", async () => {
  const fixture = rollbackRecoveryFixture({ mutationsPlanned: 58 });
  const result = await recoverParadiseTestRollback(
    fixture.guild,
    PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
    fixture.dependencies
  );

  assert.equal(result.status, "ok");
  assert.deepEqual(fixture.counts(), { dryRunCount: 2, restoreCount: 1 });
  assert.equal(fixture.events.includes("persist_restored_state"), true);
  assert.ok(fixture.events.indexOf("marker_update:rollback_in_progress") < fixture.events.indexOf("restore_backup"));
  assert.ok(fixture.events.indexOf("restore_backup") < fixture.events.indexOf("fetch_channels"));
  assert.ok(fixture.events.indexOf("fetch_roles") < fixture.events.indexOf("post_restore_snapshot"));
  assert.ok(fixture.events.indexOf("post_restore_snapshot") < fixture.events.indexOf("marker_resolved"));
  assert.deepEqual(fixture.resolved().reconciliation, {
    canRestore: true,
    mutationsPlanned: 0,
    source: "fresh_test_guild_rollback_recovery_post_restore_snapshot"
  });
});

test("rollback recovery bounds a stranded post-restore cache refresh and keeps rollback required", async () => {
  const fixture = rollbackRecoveryFixture({
    mutationsPlanned: 1,
    hangChannelFetch: true,
    rollbackCacheRefreshTimeoutMs: 20
  });

  await assert.rejects(
    recoverParadiseTestRollback(
      fixture.guild,
      PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
      fixture.dependencies
    ),
    { code: "rollback_recovery_cache_refresh_timeout" }
  );

  assert.equal(fixture.events.includes("post_restore_snapshot"), false);
  assert.equal(fixture.events.includes("marker_resolved"), false);
  assert.equal(fixture.events.includes("marker_update:rollback_required"), true);
  assert.equal(fixture.events.includes("lease:rollback_recovery_failed_rollback_required"), true);
});

test("rollback recovery resolves a stranded in-progress marker without mutation when fresh drift is zero", async () => {
  const fixture = rollbackRecoveryFixture({ markerStatus: "rollback_in_progress" });
  const result = await recoverParadiseTestRollback(
    fixture.guild,
    PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
    fixture.dependencies
  );

  assert.equal(result.status, "ok");
  assert.deepEqual(fixture.counts(), { dryRunCount: 1, restoreCount: 0 });
  assert.deepEqual(
    fixture.events.filter(event => event.startsWith("marker_update:")),
    []
  );
  assert.equal(fixture.events.includes("marker_resolved"), true);
});

test("rollback recovery resumes a stranded in-progress restore without replacing its marker binding", async () => {
  const fixture = rollbackRecoveryFixture({
    markerStatus: "rollback_in_progress",
    mutationsPlanned: 4
  });
  const result = await recoverParadiseTestRollback(
    fixture.guild,
    PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
    fixture.dependencies
  );

  assert.equal(result.status, "ok");
  assert.deepEqual(fixture.counts(), { dryRunCount: 2, restoreCount: 1 });
  assert.deepEqual(
    fixture.events.filter(event => event.startsWith("marker_update:")),
    []
  );
  assert.ok(fixture.events.indexOf("restore_backup") < fixture.events.indexOf("post_restore_snapshot"));
  assert.ok(fixture.events.indexOf("post_restore_snapshot") < fixture.events.indexOf("marker_resolved"));
});

test("rollback recovery returns a stranded in-progress marker to rollback_required after resumed restore failure", async () => {
  const fixture = rollbackRecoveryFixture({
    markerStatus: "rollback_in_progress",
    mutationsPlanned: 1,
    restoreError: true
  });

  await assert.rejects(
    recoverParadiseTestRollback(
      fixture.guild,
      PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
      fixture.dependencies
    ),
    { code: "restore_failed" }
  );
  assert.deepEqual(
    fixture.events.filter(event => event.startsWith("marker_update:")),
    ["marker_update:rollback_required"]
  );
  assert.equal(fixture.events.includes("lease:rollback_recovery_failed_rollback_required"), true);
});

test("rollback recovery returns a zero-drift stranded in-progress marker to rollback_required after resolution failure", async () => {
  const fixture = rollbackRecoveryFixture({
    markerStatus: "rollback_in_progress",
    resolveError: true
  });

  await assert.rejects(
    recoverParadiseTestRollback(
      fixture.guild,
      PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
      fixture.dependencies
    ),
    { code: "resolve_failed" }
  );
  assert.deepEqual(fixture.counts(), { dryRunCount: 1, restoreCount: 0 });
  assert.deepEqual(
    fixture.events.filter(event => event.startsWith("marker_update:")),
    ["marker_update:rollback_required"]
  );
  assert.equal(fixture.events.includes("lease:rollback_recovery_failed_rollback_required"), true);
});

for (const [name, options, code] of [
  ["restore failure", { mutationsPlanned: 1, restoreError: true }, "restore_failed"],
  ["post-restore drift", { mutationsPlanned: 1, postRestoreMutationsPlanned: 1 }, "rollback_recovery_post_restore_reconciliation_not_zero"],
  ["marker resolution failure", { mutationsPlanned: 1, resolveError: true }, "resolve_failed"]
]) {
  test(`rollback recovery leaves rollback_required after ${name}`, async () => {
    const fixture = rollbackRecoveryFixture(options);
    await assert.rejects(
      recoverParadiseTestRollback(
        fixture.guild,
        PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
        fixture.dependencies
      ),
      { code }
    );
    assert.equal(fixture.resolved(), null);
    assert.deepEqual(
      fixture.events.filter(event => event.startsWith("marker_update:")),
      ["marker_update:rollback_in_progress", "marker_update:rollback_required"]
    );
    assert.equal(fixture.events.includes("lease:rollback_recovery_failed_rollback_required"), true);
  });
}

function rehearsalFixture(options = {}) {
  const events = [];
  const artifacts = new Map();
  let snapshotCount = 0;
  let dryRunCount = 0;
  let smokeCount = 0;
  let restoreCount = 0;

  const guild = {
    id: PARADISE_TEST_GUILD_ID,
    channels: { fetch: async () => { events.push("fetch_channels"); } },
    roles: { fetch: async () => { events.push("fetch_roles"); } }
  };
  const backup = {
    schemaVersion: 1,
    guildId: PARADISE_TEST_GUILD_ID,
    integrity: {
      algorithm: "sha256",
      digest: DIGEST,
      stateDigest: STATE_DIGEST
    }
  };
  const dependencies = {
    requirePreflight: async () => { events.push("preflight"); return { ready: true }; },
    withMutationLock: async (_guild, purpose, operation, lockOptions) => {
      events.push(`lock:${purpose}:${lockOptions?.purposeKey}`);
      return operation();
    },
    currentLease: () => ({ correlationId: "test-correlation" }),
    updateLease: async update => { events.push(`lease:${update.phase}`); },
    loadState: async () => { events.push("load_state"); return { marker: "state" }; },
    captureSnapshot: async () => {
      snapshotCount += 1;
      events.push(`snapshot:${snapshotCount}`);
      return { guildId: PARADISE_TEST_GUILD_ID, snapshotCount };
    },
    createBackup: () => { events.push("create_backup"); return structuredClone(backup); },
    validateBackup: () => ({ valid: true }),
    createRestoreDryRun: () => {
      dryRunCount += 1;
      events.push(`dry_run:${dryRunCount}`);
      if (options.restoreMismatch && dryRunCount > 1) {
        return { canRestore: true, mutationsPlanned: 1 };
      }
      return { canRestore: true, mutationsPlanned: 0 };
    },
    validateBackupCopies: () => ({
      valid: true,
      algorithm: "sha256",
      artifactDigest: DIGEST,
      stateDigest: STATE_DIGEST,
      persistedArtifactDigest: DIGEST,
      persistedStateDigest: STATE_DIGEST
    }),
    persistArtifact: async (name, value) => {
      events.push(`persist:${name.includes("result") ? "result" : "backup"}`);
      artifacts.set(name, structuredClone(value));
      return name;
    },
    readArtifact: async name => structuredClone(artifacts.get(name)),
    rebuildTemplate: async (_guild, mode, confirmation, policy) => {
      events.push(`rebuild:${mode}:${confirmation}`);
      assert.equal(policy.retainRollbackMarkerForRehearsal, true);
      if (options.rebuildFailure) {
        throw Object.assign(new Error("rebuild_failed"), {
          code: "rebuild_failed",
          rollbackMarker: options.rebuildFailureMarker
            ? { markerId: "marker-from-rebuild", status: options.rebuildFailureMarker }
            : null
        });
      }
      return {
        status: "LIVE DISCORD VERIFIED",
        rollback: { required: true, markerId: "marker-test", markerStatus: "smoke_in_progress" }
      };
    },
    runSmoke: async (_guild, smokeOptions) => {
      smokeCount += 1;
      events.push(`smoke:${smokeCount}:${String(smokeOptions.fast)}`);
      if (options.failSmokeAt === smokeCount) {
        throw Object.assign(new Error(`smoke_${smokeCount}_failed`), { code: `smoke_${smokeCount}_failed` });
      }
      return { status: "LIVE DISCORD VERIFIED" };
    },
    restoreBackup: async ({ backup: restoredBackup, allowedGuildId, persistRestoredState }) => {
      restoreCount += 1;
      events.push(`restore:${restoreCount}`);
      assert.deepEqual(restoredBackup, backup);
      assert.equal(allowedGuildId, PARADISE_TEST_GUILD_ID);
      assert.equal(typeof persistRestoredState, "function");
      return { restored: true };
    },
    persistRestoredState: async () => { events.push("persist_restored_state"); },
    updateRollback: async (_guildId, markerId, update) => {
      events.push(`marker_update:${update.status}`);
      return { markerId, status: update.status };
    },
    resolveRollback: async (_guildId, markerId) => {
      events.push("marker_resolve");
      return { markerId, status: "resolved" };
    }
  };
  return {
    guild,
    dependencies,
    events,
    artifacts,
    counts: () => ({ snapshotCount, dryRunCount, smokeCount, restoreCount })
  };
}

test("full test-guild rehearsal rebuilds, runs two full smokes, restores, and verifies zero diff", async () => {
  const fixture = rehearsalFixture();
  const result = await rehearseParadiseTestTemplate(
    fixture.guild,
    "community",
    PARADISE_TEST_REHEARSAL_CONFIRMATION,
    fixture.dependencies
  );

  assert.equal(result.status, "LIVE DISCORD VERIFIED");
  assert.equal(result.action, "rehearsal");
  assert.equal(result.smokeRunsCompleted, 2);
  assert.equal(result.fullSmokeRunsVerified, true);
  assert.equal(result.backupAlgorithm, "sha256");
  assert.equal(result.backupArtifactDigest, DIGEST);
  assert.equal(result.backupStateDigest, STATE_DIGEST);
  assert.equal(result.persistedBackupArtifactDigest, DIGEST);
  assert.equal(result.persistedBackupStateDigest, STATE_DIGEST);
  assert.equal(result.restoredOriginalState, true);
  assert.equal(result.originalStateMutationsPlanned, 0);
  assert.deepEqual(fixture.counts(), {
    snapshotCount: 2,
    dryRunCount: 2,
    smokeCount: 2,
    restoreCount: 1
  });
  assert.ok(fixture.events.indexOf("rebuild:community:REBUILD TEST COMMUNITY") < fixture.events.indexOf("smoke:1:false"));
  assert.ok(fixture.events.indexOf("smoke:2:false") < fixture.events.indexOf("restore:1"));
  assert.ok(fixture.events.indexOf("restore:1") < fixture.events.indexOf("marker_resolve"));
  assert.equal(fixture.artifacts.has("test-guild-rehearsal-result.json"), true);
  assert.equal(JSON.stringify(result).includes(PARADISE_TEST_GUILD_ID), false);
  assert.equal(JSON.stringify(result).includes("marker-test"), false);
});

for (const failSmokeAt of [1, 2]) {
  test(`rehearsal rolls the initial backup back when full smoke ${failSmokeAt} fails`, async () => {
    const fixture = rehearsalFixture({ failSmokeAt });
    await assert.rejects(
      rehearseParadiseTestTemplate(
        fixture.guild,
        "community",
        PARADISE_TEST_REHEARSAL_CONFIRMATION,
        fixture.dependencies
      ),
      { code: `smoke_${failSmokeAt}_failed` }
    );
    assert.equal(fixture.counts().smokeCount, failSmokeAt);
    assert.equal(fixture.counts().restoreCount, 1);
    assert.equal(fixture.artifacts.has("test-guild-rehearsal-result.json"), false);
    assert.ok(fixture.events.includes("marker_update:rollback_in_progress"));
    assert.ok(fixture.events.includes("marker_resolve"));
  });
}

test("rehearsal resolves an unresolved rollback marker inherited from a failed rebuild", async () => {
  const fixture = rehearsalFixture({
    rebuildFailure: true,
    rebuildFailureMarker: "rollback_required"
  });
  await assert.rejects(
    rehearseParadiseTestTemplate(
      fixture.guild,
      "community",
      PARADISE_TEST_REHEARSAL_CONFIRMATION,
      fixture.dependencies
    ),
    { code: "rebuild_failed" }
  );
  assert.equal(fixture.counts().restoreCount, 1);
  assert.ok(fixture.events.includes("marker_update:rollback_in_progress"));
  assert.ok(fixture.events.includes("marker_resolve"));
});

test("rehearsal leaves an already resolved marker from a failed rebuild untouched", async () => {
  const fixture = rehearsalFixture({
    rebuildFailure: true,
    rebuildFailureMarker: "resolved"
  });
  await assert.rejects(
    rehearseParadiseTestTemplate(
      fixture.guild,
      "community",
      PARADISE_TEST_REHEARSAL_CONFIRMATION,
      fixture.dependencies
    ),
    { code: "rebuild_failed" }
  );
  assert.equal(fixture.counts().restoreCount, 1);
  assert.equal(fixture.events.some(event => event.startsWith("marker_update:")), false);
  assert.equal(fixture.events.includes("marker_resolve"), false);
});

test("rehearsal fails closed when the restored fresh snapshot is not zero diff", async () => {
  const fixture = rehearsalFixture({ restoreMismatch: true });
  await assert.rejects(
    rehearseParadiseTestTemplate(
      fixture.guild,
      "community",
      PARADISE_TEST_REHEARSAL_CONFIRMATION,
      fixture.dependencies
    ),
    { code: "test_rehearsal_original_state_mismatch" }
  );
  assert.equal(fixture.artifacts.has("test-guild-rehearsal-result.json"), false);
  assert.equal(fixture.counts().restoreCount, 2);
  assert.ok(fixture.events.includes("marker_update:rollback_required"));
});

test("rehearsal rejects any other guild, mode, or confirmation before preflight", async t => {
  const cases = [
    [{ id: "00000000000000000" }, "community", PARADISE_TEST_REHEARSAL_CONFIRMATION, "test_guild_only"],
    [{ id: PARADISE_TEST_GUILD_ID }, "clan", PARADISE_TEST_REHEARSAL_CONFIRMATION, "test_rehearsal_community_only"],
    [{ id: PARADISE_TEST_GUILD_ID }, "community", "REHEARSE TEST", "typed_confirmation_mismatch"]
  ];
  for (const [guild, mode, confirmation, code] of cases) {
    await t.test(code, async () => {
      let preflightCalled = false;
      await assert.rejects(
        rehearseParadiseTestTemplate(guild, mode, confirmation, {
          requirePreflight: async () => { preflightCalled = true; }
        }),
        { code }
      );
      assert.equal(preflightCalled, false);
    });
  }
});
