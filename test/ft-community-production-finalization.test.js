import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  createParadiseBackupEnvelope,
  paradiseBackupStateDigest
} from "../src/paradiseBackupIntegrity.js";
import { paradiseProductionRestoreConfirmation } from "../src/paradiseGuildRestore.js";
import {
  FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
  finalizeFimaCommunityProductionRollbackFromReceipt
} from "../src/paradise3a59.js";

const SECRET = "test-only-finalization-secret-at-least-32-bytes";
const PLAN_ID = "12345678-1234-4123-8123-123456789abc";
const MARKER_ID = "marker_restart_1234";

function fixture(status = "rollback_required") {
  const backup = createParadiseBackupEnvelope({
    guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
    capturedAt: "2026-08-13T00:00:00.000Z",
    categories: [],
    channels: [],
    roles: [],
    memberRoles: [],
    canonicalMessages: [],
    contentArchive: [],
    autoModRules: [],
    webhooks: [],
    tickets: [],
    restoreCapabilities: {
      guildIdentity: true,
      roles: true,
      memberRoles: true,
      channels: true,
      canonicalMessages: true,
      contentArchive: true,
      autoModRules: true,
      webhooks: true,
      tickets: true
    }
  }, new Date("2026-08-13T00:00:00.000Z"));
  const artifactRoot = path.resolve("FIMA-test-artifacts");
  const artifactPath = path.join(artifactRoot, "backups", "production.json");
  const receipt = {
    guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
    mode: "community",
    outcome: "completed",
    planId: PLAN_ID,
    markerId: MARKER_ID,
    backupDigest: paradiseBackupStateDigest(backup),
    backupArtifactDigest: backup.integrity.digest
  };
  const marker = {
    schemaVersion: 1,
    guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
    markerId: MARKER_ID,
    mode: "production_ft_community_rebuild:community",
    status,
    pendingFinalization: status === "rollback_required",
    phase: status === "rollback_required" ? "orchestrator_verification_pending" : "resolved",
    backupDigest: backup.integrity.digest,
    backupArtifact: artifactPath,
    confirmation: paradiseProductionRestoreConfirmation(backup)
  };
  return { artifactRoot, backup, marker, receipt };
}

test("restart finalization needs no Discord client and binds its lease to receipt plan and marker", async () => {
  const current = fixture();
  let lockOptions;
  let receiptResolution;
  const result = await finalizeFimaCommunityProductionRollbackFromReceipt({
    secret: SECRET,
    planRoot: "test-plan-root"
  }, {
    artifactRoot: current.artifactRoot,
    readReceipt: async options => {
      assert.equal(options.lifecycle, "pending");
      return current.receipt;
    },
    readRollback: async () => current.marker,
    resolveRollback: async () => ({ ...current.marker, status: "resolved" }),
    resolveReceipt: async options => {
      receiptResolution = options;
      return { status: "resolved", alreadyResolved: false };
    },
    readBackupArtifact: async () => current.backup,
    withMutationLock: async (_guildId, _purpose, run, options) => {
      lockOptions = options;
      return run();
    }
  });
  assert.deepEqual(result, {
    status: "ok",
    rollbackFinalized: true,
    alreadyFinalized: false
  });
  assert.equal(receiptResolution.planId, PLAN_ID);
  assert.equal(receiptResolution.markerId, MARKER_ID);
  assert.equal(
    lockOptions.idempotencyKey,
    `${FIMA_COMMUNITY_PRODUCTION_GUILD_ID}:community:${PLAN_ID}:${MARKER_ID}:receipt-finalize`
  );
});

test("same-binding resolved replay still performs receipt lifecycle cleanup", async () => {
  const current = fixture("resolved");
  const lifecycles = [];
  let cleanupCount = 0;
  const result = await finalizeFimaCommunityProductionRollbackFromReceipt({ secret: SECRET }, {
    artifactRoot: current.artifactRoot,
    readReceipt: async options => {
      lifecycles.push(options.lifecycle);
      if (options.lifecycle === "pending") {
        throw Object.assign(new Error("missing"), {
          code: "production_finalization_receipt_index_unavailable"
        });
      }
      return current.receipt;
    },
    readRollback: async () => current.marker,
    resolveRollback: async () => assert.fail("resolved marker must not resolve twice"),
    resolveReceipt: async () => {
      cleanupCount += 1;
      return { status: "resolved", alreadyResolved: true };
    },
    readBackupArtifact: async () => assert.fail("resolved replay needs no artifact read"),
    withMutationLock: async (_guildId, _purpose, run) => run()
  });
  assert.deepEqual(lifecycles, ["pending", "resolved"]);
  assert.equal(cleanupCount, 1);
  assert.equal(result.alreadyFinalized, true);
});

test("missing or forged receipt fails closed before acquiring the mutation lease", async () => {
  const current = fixture();
  let lockCalls = 0;
  await assert.rejects(finalizeFimaCommunityProductionRollbackFromReceipt({ secret: SECRET }, {
    readRollback: async () => current.marker,
    readReceipt: async () => {
      throw new Error("forged receipt");
    },
    withMutationLock: async () => {
      lockCalls += 1;
    }
  }), { code: "production_finalization_receipt_invalid" });
  assert.equal(lockCalls, 0);
});
