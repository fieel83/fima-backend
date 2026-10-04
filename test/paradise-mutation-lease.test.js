import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createParadiseMutationLeaseManager } from "../src/paradiseMutationLease.js";
import {
  PARADISE_TEST_GUILD_ID,
  PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
  recoverParadiseTestRollback
} from "../src/paradise3a59.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function temporaryRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fima-mutation-lease-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function manager(root, options = {}) {
  return createParadiseMutationLeaseManager({
    root,
    hostname: "fima-test-host",
    leaseTtlMs: 200,
    heartbeatMs: 20,
    // The full suite exercises hundreds of concurrent filesystem-heavy tests.
    // Keep this above the normal 100ms serialization path so scheduler delay
    // cannot turn a correct queue into a timing-only failure.
    waitTimeoutMs: 2_000,
    pollIntervalMs: 5,
    ...options
  });
}

async function makeMetadataStale(lease) {
  const metadata = JSON.parse(await fs.readFile(lease.paths.metadataPath, "utf8"));
  metadata.heartbeatAt = "2000-01-01T00:00:00.000Z";
  await fs.writeFile(lease.paths.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

test("same-guild rebuild, repair and smoke mutations are serialized", async t => {
  const root = await temporaryRoot(t);
  const leases = manager(root);
  const rebuildEntered = deferred();
  const releaseRebuild = deferred();
  const events = [];

  const rebuild = leases.withLease("guild-serial", "rebuild", async () => {
    events.push("rebuild:start");
    rebuildEntered.resolve();
    await releaseRebuild.promise;
    events.push("rebuild:end");
  });
  await rebuildEntered.promise;
  const repair = leases.withLease("guild-serial", "repair", async () => {
    events.push("repair:start");
    events.push("repair:end");
  });
  const smoke = leases.withLease("guild-serial", "smoke", async () => {
    events.push("smoke:start");
    events.push("smoke:end");
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(leases.lockStatus("guild-serial").active?.operation, "rebuild");
  assert.equal(leases.lockStatus("guild-serial").waiting, 2);
  releaseRebuild.resolve();
  await Promise.all([rebuild, repair, smoke]);
  assert.deepEqual(events, [
    "rebuild:start", "rebuild:end", "repair:start", "repair:end", "smoke:start", "smoke:end"
  ]);
});

test("repair cannot overlap a rebuild and smoke cannot overtake it", async t => {
  const root = await temporaryRoot(t);
  const leases = manager(root);
  let active = 0;
  let maximumActive = 0;
  const operation = name => leases.withLease("guild-overlap", name, async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, 15));
    active -= 1;
  });

  await Promise.all([operation("rebuild"), operation("repair"), operation("smoke")]);
  assert.equal(maximumActive, 1);
});

test("timed-out waiter is removed and a later retry succeeds", async t => {
  const root = await temporaryRoot(t);
  const leases = manager(root);
  const entered = deferred();
  const release = deferred();
  const first = leases.withLease("guild-timeout", "rebuild", async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;

  await assert.rejects(
    leases.withLease("guild-timeout", "repair", async () => {}, { waitTimeoutMs: 20 }),
    { code: "guild_mutation_wait_timeout", guildId: "guild-timeout" }
  );
  release.resolve();
  await first;
  assert.equal(await leases.withLease("guild-timeout", "retry", async () => "retried"), "retried");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(leases.diagnostics().queueCount, 0);
});

test("a stale same-host lease from a dead process is recovered after restart", async t => {
  const root = await temporaryRoot(t);
  const firstProcess = manager(root, { instanceId: "old-process" });
  const orphan = await firstProcess.acquirePersistent(
    "guild-orphan", "rebuild", { correlationId: "old-correlation" }, Date.now() + 100
  );
  await makeMetadataStale(orphan);

  const restarted = manager(root, { instanceId: "new-process", processAlive: () => false });
  const result = await restarted.withLease("guild-orphan", "repair", async () => "recovered");
  assert.equal(result, "recovered");
  const recoveredHistory = await fs.readdir(path.join(root, "history", orphan.paths.segment));
  assert.ok(recoveredHistory.some(file => file.endsWith("-recovered.json")));
});

test("resumed rollback recovery reclaims only a stale same-host dead-process lease", async t => {
  const root = await temporaryRoot(t);
  const digest = "a".repeat(64);
  const stateDigest = "b".repeat(64);
  const backupArtifact = path.join(root, "rollback-backup.json");
  const marker = {
    schemaVersion: 1,
    markerId: "restart-safe-rollback-marker",
    guildId: PARADISE_TEST_GUILD_ID,
    status: "rollback_in_progress",
    mode: "test_guild_rebuild:community",
    backupArtifact,
    backupDigest: digest
  };
  const backup = {
    backupSchemaVersion: 3,
    guildId: PARADISE_TEST_GUILD_ID,
    guild: { id: PARADISE_TEST_GUILD_ID },
    integrity: { digest, stateDigest }
  };
  const guild = { id: PARADISE_TEST_GUILD_ID };
  let markerReadCount = 0;
  const recoveryDependencies = leases => ({
    artifactRoot: root,
    withMutationLock: (targetGuild, purpose, operation, options) => leases.withLease(
      targetGuild.id,
      purpose,
      operation,
      options
    ),
    updateLease: update => leases.updateCurrent(update),
    readRollback: async () => {
      markerReadCount += 1;
      return structuredClone(marker);
    },
    resolveRollback: async (_guildId, markerId) => ({ markerId, status: "resolved" }),
    readBackupArtifact: async () => structuredClone(backup),
    validateBackup: () => ({ valid: true }),
    backupStateDigest: () => stateDigest,
    loadState: async () => ({}),
    captureSnapshot: async () => ({ guildId: PARADISE_TEST_GUILD_ID }),
    createRestoreDryRun: () => ({ canRestore: true, mutationsPlanned: 0 }),
    persistArtifact: async name => path.join(root, name)
  });

  const crashedProcess = manager(root, { instanceId: "crashed-rollback-process" });
  const orphan = await crashedProcess.acquirePersistent(
    PARADISE_TEST_GUILD_ID,
    "recover_rollback",
    { correlationId: "crashed-rollback" },
    Date.now() + 100
  );
  await makeMetadataStale(orphan);

  const restarted = manager(root, {
    instanceId: "restarted-rollback-process",
    processAlive: () => false
  });
  const recovered = await recoverParadiseTestRollback(
    guild,
    PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
    recoveryDependencies(restarted)
  );
  assert.equal(recovered.status, "ok");
  assert.ok(markerReadCount >= 2);
  const recoveredHistory = await fs.readdir(path.join(root, "history", orphan.paths.segment));
  assert.ok(recoveredHistory.some(file => file.endsWith("-recovered.json")));

  const liveHolder = manager(root, { instanceId: "live-rollback-holder" });
  const activeLease = await liveHolder.acquirePersistent(
    PARADISE_TEST_GUILD_ID,
    "rebuild",
    { correlationId: "live-rollback" },
    Date.now() + 100
  );
  const liveContender = manager(root, {
    instanceId: "blocked-rollback-contender",
    processAlive: () => true
  });
  const readsBeforeBlockedAttempt = markerReadCount;
  await assert.rejects(
    recoverParadiseTestRollback(
      guild,
      PARADISE_TEST_ROLLBACK_RECOVERY_CONFIRMATION,
      recoveryDependencies(liveContender)
    ),
    { code: "guild_mutation_locked" }
  );
  assert.equal(markerReadCount, readsBeforeBlockedAttempt);
  await liveHolder.releasePersistent(activeLease, { status: "completed", phase: "test_cleanup" });
});

test("same-host dead PID recovery reports its explicit recovery reason", async t => {
  const root = await temporaryRoot(t);
  const original = manager(root);
  const orphan = await original.acquirePersistent(
    "guild-dead-pid", "rebuild", { correlationId: "dead-pid" }, Date.now() + 100
  );
  await makeMetadataStale(orphan);
  const recoveryManager = manager(root, { processAlive: () => false });

  const status = await recoveryManager.persistentStatus("guild-dead-pid");
  assert.equal(status.recoverable, true);
  assert.equal(status.recoveryReason, "same_host_owner_process_dead");
});

test("a stale lease is recoverable when its PID was reused by a different process", async t => {
  const root = await temporaryRoot(t);
  const original = manager(root, { processStartedAt: "2026-08-09T08:00:00.000Z" });
  const orphan = await original.acquirePersistent(
    "guild-reused-pid", "rebuild", { correlationId: "reused-pid" }, Date.now() + 100
  );
  await makeMetadataStale(orphan);
  const recoveryManager = manager(root, {
    processAlive: () => true,
    processIdentityMatches: metadata => metadata.processStartedAt !== "2026-08-09T08:00:00.000Z"
  });

  const status = await recoveryManager.persistentStatus("guild-reused-pid");
  assert.equal(status.recoverable, true);
  assert.equal(status.recoveryReason, "same_host_owner_pid_reused");
  assert.equal(
    await recoveryManager.withLease("guild-reused-pid", "repair", async () => "recovered"),
    "recovered"
  );
});

test("an unverified live process identity keeps a stale lease fail-closed", async t => {
  const root = await temporaryRoot(t);
  const original = manager(root);
  const lease = await original.acquirePersistent(
    "guild-unverified-pid", "rebuild", { correlationId: "unverified-pid" }, Date.now() + 100
  );
  await makeMetadataStale(lease);
  const recoveryManager = manager(root, {
    processAlive: () => true,
    processIdentityMatches: () => null
  });

  const status = await recoveryManager.persistentStatus("guild-unverified-pid");
  assert.equal(status.recoverable, false);
  assert.equal(status.recoveryReason, "owner_process_identity_unverified");
  await assert.rejects(
    recoveryManager.withLease(
      "guild-unverified-pid", "repair", async () => {}, { failIfLocked: true }
    ),
    { code: "guild_mutation_locked" }
  );
  await original.releasePersistent(lease, { status: "failed", phase: "test_cleanup" });
});

test("different-host stale lease remains fail-closed", async t => {
  const root = await temporaryRoot(t);
  const firstHost = manager(root, { hostname: "host-a" });
  const lease = await firstHost.acquirePersistent(
    "guild-other-host", "rebuild", { correlationId: "host-a-work" }, Date.now() + 100
  );
  await makeMetadataStale(lease);
  const secondHost = manager(root, { hostname: "host-b", processAlive: () => false });

  const status = await secondHost.persistentStatus("guild-other-host");
  assert.equal(status.recoverable, false);
  assert.equal(status.recoveryReason, "different_or_unknown_host");
  await assert.rejects(
    secondHost.withLease("guild-other-host", "repair", async () => {}, { waitTimeoutMs: 25 }),
    { code: "guild_mutation_wait_timeout" }
  );
  await firstHost.releasePersistent(lease, { status: "failed", phase: "test_cleanup" });
});

test("expected guild mismatch is rejected before a lease is created", async t => {
  const root = await temporaryRoot(t);
  const leases = manager(root);
  await assert.rejects(
    leases.withLease("wrong-guild", "rebuild", async () => {}, { expectedGuildId: "test-guild" }),
    { code: "wrong_guild_mutation_request", guildId: "wrong-guild" }
  );
  assert.equal((await fs.readdir(root).catch(() => [])).length, 0);
});

test("owner-token mismatch prevents release", async t => {
  const root = await temporaryRoot(t);
  const leases = manager(root);
  const lease = await leases.acquirePersistent(
    "guild-owner", "rebuild", { correlationId: "owner-check" }, Date.now() + 100
  );
  const metadata = JSON.parse(await fs.readFile(lease.paths.metadataPath, "utf8"));
  metadata.ownerToken = "different-owner";
  await fs.writeFile(lease.paths.metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  await assert.rejects(
    leases.releasePersistent(lease, { status: "completed" }),
    { code: "guild_mutation_owner_mismatch" }
  );
});

test("double release creates one redacted completion history record", async t => {
  const root = await temporaryRoot(t);
  const leases = manager(root);
  const lease = await leases.acquirePersistent(
    "guild-double-release", "rebuild", { correlationId: "double-release" }, Date.now() + 100
  );

  const first = await leases.releasePersistent(lease, { status: "completed", phase: "completed" });
  const second = await leases.releasePersistent(lease, { status: "completed", phase: "completed" });
  assert.deepEqual(second, first);
  const historyFiles = await fs.readdir(lease.paths.historyDir);
  assert.equal(historyFiles.length, 1);
  const history = JSON.parse(await fs.readFile(path.join(lease.paths.historyDir, historyFiles[0]), "utf8"));
  assert.equal(history.historyEvent, "completed");
  assert.equal("ownerToken" in history, false);
});

test("failIfLocked rejects local and persistent contention immediately", async t => {
  const root = await temporaryRoot(t);
  const leases = manager(root);
  const entered = deferred();
  const release = deferred();
  const first = leases.withLease("guild-fast-fail", "rebuild", async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const startedAt = Date.now();
  await assert.rejects(
    leases.withLease("guild-fast-fail", "repair", async () => {}, { failIfLocked: true, waitTimeoutMs: 400 }),
    { code: "guild_mutation_locked" }
  );
  assert.ok(Date.now() - startedAt < 100);
  release.resolve();
  await first;

  const holder = manager(root, { instanceId: "persistent-holder" });
  const lease = await holder.acquirePersistent(
    "guild-external-lock", "rebuild", { correlationId: "external" }, Date.now() + 100
  );
  const contender = manager(root, { instanceId: "persistent-contender" });
  await assert.rejects(
    contender.withLease("guild-external-lock", "smoke", async () => {}, { failIfLocked: true }),
    { code: "guild_mutation_locked" }
  );
  await holder.releasePersistent(lease, { status: "completed", phase: "test_cleanup" });
});

test("heartbeat writes are serialized and drained before release", async t => {
  const root = await temporaryRoot(t);
  let activeMetadataRenames = 0;
  let maximumMetadataRenames = 0;
  const fileApi = new Proxy(fs, {
    get(target, property) {
      if (property === "rename") {
        return async (from, to) => {
          if (String(to).endsWith("metadata.json")) {
            activeMetadataRenames += 1;
            maximumMetadataRenames = Math.max(maximumMetadataRenames, activeMetadataRenames);
            await new Promise(resolve => setTimeout(resolve, 8));
            try {
              return await target.rename(from, to);
            } finally {
              activeMetadataRenames -= 1;
            }
          }
          return target.rename(from, to);
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const leases = manager(root, { fileApi, heartbeatMs: 10, leaseTtlMs: 100 });

  await leases.withLease("guild-heartbeat", "rebuild", async () => {
    await new Promise(resolve => setTimeout(resolve, 55));
  });
  assert.equal(maximumMetadataRenames, 1);
  assert.equal(await fs.stat(leases.pathsForGuild("guild-heartbeat").leaseDir).then(() => true, () => false), false);
});

test("Windows-style EEXIST replacement falls back to a recoverable backup swap", async t => {
  const root = await temporaryRoot(t);
  let injected = false;
  const fileApi = new Proxy(fs, {
    get(target, property) {
      if (property === "rename") {
        return async (from, to) => {
          if (!injected && String(to).endsWith("metadata.json")) {
            const targetExists = await target.stat(to).then(() => true, () => false);
            if (targetExists) {
              injected = true;
              const error = new Error("simulated Windows destination collision");
              error.code = "EEXIST";
              throw error;
            }
          }
          return target.rename(from, to);
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const leases = manager(root, { fileApi });

  await leases.withLease("guild-windows", "rebuild", async () => {
    await leases.updateCurrent({ phase: "permissions" });
  });
  assert.equal(injected, true);
  const historyFiles = await fs.readdir(leases.pathsForGuild("guild-windows").historyDir);
  assert.equal(historyFiles.length, 1);
});

test("failed lease history persists only stable failure code and allowlisted context", async t => {
  const root = await temporaryRoot(t);
  const leases = manager(root);
  const leakedDiscordId = "100000000000009921";
  const leakedToken = "sensitive-token-must-not-persist";
  const error = Object.assign(
    new Error(`Discord 50035 for ${leakedDiscordId} with ${leakedToken}`),
    {
      code: "restore_automod_edit_failed",
      context: {
        operation: "edit",
        resourceKind: "auto_mod_rule",
        index: 2,
        channelId: leakedDiscordId,
        token: leakedToken
      }
    }
  );

  await assert.rejects(
    leases.withLease("guild-redacted-failure", "rebuild", async () => { throw error; }),
    thrown => thrown === error
  );
  const paths = leases.pathsForGuild("guild-redacted-failure");
  const historyFiles = await fs.readdir(paths.historyDir);
  assert.equal(historyFiles.length, 1);
  const history = JSON.parse(await fs.readFile(path.join(paths.historyDir, historyFiles[0]), "utf8"));
  assert.deepEqual(history.failure, {
    code: "restore_automod_edit_failed",
    context: { operation: "edit", resourceKind: "auto_mod_rule", index: 2 }
  });
  const persistedFailure = JSON.stringify(history.failure);
  assert.doesNotMatch(persistedFailure, /Discord 50035/);
  assert.doesNotMatch(persistedFailure, new RegExp(leakedDiscordId));
  assert.doesNotMatch(persistedFailure, new RegExp(leakedToken));
});
