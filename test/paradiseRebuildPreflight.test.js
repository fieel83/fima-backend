import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GatewayIntentBits, PermissionsBitField } from "discord.js";
import {
  inspectParadiseRebuildPreflight,
  PARADISE_REBUILD_REQUIRED_GUILD_PERMISSIONS,
  PARADISE_REBUILD_REQUIRED_INTENTS,
  PARADISE_REBUILD_REQUIRED_RESTORE_SCOPES
} from "../src/paradiseRebuildPreflight.js";
import {
  createParadiseRehearsalEvidence,
  paradisePreviousRehearsalEvidencePath,
  persistParadiseRehearsalEvidence
} from "../src/paradiseRehearsalEvidence.js";
import { PARADISE_TEST_GUILD_ID } from "../src/runtimeEnvironment.js";

const GUILD_ID = "1520519015661961257";
const OWNER_ID = "1520519015661961258";
const BOT_ID = "1520519015661961259";
const CHANNEL_ID = "1520519015661961260";
const MESSAGE_ID = "1520519015661961261";
const REHEARSAL_GUILD_ID = PARADISE_TEST_GUILD_ID;
const NOW_MS = Date.parse("2026-07-26T12:00:00.000Z");
const TEST_EVIDENCE_SECRET = "test-only-rehearsal-evidence-secret-32-bytes";
const RELEASE_REVISION = "d".repeat(40);
const RELEASE_DIGEST = "e".repeat(64);
const BACKUP_ARTIFACT_DIGEST = "a".repeat(64);
const PREVIOUS_BACKUP_ARTIFACT_DIGEST = "c".repeat(64);
const BACKUP_STATE_DIGEST = "b".repeat(64);

function permissionSet(names = PARADISE_REBUILD_REQUIRED_GUILD_PERMISSIONS) {
  return new PermissionsBitField(names.map(name => PermissionsBitField.Flags[name]));
}

function intentSet(names = PARADISE_REBUILD_REQUIRED_INTENTS) {
  const enabled = new Set(names.map(name => GatewayIntentBits[name]));
  return { has: bit => enabled.has(bit) };
}

function completeSnapshot(overrides = {}) {
  return {
    capturedAt: new Date(0).toISOString(),
    guildId: GUILD_ID,
    guild: { id: GUILD_ID, ownerId: OWNER_ID },
    categories: [],
    channels: [{ id: CHANNEL_ID, name: "general", type: 0 }],
    roles: [
      { id: GUILD_ID, name: "@everyone", position: 0, managed: false },
      { id: "1520519015661961262", name: "Helper", position: 5, managed: false },
      { id: "1520519015661961263", name: "FIMA", position: 10, managed: true }
    ],
    memberRoles: [
      { memberId: OWNER_ID, roleIds: [] },
      { memberId: BOT_ID, roleIds: ["1520519015661961263"] }
    ],
    canonicalMessages: [{ id: MESSAGE_ID, channelId: CHANNEL_ID }],
    contentArchive: [],
    autoModRules: [],
    webhooks: [],
    tickets: [],
    guildConfigReferences: {
      messageIds: [MESSAGE_ID],
      channelIds: [CHANNEL_ID],
      roleIds: []
    },
    restoreCapabilities: Object.fromEntries(PARADISE_REBUILD_REQUIRED_RESTORE_SCOPES.map(scope => [scope, true])),
    captureErrors: [],
    ...overrides
  };
}

function fixture() {
  const permissions = permissionSet();
  const me = {
    id: BOT_ID,
    permissions,
    roles: { highest: { position: 10 } }
  };
  const channel = {
    id: CHANNEL_ID,
    name: "general",
    isThread: () => false,
    isTextBased: () => true,
    permissionsFor: () => permissions
  };
  const guild = {
    id: GUILD_ID,
    ownerId: OWNER_ID,
    client: { user: { id: BOT_ID }, options: { intents: intentSet() } },
    members: {
      me,
      fetchMe: async () => me
    },
    channels: { cache: new Map([[CHANNEL_ID, channel]]) }
  };
  return { guild, me, channel, snapshot: completeSnapshot() };
}

