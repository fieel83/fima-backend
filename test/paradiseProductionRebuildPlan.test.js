import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createParadiseBackupEnvelope } from "../src/paradiseBackupIntegrity.js";
import {
  consumeParadiseProductionRebuildPlan,
  createParadiseProductionFinalizationReceipt,
  createParadiseProductionRebuildPlan,
  finishParadiseProductionRebuildPlan,
  paradiseProductionRebuildPlanStatus,
  readParadiseProductionFinalizationReceipt,
  resolveParadiseProductionFinalizationReceipt,
  verifyParadiseProductionRebuildExecutionProof
} from "../src/paradiseProductionRebuildPlan.js";

const SECRET = "test-only-production-plan-secret-at-least-32-bytes";
const GUILD_ID = "1419335632324657306";
const OWNER_ID = "owner-user-test-id";
const NOW = Date.parse("2026-08-02T10:00:00.000Z");

function backup() {
  return createParadiseBackupEnvelope({
    guildId: GUILD_ID,
    capturedAt: new Date(NOW).toISOString(),
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
  }, new Date(NOW));
}

function preflight() {
  return {
    ready: true,
    code: "paradise_rebuild_preflight_ready",
    checkedAt: new Date(NOW).toISOString(),
    checks: [
      {
        id: "test_guild_rehearsal_pair",
        ok: true,
        code: "ok",
        details: {
          verifiedCount: 2,
          provenanceVerified: true,
          timestampsDistinct: true,
          signaturesDistinct: true,
          digestsDistinct: true,
          chronological: true,
          previous: {
            verifiedAt: new Date(NOW - 2_000).toISOString(),
            productionUntouched: true
          },
          current: {
            verifiedAt: new Date(NOW - 1_000).toISOString(),
            productionUntouched: true
          }
        }
      },
      { id: "rollback_marker", ok: true, code: "ok" },
      { id: "mutation_lease", ok: true, code: "ok" },
      { id: "backup_restore_scopes", ok: true, code: "ok" }
    ]
  };
}

test("production plans reject forged, incomplete and duplicate rehearsal gates", async t => {
  const planRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fima-production-plan-gates-"));
  t.after(() => fs.rm(planRoot, { recursive: true, force: true }));
  const create = candidate => createParadiseProductionRebuildPlan({
    guildId: GUILD_ID,
    expectedGuildId: GUILD_ID,
    mode: "community",
    backup: backup(),
    ownerUserId: OWNER_ID,
    secret: SECRET,
    preflight: candidate,
    planRoot,
    nowMs: NOW
  });

  await assert.rejects(create({ ready: true }), {
    code: "production_rebuild_preflight_blocked"
  });

  const oneRun = structuredClone(preflight());
  oneRun.checks[0].details.verifiedCount = 1;
  await assert.rejects(create(oneRun), {
    code: "production_rebuild_rehearsal_pair_invalid"
  });

  const duplicateRun = structuredClone(preflight());
  duplicateRun.checks[0].details.timestampsDistinct = false;
  duplicateRun.checks[0].details.current.verifiedAt = duplicateRun.checks[0].details.previous.verifiedAt;
  await assert.rejects(create(duplicateRun), {
    code: "production_rebuild_rehearsal_pair_invalid"
  });

  const duplicateGate = structuredClone(preflight());
  duplicateGate.checks.push(structuredClone(duplicateGate.checks[0]));
  await assert.rejects(create(duplicateGate), {
    code: "production_rebuild_preflight_gate_duplicate"
  });

  const futurePreflight = structuredClone(preflight());
  futurePreflight.checkedAt = new Date(NOW + 1).toISOString();
  await assert.rejects(create(futurePreflight), {
    code: "production_rebuild_preflight_timestamp_future"
  });

  const stalePreflight = structuredClone(preflight());
  stalePreflight.checkedAt = new Date(NOW - 60_001).toISOString();
  await assert.rejects(create(stalePreflight), {
    code: "production_rebuild_preflight_stale"
  });
});

async function fixture(t) {
  const planRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fima-production-plan-"));
  t.after(() => fs.rm(planRoot, { recursive: true, force: true }));
  const status = await createParadiseProductionRebuildPlan({
    guildId: GUILD_ID,
    expectedGuildId: GUILD_ID,
    mode: "community",
    backup: backup(),
    ownerUserId: OWNER_ID,
    secret: SECRET,
    preflight: preflight(),
    planRoot,
    nowMs: NOW
  });
  return { planRoot, status };
}

function consumeInput(planRoot, status, overrides = {}) {
  return {
    planId: status.planId,
    guildId: GUILD_ID,
    mode: "community",
    backupDigest: status.backup.digest,
    ownerUserId: OWNER_ID,
    confirmation: status.requiredConfirmation,
    secret: SECRET,
    planRoot,
    nowMs: NOW + 1,
    ...overrides
  };
}

