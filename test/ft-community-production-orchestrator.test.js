import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createParadiseBackupEnvelope, paradiseBackupStateDigest } from "../src/paradiseBackupIntegrity.js";
import {
  consumeParadiseProductionRebuildPlan,
  createParadiseProductionRebuildPlan,
  finishParadiseProductionRebuildPlan
} from "../src/paradiseProductionRebuildPlan.js";
import { runFtCommunityProductionOrchestrator } from "../src/ftCommunityProductionOrchestrator.js";
import { computeFtCommunityReleaseDigest } from "../src/ftCommunityReleaseAttestation.js";
import {
  FT_COMMUNITY_PRODUCTION_CLI_CONFIRMATION,
  inspectFtCommunityProductionCliArming,
  runFtCommunityProductionCli
} from "../scripts/ft-community-production.js";

const GUILD_ID = "1419335632324657306";
const OWNER_ID = "123456789012345678";
const APPLICATION_ID = "987654321098765432";
const SECRET = "test-only-production-secret-material-longer-than-32-bytes";
const NOW = Date.parse("2026-08-09T10:00:00.000Z");
const CLI_ARGS = Object.freeze([
  "--target-guild",
  GUILD_ID,
  "--confirm",
  FT_COMMUNITY_PRODUCTION_CLI_CONFIRMATION
]);

function backup() {
  return createParadiseBackupEnvelope({
    guildId: GUILD_ID,
    capturedAt: new Date(NOW).toISOString(),
    categories: [], channels: [], roles: [], memberRoles: [], canonicalMessages: [],
    contentArchive: [], autoModRules: [], webhooks: [], tickets: [],
    restoreCapabilities: {
      guildIdentity: true, roles: true, memberRoles: true, channels: true,
      canonicalMessages: true, contentArchive: true, autoModRules: true,
      webhooks: true, tickets: true
    }
  }, new Date(NOW));
}

function preflight(overrides = {}) {
  const envelope = overrides.backupEnvelope || backup();
  return {
    ready: true,
    code: "paradise_rebuild_preflight_ready",
    checkedAt: new Date(NOW).toISOString(),
    mutationCount: 0,
    checks: [
      {
        id: "test_guild_rehearsal_pair", ok: true, code: "ok",
        details: {
          verifiedCount: 2, provenanceVerified: true, timestampsDistinct: true,
          signaturesDistinct: true, digestsDistinct: true, chronological: true,
          previous: { verifiedAt: new Date(NOW - 2_000).toISOString(), productionUntouched: true },
          current: { verifiedAt: new Date(NOW - 1_000).toISOString(), productionUntouched: true }
        }
      },
      { id: "rollback_marker", ok: true, code: "ok" },
      { id: "mutation_lease", ok: true, code: "ok" },
      { id: "backup_restore_scopes", ok: true, code: "ok" }
    ],
    backup: {
      digest: paradiseBackupStateDigest(envelope),
      artifactDigest: envelope.integrity.digest
    },
    backupEnvelope: envelope,
    ...overrides
  };
}

function environment(overrides = {}) {
  return {
    RENDER_GIT_COMMIT: "a".repeat(40),
    FT_COMMUNITY_APPROVED_RENDER_COMMIT: "a".repeat(40),
    FT_COMMUNITY_APPROVED_RELEASE_SHA256: computeFtCommunityReleaseDigest(),
    DISCORD_BOT_TOKEN: "must-never-appear-in-output",
    DISCORD_CLIENT_ID: APPLICATION_ID,
    FIMA_OWNER_DISCORD_ID: OWNER_ID,
    PARADISE_REHEARSAL_EVIDENCE_SECRET: SECRET,
    PARADISE_PRODUCTION_REBUILD_PLAN_SECRET: SECRET,
    FIEELS_COMMUNITY_GUILD_ID: GUILD_ID,
    DISCORD_GUILD_ID: GUILD_ID,
    FT_COMMUNITY_PROFILE_GUILD_ID: GUILD_ID,
    FT_COMMUNITY_PROFILE_OWNER_USER_ID: OWNER_ID,
    FIMA_BOT_EXPECTED_APPLICATION_ID: APPLICATION_ID,
    FIMA_BOT_PROFILE_OWNER_USER_ID: OWNER_ID,
    ...overrides
  };
}