async function runPreflight(current, overrides = {}) {
  const artifactRoot = overrides.artifactRoot || await fs.mkdtemp(path.join(os.tmpdir(), "fima-rebuild-preflight-"));
  const options = {
    state: {},
    artifactRoot,
    captureSnapshot: async () => current.snapshot,
    readLeaseStatus: async () => ({ guildId: current.guild.id, locked: false }),
    readRollbackMarker: async () => null,
    ...overrides
  };
  try {
    return await inspectParadiseRebuildPreflight(current.guild, options);
  } finally {
    if (!overrides.keepArtifactRoot) await fs.rm(artifactRoot, { recursive: true, force: true });
  }
}

function blockerCodes(report) {
  return report.blockers.map(blocker => blocker.code);
}

function rehearsalEvidence(overrides = {}) {
  const backupArtifactDigest = overrides.backupArtifactDigest || BACKUP_ARTIFACT_DIGEST;
  return createParadiseRehearsalEvidence({
    guildId: REHEARSAL_GUILD_ID,
    release: overrides.release || {
      revision: RELEASE_REVISION,
      criticalDigest: RELEASE_DIGEST
    },
    result: {
      action: "rehearsal",
      status: "LIVE DISCORD VERIFIED",
      smokeRunsCompleted: 2,
      fullSmokeRunsVerified: true,
      initialBackupVerified: true,
      persistedBackupVerified: true,
      restoredOriginalState: true,
      originalStateCanRestore: true,
      originalStateMutationsPlanned: 0,
      backupAlgorithm: "sha256",
      backupArtifactDigest,
      backupStateDigest: overrides.backupStateDigest || BACKUP_STATE_DIGEST,
      persistedBackupArtifactDigest: backupArtifactDigest,
      persistedBackupStateDigest: overrides.backupStateDigest || BACKUP_STATE_DIGEST
    },
    verifiedAt: overrides.verifiedAt || new Date(NOW_MS - 60_000).toISOString()
  }, { secret: overrides.secret || TEST_EVIDENCE_SECRET });
}

async function runWithRehearsal(current, evidence, overrides = {}) {
  const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fima-rebuild-rehearsal-"));
  const evidencePath = path.join(artifactRoot, "rehearsal.json");
  const previousEvidencePath = paradisePreviousRehearsalEvidencePath(evidencePath);
  const hasPreviousOverride = Object.hasOwn(overrides, "previousEvidence");
  const previousEvidence = hasPreviousOverride
    ? overrides.previousEvidence
    : evidence === undefined
      ? undefined
      : rehearsalEvidence({
          verifiedAt: new Date(NOW_MS - 120_000).toISOString(),
          backupArtifactDigest: PREVIOUS_BACKUP_ARTIFACT_DIGEST
        });
  if (evidence !== undefined) {
    await fs.writeFile(
      evidencePath,
      typeof evidence === "string" ? evidence : JSON.stringify(evidence),
      "utf8"
    );
  }
  if (previousEvidence !== undefined) {
    await fs.writeFile(
      previousEvidencePath,
      typeof previousEvidence === "string" ? previousEvidence : JSON.stringify(previousEvidence),
      "utf8"
    );
  }
  const { previousEvidence: _previousEvidence, ...forwardedOverrides } = overrides;
  return runPreflight(current, {
    artifactRoot,
    testGuildRehearsalEvidencePath: evidencePath,
    testGuildRehearsalPreviousEvidencePath: previousEvidencePath,
    requireTestGuildRehearsal: true,
    testGuildRehearsalEvidenceSecret: TEST_EVIDENCE_SECRET,
    expectedTestGuildId: REHEARSAL_GUILD_ID,
    testGuildRehearsalMaxAgeMs: 60 * 60 * 1000,
    nowMs: NOW_MS,
    ...forwardedOverrides
  });
}