async function completedFixture(t, markerId = "marker_test_1234") {
  const current = await fixture(t);
  await consumeParadiseProductionRebuildPlan(consumeInput(current.planRoot, current.status));
  await finishParadiseProductionRebuildPlan({
    planId: current.status.planId,
    planRoot: current.planRoot,
    secret: SECRET,
    outcome: "completed",
    nowMs: NOW + 2
  });
  const receipt = await createParadiseProductionFinalizationReceipt({
    planId: current.status.planId,
    guildId: GUILD_ID,
    mode: "community",
    markerId,
    backupDigest: current.status.backup.digest,
    postAuditVerified: true,
    communityProfileReadbackVerified: true,
    botProfileReadbackVerified: true,
    planRoot: current.planRoot,
    secret: SECRET,
    nowMs: NOW + 3
  });
  return { ...current, receipt, markerId };
}

test("finalization receipt archives pending lifecycle and replays idempotently", async t => {
  const current = await completedFixture(t);
  const resolved = await resolveParadiseProductionFinalizationReceipt({
    guildId: GUILD_ID,
    markerId: current.markerId,
    planId: current.status.planId,
    planRoot: current.planRoot,
    secret: SECRET,
    nowMs: NOW + 4
  });
  assert.equal(resolved.alreadyResolved, false);
  await assert.rejects(readParadiseProductionFinalizationReceipt({
    guildId: GUILD_ID,
    planRoot: current.planRoot,
    secret: SECRET
  }), { code: "production_finalization_receipt_index_unavailable" });
  const archived = await readParadiseProductionFinalizationReceipt({
    guildId: GUILD_ID,
    markerId: current.markerId,
    lifecycle: "resolved",
    planRoot: current.planRoot,
    secret: SECRET
  });
  assert.equal(archived.planId, current.status.planId);
  const replay = await resolveParadiseProductionFinalizationReceipt({
    guildId: GUILD_ID,
    markerId: current.markerId,
    planId: current.status.planId,
    planRoot: current.planRoot,
    secret: SECRET
  });
  assert.equal(replay.alreadyResolved, true);
});

test("resolved receipt no longer blocks a later plan and index tampering fails closed", async t => {
  const first = await completedFixture(t, "marker_first_1234");
  await resolveParadiseProductionFinalizationReceipt({
    guildId: GUILD_ID,
    markerId: first.markerId,
    planId: first.status.planId,
    planRoot: first.planRoot,
    secret: SECRET
  });
  const second = await createParadiseProductionRebuildPlan({
    guildId: GUILD_ID,
    expectedGuildId: GUILD_ID,
    mode: "community",
    backup: backup(),
    ownerUserId: OWNER_ID,
    secret: SECRET,
    preflight: preflight(),
    planRoot: first.planRoot,
    nowMs: NOW + 10
  });
  await consumeParadiseProductionRebuildPlan(consumeInput(first.planRoot, second, { nowMs: NOW + 11 }));
  await finishParadiseProductionRebuildPlan({
    planId: second.planId,
    planRoot: first.planRoot,
    secret: SECRET,
    outcome: "completed",
    nowMs: NOW + 12
  });
  await createParadiseProductionFinalizationReceipt({
    planId: second.planId,
    guildId: GUILD_ID,
    mode: "community",
    markerId: "marker_second_1234",
    backupDigest: second.backup.digest,
    postAuditVerified: true,
    communityProfileReadbackVerified: true,
    botProfileReadbackVerified: true,
    planRoot: first.planRoot,
    secret: SECRET,
    nowMs: NOW + 13
  });
  const pendingPath = path.join(first.planRoot, "finalization-receipts", `${GUILD_ID}.pending.json`);
  const index = JSON.parse(await fs.readFile(pendingPath, "utf8"));
  index.markerId = "forged_marker_1234";
  await fs.writeFile(pendingPath, JSON.stringify(index), "utf8");
  await assert.rejects(readParadiseProductionFinalizationReceipt({
    guildId: GUILD_ID,
    planRoot: first.planRoot,
    secret: SECRET
  }), { code: "production_finalization_receipt_index_authenticity_invalid" });
});