function clientFixture(overrides = {}) {
  const guild = { id: GUILD_ID, ownerId: OWNER_ID };
  const cache = new Map([[GUILD_ID, guild]]);
  const client = {
    isReady: () => true,
    application: { id: APPLICATION_ID },
    user: { id: APPLICATION_ID },
    guilds: { cache, fetch: async () => guild },
    ...overrides
  };
  return { client, guild };
}

function verifiedRebuild(overrides = {}) {
  return {
    status: "LIVE DISCORD VERIFIED",
    structureVerification: { ready: true },
    reconciliation: { canRestore: true, mutationsPlanned: 0 },
    rollback: {
      required: true,
      markerId: "synthetic-marker-id",
      markerStatus: "rollback_required",
      pendingFinalization: true
    },
    roleIcons: { status: "verified", readiness: { ready: true } },
    autoMod: { status: "configured", errors: [] },
    guideReadiness: { ready: true },
    staffTeam: { verified: true },
    communityLiveEvidence: { ready: true },
    ...overrides
  };
}

function validProfile(changes = []) {
  return {
    applied: changes.length > 0,
    dryRun: false,
    changes,
    readback: { ready: true, fresh: true }
  };
}

async function planRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fima-ft-production-orchestrator-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function dependencies(overrides = {}) {
  return {
    inspectDeploymentReadiness: () => ({ ready: true }),
    inspectVisualAssets: async () => ({
      ready: true,
      code: "ft_community_visual_assets_ready"
    }),
    inspectPreflight: async () => preflight(),
    inspectPostAudit: async () => preflight(),
    rebuild: async () => verifiedRebuild(),
    recoverRollback: async () => ({
      status: "ok",
      rollbackRecovered: true,
      reconciliationCanRestore: true,
      reconciliationMutationsPlanned: 0
    }),
    finalizeRollback: async () => ({ status: "ok", rollbackFinalized: true }),
    inspectCommunityProfile: async () => ({ applyEnabled: true, scopeReady: true }),
    applyCommunityProfile: async () => validProfile(["guild_icon"]),
    inspectBotProfile: async () => ({ applyEnabled: true, scopeReady: true }),
    applyBotProfile: async () => validProfile(["bot_avatar"]),
    ...overrides
  };
}

async function run(t, options = {}) {
  const { client } = options.clientFixture || clientFixture();
  return runFtCommunityProductionOrchestrator({
    client,
    env: options.env || environment(),
    planRoot: options.planRoot || await planRoot(t),
    dependencies: dependencies(options.dependencies),
    now: () => NOW
  });
}