test("production-only preflight accepts two distinct fresh signed live-runner rehearsals", async () => {
  const report = await runWithRehearsal(fixture(), rehearsalEvidence());
  assert.equal(report.ready, true);
  const rehearsalCheck = report.checks.find(check => check.id === "test_guild_rehearsal_pair");
  assert.equal(rehearsalCheck.ok, true);
  assert.equal(rehearsalCheck.details.verifiedCount, 2);
  assert.equal(rehearsalCheck.details.chronological, true);
  assert.equal(rehearsalCheck.details.releaseMatches, true);
  assert.equal(rehearsalCheck.details.productionReleaseMatches, true);
  assert.equal(rehearsalCheck.details.backupArtifactsDistinct, true);
  assert.equal(rehearsalCheck.details.current.smokeCompleted, true);
  assert.equal(rehearsalCheck.details.current.fullRehearsalVerified, true);
  assert.equal(rehearsalCheck.details.current.productionUntouched, true);
  assert.equal(rehearsalCheck.details.previous.smokeCompleted, true);
  assert.equal(rehearsalCheck.details.previous.fullRehearsalVerified, true);
  assert.equal(rehearsalCheck.details.previous.productionUntouched, true);
});

test("production-only rehearsal gate rejects a pair from a different deployed release", async () => {
  const report = await runWithRehearsal(fixture(), rehearsalEvidence(), {
    expectedTestGuildRelease: {
      revision: "f".repeat(40),
      criticalDigest: "a".repeat(64)
    }
  });

  assert.equal(report.ready, false);
  assert.ok(blockerCodes(report).includes("test_guild_rehearsal_release_drift"));
  const rehearsalCheck = report.checks.find(check => check.id === "test_guild_rehearsal_pair");
  assert.equal(rehearsalCheck.details.releaseMatches, true);
  assert.equal(rehearsalCheck.details.productionReleaseMatches, false);
});

test("production-only rehearsal gate rejects unsigned, tampered, synthetic, stale, or unreadable evidence", async t => {
  const wrongSignature = structuredClone(rehearsalEvidence());
  wrongSignature.signature = `hmac-sha256:${"0".repeat(64)}`;
  const syntheticMode = structuredClone(rehearsalEvidence());
  syntheticMode.executionMode = "synthetic_fixture";
  const tamperedGuild = structuredClone(rehearsalEvidence());
  tamperedGuild.guild.id = "wrong";
  const cases = [
    ["unsigned legacy JSON", { status: "LIVE DISCORD VERIFIED", guild: { id: REHEARSAL_GUILD_ID }, smoke: { completed: true } }, "test_guild_rehearsal_schema_invalid"],
    ["wrong signature", wrongSignature, "test_guild_rehearsal_signature_invalid"],
    ["synthetic execution mode", syntheticMode, "test_guild_rehearsal_execution_mode_invalid"],
    ["tampered guild", tamperedGuild, "test_guild_rehearsal_digest_invalid"],
    ["stale", rehearsalEvidence({ verifiedAt: new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString() }), "test_guild_rehearsal_stale"],
    ["future", rehearsalEvidence({ verifiedAt: new Date(NOW_MS + 1).toISOString() }), "test_guild_rehearsal_timestamp_future"],
    ["malformed", "{", "test_guild_rehearsal_evidence_malformed"],
    ["missing", undefined, "test_guild_rehearsal_evidence_unreadable"]
  ];
  for (const [name, evidence, code] of cases) {
    await t.test(name, async () => {
      const report = await runWithRehearsal(fixture(), evidence);
      assert.equal(report.ready, false);
      assert.ok(blockerCodes(report).includes(code));
    });
  }
});

test("production-only rehearsal gate rejects legacy or malformed release and backup bindings", async t => {
  const invalidCases = [];
  for (const schemaVersion of [2, 3]) {
    const legacy = structuredClone(rehearsalEvidence());
    legacy.schemaVersion = schemaVersion;
    invalidCases.push([`legacy schema v${schemaVersion}`, legacy, "test_guild_rehearsal_provenance_invalid"]);
  }
  for (const [name, mutate] of [
    ["null artifact revision", evidence => { evidence.artifact.revision = null; }],
    ["artifact/release revision mismatch", evidence => { evidence.artifact.revision = "f".repeat(40); }],
    ["missing critical digest", evidence => { delete evidence.release.criticalDigest; }],
    ["invalid critical digest", evidence => { evidence.release.criticalDigest = "not-a-digest"; }],
    ["uppercase critical digest", evidence => { evidence.release.criticalDigest = RELEASE_DIGEST.toUpperCase(); }]
  ]) {
    const evidence = structuredClone(rehearsalEvidence());
    mutate(evidence);
    invalidCases.push([name, evidence, name === "missing critical digest"
      ? "test_guild_rehearsal_schema_invalid"
      : "test_guild_rehearsal_release_binding_invalid"]);
  }
  const backupTampering = structuredClone(rehearsalEvidence());
  backupTampering.rehearsal.backup.artifactDigest = "f".repeat(64);
  backupTampering.rehearsal.backup.persistedArtifactDigest = "f".repeat(64);
  invalidCases.push(["signed backup tampering", backupTampering, "test_guild_rehearsal_digest_invalid"]);

  for (const [name, evidence, code] of invalidCases) {
    await t.test(name, async () => {
      const report = await runWithRehearsal(fixture(), evidence);
      assert.equal(report.ready, false);
      assert.ok(blockerCodes(report).includes(code));
    });
  }
});