test("production plan persists and exposes only an owner-safe status", async t => {
  const { planRoot, status } = await fixture(t);
  assert.equal(status.state, "ready");
  assert.equal(status.guildId, GUILD_ID);
  assert.match(status.requiredConfirmation, new RegExp(status.planId));
  assert.match(status.requiredConfirmation, new RegExp(status.backup.digest));
  assert.deepEqual(status.gates, {
    checkedAt: new Date(NOW).toISOString(),
    rehearsal: { ok: true, code: "ok" },
    rollback: { ok: true, code: "ok" },
    lease: { ok: true, code: "ok" },
    backup: { ok: true, code: "ok" }
  });

  const readback = await paradiseProductionRebuildPlanStatus({
    planId: status.planId,
    planRoot,
    secret: SECRET,
    nowMs: NOW + 1
  });
  const serialized = JSON.stringify(readback);
  for (const forbidden of ["ownerBinding", "nonce", "recordMac", "backupArtifact", "canonicalMessages"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("a valid plan is consumed once and produces a scoped short-lived proof", async t => {
  const { planRoot, status } = await fixture(t);
  const proof = await consumeParadiseProductionRebuildPlan(consumeInput(planRoot, status));
  assert.deepEqual(verifyParadiseProductionRebuildExecutionProof(proof, {
    secret: SECRET,
    guildId: GUILD_ID,
    mode: "community",
    planId: status.planId,
    backupDigest: status.backup.digest,
    nowMs: NOW + 2
  }), { ok: true, code: "ok" });

  await assert.rejects(
    consumeParadiseProductionRebuildPlan(consumeInput(planRoot, status, { nowMs: NOW + 3 })),
    error => error.code === "production_rebuild_plan_already_used"
  );
  const completed = await finishParadiseProductionRebuildPlan({
    planId: status.planId,
    planRoot,
    secret: SECRET,
    outcome: "completed",
    nowMs: NOW + 4
  });
  assert.equal(completed.state, "completed");
  assert.equal(completed.requiredConfirmation, null);
});

test("immutable target, mode, digest, owner and exact confirmation fail closed", async t => {
  const cases = [
    ["guildId", "different-guild", "production_rebuild_plan_target_mismatch"],
    ["mode", "clan", "production_rebuild_plan_mode_mismatch"],
    ["backupDigest", "0".repeat(64), "production_rebuild_plan_digest_mismatch"],
    ["ownerUserId", "different-owner", "production_rebuild_plan_owner_mismatch"],
    ["confirmation", "REBUILD FIEELS COMMUNITY", "production_rebuild_plan_confirmation_mismatch"]
  ];
  for (const [key, value, code] of cases) {
    const { planRoot, status } = await fixture(t);
    await assert.rejects(
      consumeParadiseProductionRebuildPlan(consumeInput(planRoot, status, { [key]: value })),
      error => error.code === code
    );
  }
});

test("expired plans and changed persisted backups cannot execute", async t => {
  const expired = await fixture(t);
  await assert.rejects(
    consumeParadiseProductionRebuildPlan(consumeInput(expired.planRoot, expired.status, {
      nowMs: NOW + 6 * 60 * 1000
    })),
    error => error.code === "production_rebuild_plan_expired"
  );

  const changed = await fixture(t);
  const backupPath = path.join(changed.planRoot, "backups", `${changed.status.planId}.json`);
  const persisted = JSON.parse(await fs.readFile(backupPath, "utf8"));
  persisted.guildId = "changed-after-plan";
  await fs.writeFile(backupPath, JSON.stringify(persisted), "utf8");
  await assert.rejects(
    consumeParadiseProductionRebuildPlan(consumeInput(changed.planRoot, changed.status)),
    error => [
      "production_rebuild_plan_backup_invalid",
      "production_rebuild_plan_backup_target_mismatch",
      "production_rebuild_plan_backup_changed"
    ].includes(error.code)
  );
});

test("missing secrets, tampered records and forged execution proofs fail closed", async t => {
  const { planRoot, status } = await fixture(t);
  await assert.rejects(
    paradiseProductionRebuildPlanStatus({ planId: status.planId, planRoot, secret: "short" }),
    error => error.code === "production_rebuild_plan_secret_unavailable"
  );

  const proof = await consumeParadiseProductionRebuildPlan(consumeInput(planRoot, status));
  assert.equal(verifyParadiseProductionRebuildExecutionProof({ ...proof, backupDigest: "0".repeat(64) }, {
    secret: SECRET,
    guildId: GUILD_ID,
    mode: "community",
    planId: status.planId,
    backupDigest: status.backup.digest,
    nowMs: NOW + 2
  }).ok, false);

  const tampered = await fixture(t);
  const recordPath = path.join(tampered.planRoot, "plans", `${tampered.status.planId}.json`);
  const record = JSON.parse(await fs.readFile(recordPath, "utf8"));
  record.expiresAt = new Date(NOW + 60 * 60 * 1000).toISOString();
  await fs.writeFile(recordPath, JSON.stringify(record), "utf8");
  await assert.rejects(
    paradiseProductionRebuildPlanStatus({
      planId: tampered.status.planId,
      planRoot: tampered.planRoot,
      secret: SECRET
    }),
    error => error.code === "production_rebuild_plan_authenticity_invalid"
  );
});