test("names-only deployment readiness blocks before release or Discord access", async t => {
  const calls = [];
  const { client } = clientFixture({
    guilds: {
      cache: new Map(),
      fetch: async () => { calls.push("guild_fetch"); throw new Error("must not run"); }
    }
  });
  const result = await run(t, {
    clientFixture: { client },
    dependencies: {
      inspectDeploymentReadiness: () => ({
        ready: false,
        missing: ["SAFE_ENV_NAME_ONLY"],
        secret: "must-not-leak"
      }),
      inspectVisualAssets: async () => { calls.push("visual_assets"); throw new Error("must not run"); },
      inspectPreflight: async () => { calls.push("preflight"); throw new Error("must not run"); }
    }
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "ft_community_deployment_not_ready");
  assert.equal(result.phase, "deployment_readiness");
  assert.equal(result.targetVerified, false);
  assert.equal(result.planOutcome, "not_consumed");
  assert.deepEqual(calls, []);
  assert.doesNotMatch(JSON.stringify(result), /SAFE_ENV_NAME_ONLY|must-not-leak/);
});

test("production orchestration succeeds only in the exact audited call order", async t => {
  const order = [];
  const result = await run(t, { dependencies: {
    inspectVisualAssets: async () => { order.push("visual_assets"); return { ready: true, code: "ft_community_visual_assets_ready" }; },
    inspectPreflight: async () => { order.push("preflight"); return preflight(); },
    createPlan: async input => { order.push("create"); return createParadiseProductionRebuildPlan(input); },
    consumePlan: async input => { order.push("consume"); return consumeParadiseProductionRebuildPlan(input); },
    rebuild: async () => { order.push("rebuild"); return verifiedRebuild(); },
    inspectPostAudit: async () => { order.push("post_audit"); return preflight(); },
    inspectCommunityProfile: async () => { order.push("community_inspect"); return { applyEnabled: true, scopeReady: true }; },
    applyCommunityProfile: async () => { order.push("community_apply"); return validProfile(["guild_icon"]); },
    inspectBotProfile: async () => { order.push("bot_inspect"); return { applyEnabled: true, scopeReady: true }; },
    applyBotProfile: async () => { order.push("bot_apply"); return validProfile(["bot_avatar"]); },
    finishPlan: async input => { order.push(`finish_${input.outcome}`); return finishParadiseProductionRebuildPlan(input); },
    finalizeRollback: async () => { order.push("finalize_rollback"); return { status: "ok", rollbackFinalized: true }; }
  } });
  assert.equal(result.ok, true);
  assert.equal(result.postAuditVerified, true);
  assert.equal(result.communityProfileReadbackVerified, true);
  assert.equal(result.botProfileReadbackVerified, true);
  assert.deepEqual(order, ["visual_assets", "preflight", "create", "consume", "rebuild", "post_audit", "community_inspect", "community_apply", "bot_inspect", "bot_apply", "finish_completed", "finalize_rollback"]);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  assert.equal(JSON.stringify(result).includes("must-never-appear"), false);
});

test("visual package drift blocks before Discord fetch, preflight or plan operations", async t => {
  const calls = [];
  const { client } = clientFixture({
    guilds: {
      cache: new Map(),
      fetch: async () => { calls.push("guild_fetch"); throw new Error("must not run"); }
    }
  });
  const result = await run(t, {
    clientFixture: { client },
    dependencies: {
      inspectVisualAssets: async () => ({
        ready: false,
        code: "ft_community_visual_assets_not_ready",
        localPath: "must-not-leak"
      }),
      inspectPreflight: async () => { calls.push("preflight"); return preflight(); },
      createPlan: async input => { calls.push("create"); return createParadiseProductionRebuildPlan(input); }
    }
  });
  assert.equal(result.code, "ft_community_visual_assets_not_ready");
  assert.equal(result.phase, "visual_assets");
  assert.equal(result.planOutcome, "not_consumed");
  assert.deepEqual(calls, []);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("client readiness, cache and immutable production target fail closed", async t => {
  for (const [fixture, code] of [
    [clientFixture({ isReady: () => false }), "ft_community_client_not_ready"],
    [clientFixture({ guilds: { cache: new Map(), fetch: async () => ({ id: GUILD_ID, ownerId: OWNER_ID }) } }), "ft_community_production_guild_not_cached"],
    [clientFixture({ guilds: { cache: new Map([[GUILD_ID, { id: GUILD_ID }]]), fetch: async () => ({ id: "1520519015661961257" }) } }), "ft_community_wrong_production_guild"]
  ]) {
    const result = await run(t, { clientFixture: fixture });
    assert.equal(result.code, code);
    assert.equal(result.targetVerified, false);
    assert.equal(result.planOutcome, "not_consumed");
  }
});

test("release attestation blocks before any Discord guild read", async t => {
  let fetches = 0;
  const { client } = clientFixture({
    guilds: {
      cache: new Map(),
      fetch: async () => { fetches += 1; throw new Error("must not run"); }
    }
  });
  const result = await run(t, {
    clientFixture: { client },
    env: environment({ FT_COMMUNITY_APPROVED_RELEASE_SHA256: "f".repeat(64) })
  });
  assert.equal(result.code, "ft_community_release_attestation_mismatch");
  assert.equal(result.phase, "release_attestation");
  assert.equal(result.targetVerified, false);
  assert.equal(fetches, 0);
});

test("failures after immutable target validation preserve verified target evidence", async t => {
  const calls = [];
  const result = await run(t, { dependencies: {
    inspectPreflight: async () => {
      calls.push("preflight");
      throw Object.assign(new Error("must-not-leak"), { code: "preflight_dependency_failed" });
    }
  } });
  assert.equal(result.ok, false);
  assert.equal(result.phase, "preflight");
  assert.equal(result.targetVerified, true);
  assert.equal(result.planOutcome, "not_consumed");
  assert.deepEqual(calls, ["preflight"]);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

test("invalid canonical text encoding blocks before preflight or plan operations", async t => {
  const calls = [];
  const result = await run(t, { dependencies: {
    inspectCanonicalTextEncoding: () => ({
      ready: false,
      code: "canonical_text_encoding_invalid",
      affected: ["categories[0]"]
    }),
    inspectPreflight: async () => { calls.push("preflight"); return preflight(); },
    createPlan: async input => { calls.push("create"); return createParadiseProductionRebuildPlan(input); },
    consumePlan: async input => { calls.push("consume"); return consumeParadiseProductionRebuildPlan(input); }
  } });
  assert.equal(result.code, "ft_community_canonical_text_encoding_invalid");
  assert.equal(result.phase, "canonical_text_encoding");
  assert.equal(result.planOutcome, "not_consumed");
  assert.deepEqual(calls, []);
});

test("live owner, application and environment scope bindings cannot drift", async t => {
  const cases = [
    [clientFixture({ guilds: { cache: new Map([[GUILD_ID, { id: GUILD_ID, ownerId: "111111111111111111" }]]), fetch: async () => ({ id: GUILD_ID, ownerId: "111111111111111111" }) } }), environment(), "ft_community_live_owner_binding_mismatch"],
    [clientFixture({ application: { id: "111111111111111111" }, user: { id: "111111111111111111" } }), environment(), "ft_community_live_application_binding_mismatch"],
    [clientFixture(), environment({ DISCORD_GUILD_ID: "1520519015661961257" }), "ft_community_runtime_scope_binding_mismatch"]
  ];
  for (const [fixture, env, code] of cases) {
    const result = await run(t, { clientFixture: fixture, env });
    assert.equal(result.code, code);
  }
});

test("two fresh distinct rehearsals, rollback marker and mutation lease are mandatory", async t => {
  const oneRun = preflight();
  oneRun.checks[0].details.verifiedCount = 1;
  const stale = preflight({ checkedAt: new Date(NOW - 60_001).toISOString() });
  for (const [candidate, code] of [
    [oneRun, "production_rebuild_rehearsal_pair_invalid"],
    [stale, "production_rebuild_preflight_stale"],
    [{ ...preflight(), ready: false, code: "unresolved_rollback_marker" }, "unresolved_rollback_marker"],
    [{ ...preflight(), ready: false, code: "foreign_active_mutation_lease" }, "foreign_active_mutation_lease"]
  ]) {
    const result = await run(t, { dependencies: { inspectPreflight: async () => candidate } });
    assert.equal(result.code, code);
    assert.equal(result.planOutcome, "not_consumed");
  }
});

test("invalid backup envelopes and readback digests never create a consumable plan", async t => {
  const invalid = preflight();
  invalid.backupEnvelope.guildId = "tampered";
  const digestMismatch = preflight();
  digestMismatch.backup.digest = "0".repeat(64);
  for (const [candidate, code] of [
    [invalid, "production_rebuild_plan_backup_invalid"],
    [digestMismatch, "production_rebuild_plan_backup_readback_failed"]
  ]) {
    const result = await run(t, { dependencies: { inspectPreflight: async () => candidate } });
    assert.equal(result.code, code);
    assert.equal(result.planOutcome, "not_consumed");
  }
});

test("a sealed production plan cannot be reused", async t => {
  const root = await planRoot(t);
  const candidate = preflight();
  const status = await createParadiseProductionRebuildPlan({
    guildId: GUILD_ID, expectedGuildId: GUILD_ID, mode: "community",
    backup: candidate.backupEnvelope, ownerUserId: OWNER_ID, secret: SECRET,
    preflight: candidate, planRoot: root, nowMs: NOW
  });
  await consumeParadiseProductionRebuildPlan({
    planId: status.planId, guildId: GUILD_ID, mode: "community",
    backupDigest: status.backup.digest, ownerUserId: OWNER_ID,
    confirmation: status.requiredConfirmation, secret: SECRET, planRoot: root, nowMs: NOW
  });
  const result = await run(t, {
    planRoot: root,
    dependencies: { inspectPreflight: async () => candidate, createPlan: async () => status }
  });
  assert.equal(result.code, "production_rebuild_plan_already_used");
  assert.equal(result.planOutcome, "not_consumed");
});

test("every post-consume rebuild verification failure finalizes the plan as failed", async t => {
  const cases = [
    [verifiedRebuild({ status: "LIVE DISCORD FAILED" }), "ft_community_live_rebuild_not_verified"],
    [verifiedRebuild({ structureVerification: { ready: false } }), "ft_community_live_structure_drift"],
    [verifiedRebuild({ reconciliation: { canRestore: false, mutationsPlanned: 1 } }), "ft_community_live_reconciliation_drift"],
    [verifiedRebuild({ rollback: { required: false } }), "ft_community_live_rollback_required"],
    [verifiedRebuild({ rollback: { required: true, markerId: "short", markerStatus: "rollback_required", pendingFinalization: true } }), "ft_community_live_rollback_required"],
    [verifiedRebuild({ rollback: { required: true, markerId: "synthetic-marker-id", markerStatus: "resolved", pendingFinalization: true } }), "ft_community_live_rollback_required"],
    [verifiedRebuild({ rollback: { required: true, markerId: "synthetic-marker-id", markerStatus: "rollback_required", pendingFinalization: false } }), "ft_community_live_rollback_required"],
    [verifiedRebuild({ roleIcons: { status: "partial", readiness: { ready: true } } }), "ft_community_live_role_icons_not_verified"],
    [verifiedRebuild({ roleIcons: { status: "verified", readiness: { ready: false } } }), "ft_community_live_role_icons_not_verified"],
    [verifiedRebuild({ autoMod: { status: "configured", errors: ["synthetic"] } }), "ft_community_live_automod_not_verified"],
    [verifiedRebuild({ autoMod: { status: "partial", errors: [] } }), "ft_community_live_automod_not_verified"],
    [verifiedRebuild({ guideReadiness: { ready: false } }), "ft_community_live_guides_not_verified"],
    [verifiedRebuild({ staffTeam: { verified: false } }), "ft_community_live_staff_team_not_verified"],
    [verifiedRebuild({ communityLiveEvidence: { ready: false } }), "ft_community_live_evidence_not_verified"]
  ];
  for (const [rebuild, code] of cases) {
    const outcomes = [];
    const result = await run(t, { dependencies: {
      rebuild: async () => rebuild,
      finishPlan: async input => { outcomes.push(input.outcome); return finishParadiseProductionRebuildPlan(input); }
    } });
    assert.equal(result.code, code);
    assert.equal(result.planOutcome, "failed");
    assert.deepEqual(outcomes, ["failed"]);
  }
});

test("profile mutations wait for a fresh post-audit and return validated results", async t => {
  let profileCalls = 0;
  const blocked = await run(t, { dependencies: {
    inspectPostAudit: async () => preflight({ checkedAt: new Date(NOW - 60_001).toISOString() }),
    inspectCommunityProfile: async () => { profileCalls += 1; return { applyEnabled: true, scopeReady: true }; }
  } });
  assert.equal(blocked.code, "ft_community_post_audit_not_verified");
  assert.equal(blocked.planOutcome, "failed");
  assert.equal(profileCalls, 0);

  const invalidApply = await run(t, { dependencies: {
    applyCommunityProfile: async () => ({ applied: true, dryRun: false })
  } });
  assert.equal(invalidApply.code, "guild_profile_sync_result_invalid");
  assert.equal(invalidApply.planOutcome, "failed");

  for (const readback of [undefined, { ready: false, fresh: true }, { ready: true, fresh: false }]) {
    const staleApply = await run(t, { dependencies: {
      applyCommunityProfile: async () => ({
        applied: true,
        dryRun: false,
        changes: ["guild_icon"],
        readback
      })
    } });
    assert.equal(staleApply.code, "guild_profile_sync_result_invalid");
    assert.equal(staleApply.planOutcome, "failed");
  }

  for (const readback of [undefined, { ready: false, fresh: true }, { ready: true, fresh: false }]) {
    const staleApply = await run(t, { dependencies: {
      applyBotProfile: async () => ({
        applied: true,
        dryRun: false,
        changes: ["bot_avatar"],
        readback
      })
    } });
    assert.equal(staleApply.code, "ft_community_bot_profile_remediation_required");
    assert.equal(staleApply.phase, "bot_profile_remediation");
    assert.equal(staleApply.planOutcome, "failed");
    assert.equal(staleApply.guildRollbackRecovered, true);
    assert.equal(staleApply.botProfileRemediationRequired, true);
    assert.equal(staleApply.rollbackRequired, true);
  }
});

test("post-audit, profile and completed-plan failures recover before the plan is sealed failed", async t => {
  const cases = [
    ["post_audit", { inspectPostAudit: async () => preflight({ checkedAt: new Date(NOW - 60_001).toISOString() }) }],
    ["community_profile_apply", { applyCommunityProfile: async () => ({ applied: true, dryRun: false }) }],
    ["bot_profile_apply", { applyBotProfile: async () => ({ applied: true, dryRun: false }) }],
    ["plan_finish", { finishPlan: async input => (
      input.outcome === "completed"
        ? { state: "executing" }
        : finishParadiseProductionRebuildPlan(input)
    ) }]
  ];
  for (const [expectedPhase, overrides] of cases) {
    const order = [];
    const result = await run(t, { dependencies: {
      ...overrides,
      recoverRollback: async () => {
        order.push("recover");
        return {
          status: "ok",
          rollbackRecovered: true,
          reconciliationCanRestore: true,
          reconciliationMutationsPlanned: 0
        };
      },
      finishPlan: overrides.finishPlan || (async input => {
        order.push(`finish_${input.outcome}`);
        return finishParadiseProductionRebuildPlan(input);
      }),
      finalizeRollback: async () => { order.push("finalize"); throw new Error("must not finalize"); }
    } });
    assert.equal(
      result.phase,
      expectedPhase === "bot_profile_apply" ? "bot_profile_remediation" : expectedPhase
    );
    assert.equal(result.planOutcome, "failed");
    if (expectedPhase === "bot_profile_apply") {
      assert.equal(result.code, "ft_community_bot_profile_remediation_required");
      assert.equal(result.guildRollbackRecovered, true);
      assert.equal(result.botProfileRemediationRequired, true);
      assert.equal(result.rollbackRequired, true);
    }
    if (expectedPhase !== "plan_finish") assert.deepEqual(order, ["recover", "finish_failed"]);
    else assert.deepEqual(order, ["recover"]);
  }
});

test("finalizer failure leaves the completed plan retryable and never attempts recovery", async t => {
  let recoveries = 0;
  const secretDetail = "raw-finalizer-detail-must-not-leak";
  const result = await run(t, { dependencies: {
    finalizeRollback: async () => {
      throw Object.assign(new Error(secretDetail), { code: secretDetail });
    },
    recoverRollback: async () => { recoveries += 1; throw new Error("must not recover"); }
  } });
  assert.deepEqual(result, {
    schemaVersion: 1,
    ok: false,
    code: "ft_community_rollback_finalization_pending",
    phase: "rollback_finalize",
    targetVerified: true,
    planOutcome: "completed",
    structurePreserved: true,
    retryable: true,
    rollbackRequired: true
  });
  assert.equal(recoveries, 0);
  assert.equal(JSON.stringify(result).includes(secretDetail), false);
});

test("one-shot CLI always closes the client and never emits the token", async () => {
  const token = "cli-token-must-never-be-serialized";
  for (const mode of ["success", "login_error", "orchestrator_error"]) {
    let destroyed = 0;
    let receivedEnv;
    let output = "";
    const { client: baseClient } = clientFixture();
    const client = {
      ...baseClient,
      login: async value => { assert.equal(value, token); if (mode === "login_error") throw new Error("login failed"); },
      destroy: async () => { destroyed += 1; }
    };
    const result = await runFtCommunityProductionCli({
      env: environment({ DISCORD_BOT_TOKEN: token }),
      argv: CLI_ARGS,
      stdout: { write: value => { output += value; } },
      createClient: () => client,
      orchestrate: async input => {
        receivedEnv = input.env;
        if (mode === "orchestrator_error") throw new Error("secret raw failure");
        return { schemaVersion: 1, ok: true, code: "ok" };
      }
    });
    assert.equal(destroyed, 1);
    assert.equal(output.includes(token), false);
    assert.equal(JSON.stringify(result).includes(token), false);
    if (mode === "success") {
      assert.equal(receivedEnv.DISCORD_BOT_TOKEN, "authenticated_in_memory");
      assert.equal(receivedEnv.DISCORD_CLIENT_ID, APPLICATION_ID);
      assert.equal(receivedEnv.FIMA_OWNER_DISCORD_ID, OWNER_ID);
      assert.equal(receivedEnv.FIMA_BOT_PROFILE_GUILD_IDS, `${GUILD_ID},1520519015661961257`);
      assert.equal(receivedEnv.FIMA_BOT_PROFILE_ASSET_ROOT, "public/assets/images/discord/v5");
      assert.equal(receivedEnv.FIMA_BOT_PROFILE_AVATAR_ASSET, "fima-bot-avatar-v5.png");
      assert.equal(receivedEnv.FIMA_BOT_PROFILE_BANNER_ASSET, "fima-bot-profile-banner-v5.png");
      assert.equal(receivedEnv.FT_COMMUNITY_PROFILE_ASSET_ROOT, "public/assets/images/discord");
      assert.equal(receivedEnv.FT_COMMUNITY_PROFILE_ICON_ASSET, "v5/ft-community-server-icon-v5.png");
      assert.equal(receivedEnv.FT_COMMUNITY_PROFILE_BANNER_ASSET, "v5/ft-community-server-banner-v5.png");
      assert.equal(receivedEnv.FT_COMMUNITY_PROFILE_SPLASH_ASSET, "v5/ft-community-invite-splash-v5.png");
      assert.match(receivedEnv.FIMA_BOT_PROFILE_AVATAR_SHA256, /^[a-f0-9]{64}$/u);
      assert.match(receivedEnv.FIMA_BOT_PROFILE_BANNER_SHA256, /^[a-f0-9]{64}$/u);
      assert.match(receivedEnv.FT_COMMUNITY_PROFILE_ICON_SHA256, /^[a-f0-9]{64}$/u);
      assert.match(receivedEnv.FT_COMMUNITY_PROFILE_BANNER_SHA256, /^[a-f0-9]{64}$/u);
      assert.match(receivedEnv.FT_COMMUNITY_PROFILE_SPLASH_SHA256, /^[a-f0-9]{64}$/u);
      assert.ok(Buffer.byteLength(receivedEnv.FIMA_OWNER_PROOF_SECRET, "utf8") >= 32);
      assert.ok(Buffer.byteLength(receivedEnv.PARADISE_PRODUCTION_REBUILD_PLAN_SECRET, "utf8") >= 32);
      assert.notEqual(receivedEnv.FIMA_OWNER_PROOF_SECRET, receivedEnv.PARADISE_PRODUCTION_REBUILD_PLAN_SECRET);
      assert.equal(receivedEnv.PARADISE_REHEARSAL_EVIDENCE_SECRET, SECRET);
    }
  }
});

test("one-shot CLI preserves completed mutation state when client cleanup fails", async () => {
  const token = "cleanup-test-token-must-never-be-serialized";
  let output = "";
  const { client: baseClient } = clientFixture();
  const client = {
    ...baseClient,
    login: async value => { assert.equal(value, token); },
    destroy: async () => { throw new Error("synthetic close failure"); }
  };
  const result = await runFtCommunityProductionCli({
    env: environment({ DISCORD_BOT_TOKEN: token }),
    argv: CLI_ARGS,
    stdout: { write: value => { output += value; } },
    createClient: () => client,
    orchestrate: async () => ({
      schemaVersion: 1,
      ok: true,
      code: "ft_community_production_completed",
      targetVerified: true,
      planOutcome: "completed",
      unsafeDependencyDetail: token
    })
  });
  assert.deepEqual(result, {
    schemaVersion: 1,
    ok: false,
    code: "ft_community_discord_client_close_failed",
    phase: "client_close",
    targetVerified: true,
    planOutcome: "completed"
  });
  assert.equal(output.includes(token), false);
  assert.equal(Object.hasOwn(result, "unsafeDependencyDetail"), false);
});

test("one-shot CLI requires an exact external target and typed confirmation before login", async () => {
  assert.equal(inspectFtCommunityProductionCliArming(CLI_ARGS).ready, true);
  for (const argv of [
    [],
    ["--target-guild", "000000000000000000", "--confirm", FT_COMMUNITY_PRODUCTION_CLI_CONFIRMATION],
    ["--target-guild", GUILD_ID, "--confirm", "APPLY ANOTHER SERVER"],
    [...CLI_ARGS, "--extra"]
  ]) {
    let clientCreated = false;
    let output = "";
    const result = await runFtCommunityProductionCli({
      env: environment({ DISCORD_BOT_TOKEN: "arming-test-token-must-never-be-serialized" }),
      argv,
      stdout: { write: value => { output += value; } },
      createClient: () => { clientCreated = true; throw new Error("must not create client"); }
    });
    assert.equal(result.code, "ft_community_production_cli_target_confirmation_required");
    assert.equal(result.phase, "target_confirmation");
    assert.equal(result.planOutcome, "not_consumed");
    assert.equal(clientCreated, false);
    assert.equal(output.includes("arming-test-token"), false);
  }
});

test("one-shot CLI waits for ClientReady and fails closed on a ready timeout", async () => {
  const token = "ready-test-token-must-never-be-serialized";
  const readyClient = new EventEmitter();
  let ready = false;
  let orchestrated = false;
  Object.assign(readyClient, {
    isReady: () => ready,
    application: { id: APPLICATION_ID },
    user: { id: APPLICATION_ID },
    guilds: clientFixture().client.guilds,
    login: async () => {
      setImmediate(() => {
        ready = true;
        readyClient.emit("clientReady", readyClient);
      });
    },
    destroy: async () => {}
  });
  const success = await runFtCommunityProductionCli({
    env: environment({ DISCORD_BOT_TOKEN: token }),
    argv: CLI_ARGS,
    stdout: { write: () => {} },
    createClient: () => readyClient,
    clientReadyTimeoutMs: 50,
    orchestrate: async () => {
      orchestrated = true;
      return { schemaVersion: 1, ok: true, code: "ok" };
    }
  });
  assert.equal(success.ok, true);
  assert.equal(orchestrated, true);

  const stalledClient = new EventEmitter();
  Object.assign(stalledClient, {
    isReady: () => false,
    login: async () => {},
    destroy: async () => {}
  });
  let output = "";
  orchestrated = false;
  const blocked = await runFtCommunityProductionCli({
    env: environment({ DISCORD_BOT_TOKEN: token }),
    argv: CLI_ARGS,
    stdout: { write: value => { output += value; } },
    createClient: () => stalledClient,
    clientReadyTimeoutMs: 5,
    orchestrate: async () => {
      orchestrated = true;
      return { schemaVersion: 1, ok: true, code: "ok" };
    }
  });
  assert.equal(blocked.code, "ft_community_discord_ready_timeout");
  assert.equal(blocked.planOutcome, "not_consumed");
  assert.equal(orchestrated, false);
  assert.equal(output.includes(token), false);
});

test("one-shot CLI fails closed when the existing rehearsal secret is unavailable", async () => {
  const token = "missing-rehearsal-token-must-never-be-serialized";
  let destroyed = 0;
  let orchestrated = false;
  let output = "";
  const { client: baseClient } = clientFixture();
  const client = {
    ...baseClient,
    login: async value => { assert.equal(value, token); },
    destroy: async () => { destroyed += 1; }
  };
  const env = environment({ DISCORD_BOT_TOKEN: token });
  delete env.PARADISE_REHEARSAL_EVIDENCE_SECRET;
  const result = await runFtCommunityProductionCli({
    env,
    argv: CLI_ARGS,
    stdout: { write: value => { output += value; } },
    createClient: () => client,
    orchestrate: async () => { orchestrated = true; }
  });
  assert.equal(result.code, "ft_community_rehearsal_evidence_secret_missing");
  assert.equal(orchestrated, false);
  assert.equal(destroyed, 1);
  assert.equal(output.includes(token), false);
});