test("production-only rehearsal gate fails closed when its server-only verifier secret is unavailable", async () => {
  const report = await runWithRehearsal(fixture(), rehearsalEvidence(), {
    testGuildRehearsalEvidenceSecret: ""
  });
  assert.equal(report.ready, false);
  assert.ok(blockerCodes(report).includes("test_guild_rehearsal_secret_unavailable"));
});

test("production-only rehearsal gate rejects missing, duplicate, reversed, stale, or tampered previous evidence", async t => {
  const current = rehearsalEvidence();
  const duplicate = structuredClone(current);
  const reversed = rehearsalEvidence({
    verifiedAt: new Date(NOW_MS - 30_000).toISOString(),
    backupArtifactDigest: PREVIOUS_BACKUP_ARTIFACT_DIGEST
  });
  const sameTimestampDifferentBackup = rehearsalEvidence({
    verifiedAt: current.verifiedAt,
    backupArtifactDigest: PREVIOUS_BACKUP_ARTIFACT_DIGEST
  });
  const stale = rehearsalEvidence({ verifiedAt: new Date(NOW_MS - 2 * 60 * 60 * 1000).toISOString() });
  const tampered = structuredClone(rehearsalEvidence({ verifiedAt: new Date(NOW_MS - 120_000).toISOString() }));
  tampered.signature = `hmac-sha256:${"0".repeat(64)}`;
  const cases = [
    ["missing", undefined, "test_guild_rehearsal_evidence_unreadable"],
    ["duplicate backup", duplicate, "test_guild_rehearsal_backup_not_distinct"],
    ["same timestamp", sameTimestampDifferentBackup, "test_guild_rehearsal_runs_not_distinct"],
    ["reversed", reversed, "test_guild_rehearsal_history_order_invalid"],
    ["stale", stale, "test_guild_rehearsal_stale"],
    ["tampered", tampered, "test_guild_rehearsal_signature_invalid"]
  ];
  for (const [name, previousEvidence, code] of cases) {
    await t.test(name, async () => {
      const report = await runWithRehearsal(fixture(), current, { previousEvidence });
      assert.equal(report.ready, false);
      assert.ok(blockerCodes(report).includes(code));
      assert.equal(report.checks.find(check => check.id === "test_guild_rehearsal_pair").ok, false);
    });
  }
});

test("production-only rehearsal pair rejects release drift and reused backup artifacts", async t => {
  const current = rehearsalEvidence();
  const releaseDrift = rehearsalEvidence({
    verifiedAt: new Date(NOW_MS - 120_000).toISOString(),
    backupArtifactDigest: PREVIOUS_BACKUP_ARTIFACT_DIGEST,
    release: { revision: "f".repeat(40), criticalDigest: RELEASE_DIGEST }
  });
  const reusedBackup = rehearsalEvidence({
    verifiedAt: new Date(NOW_MS - 120_000).toISOString(),
    backupArtifactDigest: BACKUP_ARTIFACT_DIGEST
  });
  for (const [name, previousEvidence, code] of [
    ["release mismatch", releaseDrift, "test_guild_rehearsal_release_mismatch"],
    ["reused backup artifact", reusedBackup, "test_guild_rehearsal_backup_not_distinct"]
  ]) {
    await t.test(name, async () => {
      const report = await runWithRehearsal(fixture(), current, { previousEvidence });
      assert.equal(report.ready, false);
      assert.ok(blockerCodes(report).includes(code));
    });
  }
});

test("rehearsal persistence rotates only a different verified live run into history", async () => {
  const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fima-rehearsal-rotation-"));
  const evidencePath = path.join(artifactRoot, "rehearsal.json");
  const previousEvidencePath = paradisePreviousRehearsalEvidencePath(evidencePath);
  const first = rehearsalEvidence({ verifiedAt: new Date(NOW_MS - 120_000).toISOString() });
  const second = rehearsalEvidence({
    verifiedAt: new Date(NOW_MS - 60_000).toISOString(),
    backupArtifactDigest: PREVIOUS_BACKUP_ARTIFACT_DIGEST
  });
  const timestampConflict = rehearsalEvidence({
    verifiedAt: first.verifiedAt,
    backupArtifactDigest: PREVIOUS_BACKUP_ARTIFACT_DIGEST
  });
  const reversed = rehearsalEvidence({
    verifiedAt: new Date(NOW_MS - 180_000).toISOString(),
    backupArtifactDigest: PREVIOUS_BACKUP_ARTIFACT_DIGEST
  });
  const reusedBackup = rehearsalEvidence({
    verifiedAt: new Date(NOW_MS - 30_000).toISOString(),
    backupArtifactDigest: BACKUP_ARTIFACT_DIGEST
  });
  try {
    await persistParadiseRehearsalEvidence(evidencePath, first, { secret: TEST_EVIDENCE_SECRET });
    await persistParadiseRehearsalEvidence(evidencePath, first, { secret: TEST_EVIDENCE_SECRET });
    await assert.rejects(fs.readFile(previousEvidencePath, "utf8"), { code: "ENOENT" });

    await assert.rejects(
      persistParadiseRehearsalEvidence(evidencePath, timestampConflict, { secret: TEST_EVIDENCE_SECRET }),
      error => error?.code === "test_guild_rehearsal_timestamp_conflict"
    );
    await assert.rejects(
      persistParadiseRehearsalEvidence(evidencePath, reversed, { secret: TEST_EVIDENCE_SECRET }),
      error => error?.code === "test_guild_rehearsal_history_order_invalid"
    );
    await assert.rejects(
      persistParadiseRehearsalEvidence(evidencePath, reusedBackup, { secret: TEST_EVIDENCE_SECRET }),
      error => error?.code === "test_guild_rehearsal_backup_not_distinct"
    );

    await persistParadiseRehearsalEvidence(evidencePath, second, { secret: TEST_EVIDENCE_SECRET });
    assert.deepEqual(JSON.parse(await fs.readFile(evidencePath, "utf8")), second);
    assert.deepEqual(JSON.parse(await fs.readFile(previousEvidencePath, "utf8")), first);
  } finally {
    await fs.rm(artifactRoot, { recursive: true, force: true });
  }
});

test("test-guild preflight remains ready without rehearsal evidence", async () => {
  const report = await runPreflight(fixture());
  assert.equal(report.ready, true);
  assert.equal(report.checks.some(check => check.id === "test_guild_rehearsal_pair"), false);
});

test("full rebuild preflight is read-only and ready only with complete evidence", async () => {
  const current = fixture();
  let captures = 0;
  const report = await runPreflight(current, {
    captureSnapshot: async () => {
      captures += 1;
      return current.snapshot;
    }
  });
  assert.equal(report.ready, true);
  assert.equal(report.code, "paradise_rebuild_preflight_ready");
  assert.equal(report.mutationCount, 0);
  assert.equal(captures, 1);
  assert.equal(report.snapshot.guildId, GUILD_ID);
  assert.match(report.backup.digest, /^[a-f0-9]{64}$/);
  assert.match(report.backup.artifactDigest, /^[a-f0-9]{64}$/);
  assert.notEqual(report.backup.digest, report.backup.artifactDigest);
  assert.equal(Object.hasOwn(report, "backupEnvelope"), false);
  assert.deepEqual(report.blockers, []);
  assert.ok(report.checks.every(check => check.ok));
});

test("full backup envelope is available only through the explicit internal option", async () => {
  const report = await runPreflight(fixture(), { includeBackupEnvelope: true });
  assert.equal(report.ready, true);
  assert.ok(report.backupEnvelope);
  assert.equal(report.backupEnvelope.guildId, GUILD_ID);
  assert.equal(report.backupEnvelope.integrity.digest, report.backup.artifactDigest);
});

test("preflight rejects every guild except the disposable test guild before capture", async () => {
  const current = fixture();
  current.guild.id = "1520519015661961999";
  let captured = false;
  const report = await runPreflight(current, { captureSnapshot: async () => { captured = true; } });
  assert.equal(report.ready, false);
  assert.equal(report.code, "wrong_rebuild_guild");
  assert.equal(captured, false);
  assert.equal(report.mutationCount, 0);
});

test("preflight blocks missing bot identity and missing live bot membership", async t => {
  await t.test("identity", async () => {
    const current = fixture();
    current.guild.client.user = null;
    const report = await runPreflight(current);
    assert.ok(blockerCodes(report).includes("bot_identity_missing"));
  });
  await t.test("membership", async () => {
    const current = fixture();
    current.guild.members.me = null;
    current.guild.members.fetchMe = async () => { throw new Error("missing"); };
    const report = await runPreflight(current);
    assert.ok(blockerCodes(report).includes("bot_guild_member_missing"));
  });
});

test("preflight blocks a missing privileged gateway intent", async () => {
  const current = fixture();
  current.guild.client.options.intents = intentSet(PARADISE_REBUILD_REQUIRED_INTENTS.filter(name => name !== "MessageContent"));
  const report = await runPreflight(current);
  assert.ok(blockerCodes(report).includes("required_gateway_intent_missing"));
  assert.deepEqual(report.blockers.find(item => item.code === "required_gateway_intent_missing").details.missing, ["MessageContent"]);
});

test("preflight blocks a missing guild restore permission", async () => {
  const current = fixture();
  current.me.permissions = permissionSet(PARADISE_REBUILD_REQUIRED_GUILD_PERMISSIONS.filter(name => name !== "ManageWebhooks"));
  const report = await runPreflight(current);
  assert.ok(blockerCodes(report).includes("required_guild_permission_missing"));
  assert.deepEqual(report.blockers.find(item => item.code === "required_guild_permission_missing").details.missing, ["ManageWebhooks"]);
});

test("preflight blocks text channels without backup read access", async () => {
  const current = fixture();
  current.channel.permissionsFor = () => permissionSet(["ViewChannel"]);
  const report = await runPreflight(current);
  assert.ok(blockerCodes(report).includes("text_channel_backup_access_missing"));
  assert.deepEqual(
    report.blockers.find(item => item.code === "text_channel_backup_access_missing").details.blockedChannels[0].missing,
    ["ReadMessageHistory"]
  );
});

test("preflight fails closed when backup capture throws or a restore scope is incomplete", async t => {
  await t.test("capture failure", async () => {
    const current = fixture();
    const report = await runPreflight(current, {
      captureSnapshot: async () => { const error = new Error("fetch failed"); error.code = "channel_fetch_failed"; throw error; }
    });
    assert.ok(blockerCodes(report).includes("channel_fetch_failed"));
  });
  await t.test("scope failure", async () => {
    const current = fixture();
    current.snapshot.restoreCapabilities = { ...current.snapshot.restoreCapabilities, webhooks: false };
    current.snapshot.captureErrors = [{ scope: "webhooks", code: "webhook_fetch_failed" }];
    const report = await runPreflight(current);
    assert.ok(blockerCodes(report).includes("backup_restore_scope_incomplete"));
    assert.deepEqual(report.blockers.find(item => item.code === "backup_restore_scope_incomplete").details.missing, ["webhooks"]);
  });
});

test("preflight requires every mapped canonical message and channel", async t => {
  await t.test("message", async () => {
    const current = fixture();
    current.snapshot.canonicalMessages = [];
    const report = await runPreflight(current);
    assert.ok(blockerCodes(report).includes("mapped_canonical_message_missing"));
  });
  await t.test("channel", async () => {
    const current = fixture();
    current.snapshot.guildConfigReferences.channelIds.push("1520519015661961777");
    const report = await runPreflight(current);
    assert.ok(blockerCodes(report).includes("mapped_channel_missing"));
  });
});

test("preflight blocks unmanaged roles at or above the bot hierarchy", async () => {
  const current = fixture();
  current.snapshot.roles.push({ id: "1520519015661961888", name: "Owner Admin", position: 10, managed: false });
  const report = await runPreflight(current);
  assert.ok(blockerCodes(report).includes("bot_role_hierarchy_blocked"));
  assert.equal(report.blockers.find(item => item.code === "bot_role_hierarchy_blocked").details.blockedRoles[0].name, "Owner Admin");
});

test("preflight preserves owner and bot access by requiring both member records", async t => {
  await t.test("owner", async () => {
    const current = fixture();
    current.snapshot.memberRoles = current.snapshot.memberRoles.filter(member => member.memberId !== OWNER_ID);
    const report = await runPreflight(current);
    assert.ok(blockerCodes(report).includes("guild_owner_member_not_captured"));
  });
  await t.test("bot", async () => {
    const current = fixture();
    current.snapshot.memberRoles = current.snapshot.memberRoles.filter(member => member.memberId !== BOT_ID);
    const report = await runPreflight(current);
    assert.ok(blockerCodes(report).includes("bot_member_not_captured"));
  });
});

test("preflight blocks an unresolved rollback marker", async () => {
  const current = fixture();
  const report = await runPreflight(current, {
    readRollbackMarker: async () => ({ markerId: "marker-1", status: "rollback_required" })
  });
  assert.ok(blockerCodes(report).includes("unresolved_rollback_marker"));
});

test("preflight rejects a foreign lease and accepts only the explicitly owned correlation", async t => {
  await t.test("foreign", async () => {
    const current = fixture();
    const report = await runPreflight(current, {
      readLeaseStatus: async () => ({ locked: true, correlationId: "foreign", operation: "repair", phase: "active" })
    });
    assert.ok(blockerCodes(report).includes("foreign_active_mutation_lease"));
  });
  await t.test("owned reentrant", async () => {
    const current = fixture();
    const report = await runPreflight(current, {
      allowedCorrelationId: "owned",
      readLeaseStatus: async () => ({ locked: true, correlationId: "owned", operation: "auto_smoke", phase: "active" })
    });
    assert.equal(report.ready, true);
    assert.equal(report.checks.find(check => check.id === "mutation_lease").details.ownReentrantLease, true);
  });
});

test("preflight proves artifact write/read/cleanup and fails closed on storage errors", async t => {
  await t.test("probe cleanup", async () => {
    const current = fixture();
    const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fima-rebuild-probe-cleanup-"));
    try {
      const report = await runPreflight(current, { artifactRoot, keepArtifactRoot: true });
      assert.equal(report.ready, true);
      assert.deepEqual((await fs.readdir(artifactRoot)).filter(name => name.startsWith(".rebuild-preflight-")), []);
    } finally {
      await fs.rm(artifactRoot, { recursive: true, force: true });
    }
  });
  await t.test("write failure", async () => {
    const current = fixture();
    const writeFailure = new Error("read only");
    writeFailure.code = "EROFS";
    const report = await runPreflight(current, {
      fileApi: {
        mkdir: fs.mkdir,
        writeFile: async () => { throw writeFailure; },
        readFile: fs.readFile,
        rm: fs.rm,
        stat: fs.stat
      }
    });
    assert.ok(blockerCodes(report).includes("EROFS"));
  });
  await t.test("readback failure", async () => {
    const current = fixture();
    const readFailure = new Error("cannot read");
    readFailure.code = "EIO";
    const report = await runPreflight(current, {
      fileApi: {
        mkdir: fs.mkdir,
        writeFile: fs.writeFile,
        readFile: async () => { throw readFailure; },
        rm: fs.rm,
        stat: fs.stat
      }
    });
    assert.ok(blockerCodes(report).includes("EIO"));
  });
});

test("preflight never reaches Discord mutation methods", async () => {
  const current = fixture();
  let mutationCalls = 0;
  const mutation = async () => { mutationCalls += 1; };
  Object.assign(current.guild, { delete: mutation, edit: mutation, setName: mutation });
  Object.assign(current.guild.channels, { create: mutation });
  Object.assign(current.channel, { delete: mutation, edit: mutation, send: mutation, setParent: mutation });
  const report = await runPreflight(current);
  assert.equal(report.ready, true);
  assert.equal(report.mutationCount, 0);
  assert.equal(mutationCalls, 0);
});
