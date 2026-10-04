import {
  createParadiseProductionFinalizationReceipt,
  createParadiseProductionRebuildPlan,
  consumeParadiseProductionRebuildPlan,
  finishParadiseProductionRebuildPlan
} from "./paradiseProductionRebuildPlan.js";
import {
  FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
  FIMA_COMMUNITY_REBUILD_CONFIRMATION,
  finalizeFimaCommunityProductionRollback,
  inspectParadiseCanonicalTextEncoding,
  inspectFimaCommunityProductionRebuildPreflight,
  recoverFimaCommunityProductionRollback,
  rebuildFimaCommunityProduction
} from "./paradise3a59.js";
import {
  applyFtCommunityProfileSync,
  ftCommunityProfileConfigFromEnv,
  ftCommunityProfileConfirmation,
  inspectFtCommunityProfileSync
} from "./ftCommunityProfileSync.js";
import {
  applyFimaBotProfileSync,
  FIMA_BOT_PROFILE_CONFIRMATION,
  fimaBotProfileConfigFromEnv,
  inspectFimaBotProfileSync
} from "./fimaBotProfileSync.js";
import {
  paradiseBackupStateDigest,
  validateParadiseBackupEnvelope
} from "./paradiseBackupIntegrity.js";
import { assertFtCommunityReleaseAttestation } from "./ftCommunityReleaseAttestation.js";
import { buildFtCommunityDeploymentReadiness } from "./ftCommunityDeploymentReadiness.js";
import { inspectFtCommunityVisualAssetReadiness } from "./ftCommunityVisualAssets.js";

export const FT_COMMUNITY_PRODUCTION_ORCHESTRATOR_SCHEMA_VERSION = 1;

const DEFAULT_DEPENDENCIES = Object.freeze({
  inspectDeploymentReadiness: buildFtCommunityDeploymentReadiness,
  inspectCanonicalTextEncoding: inspectParadiseCanonicalTextEncoding,
  inspectVisualAssets: inspectFtCommunityVisualAssetReadiness,
  inspectPreflight: inspectFimaCommunityProductionRebuildPreflight,
  inspectPostAudit: inspectFimaCommunityProductionRebuildPreflight,
  createPlan: createParadiseProductionRebuildPlan,
  consumePlan: consumeParadiseProductionRebuildPlan,
  finishPlan: finishParadiseProductionRebuildPlan,
  createFinalizationReceipt: createParadiseProductionFinalizationReceipt,
  rebuild: rebuildFimaCommunityProduction,
  recoverRollback: recoverFimaCommunityProductionRollback,
  finalizeRollback: finalizeFimaCommunityProductionRollback,
  inspectCommunityProfile: inspectFtCommunityProfileSync,
  applyCommunityProfile: applyFtCommunityProfileSync,
  inspectBotProfile: inspectFimaBotProfileSync,
  applyBotProfile: applyFimaBotProfileSync
});

const SAFE_PHASE_CODES = Object.freeze({
  deployment_readiness: new Set(["ft_community_deployment_not_ready", "production_destructive_rebuild_disabled"]),
  release_attestation: new Set([
    "ft_community_release_attestation_missing",
    "ft_community_release_attestation_mismatch"
  ]),
  target_validation: new Set([
    "ft_community_required_runtime_binding_missing",
    "ft_community_client_not_ready",
    "ft_community_wrong_production_guild",
    "ft_community_production_guild_not_cached",
    "ft_community_live_owner_binding_mismatch",
    "ft_community_live_application_binding_mismatch",
    "ft_community_runtime_scope_binding_mismatch"
  ]),
  canonical_text_encoding: new Set(["ft_community_canonical_text_encoding_invalid"]),
  visual_assets: new Set(["ft_community_visual_assets_not_ready"]),
  preflight: new Set([
    "production_rebuild_preflight_blocked",
    "production_rebuild_preflight_mutation_detected",
    "production_rebuild_plan_backup_invalid",
    "production_rebuild_plan_backup_target_mismatch",
    "production_rebuild_plan_backup_readback_failed",
    "production_rebuild_rehearsal_pair_invalid",
    "production_rebuild_preflight_stale",
    "unresolved_rollback_marker",
    "foreign_active_mutation_lease"
  ]),
  plan_create: new Set([
    "production_rebuild_plan_readback_failed",
    "production_rebuild_rehearsal_pair_invalid",
    "production_rebuild_preflight_stale"
  ]),
  plan_consume: new Set([
    "production_rebuild_plan_already_used",
    "production_rebuild_plan_expired",
    "production_rebuild_plan_invalid",
    "production_rebuild_plan_scope_mismatch"
  ]),
  rebuild: new Set([
    "ft_community_live_rebuild_not_verified",
    "ft_community_live_structure_drift",
    "ft_community_live_reconciliation_drift",
    "ft_community_live_rollback_required",
    "ft_community_live_role_icons_not_verified",
    "ft_community_live_automod_not_verified",
    "ft_community_live_guides_not_verified",
    "ft_community_live_staff_team_not_verified",
    "ft_community_live_evidence_not_verified"
  ]),
  post_audit: new Set(["ft_community_post_audit_not_verified"]),
  community_profile_inspect: new Set(["guild_profile_sync_scope_not_ready"]),
  community_profile_apply: new Set(["guild_profile_sync_result_invalid"]),
  bot_profile_inspect: new Set(["profile_sync_scope_not_ready"]),
  bot_profile_apply: new Set(["profile_sync_result_invalid"]),
  plan_finish: new Set(["production_rebuild_plan_finish_failed"]),
  finalization_receipt: new Set([
    "production_finalization_receipt_plan_not_completed",
    "production_finalization_receipt_scope_invalid",
    "production_finalization_receipt_verification_incomplete",
    "production_finalization_receipt_write_failed",
    "production_finalization_receipt_index_write_failed",
    "production_finalization_receipt_index_readback_failed",
    "production_finalization_receipt_index_collision"
  ])
});

function clean(value) {
  return String(value ?? "").trim();
}

function failure(code) {
  return Object.assign(new Error(code), { code });
}

function safeDependencyCode(error, phase) {
  const code = clean(error?.code);
  if (/^[a-z0-9_]{1,96}$/u.test(code) && SAFE_PHASE_CODES[phase]?.has(code)) {
    return code;
  }
  return `ft_community_${phase}_failed`;
}

function exactGuildId(value) {
  return clean(value?.id || value);
}

function assertClientScope(client, guild) {
  if (client?.isReady?.() !== true) throw failure("ft_community_client_not_ready");
  if (exactGuildId(guild) !== FIMA_COMMUNITY_PRODUCTION_GUILD_ID) {
    throw failure("ft_community_wrong_production_guild");
  }
  if (exactGuildId(client?.guilds?.cache?.get?.(FIMA_COMMUNITY_PRODUCTION_GUILD_ID))
      !== FIMA_COMMUNITY_PRODUCTION_GUILD_ID) {
    throw failure("ft_community_production_guild_not_cached");
  }
}

function assertLiveRuntimeBindings(client, guild, env) {
  const ownerId = exactGuildId(guild?.ownerId);
  const configuredOwnerId = clean(env?.FIMA_OWNER_DISCORD_ID);
  if (!ownerId || ownerId !== configuredOwnerId) {
    throw failure("ft_community_live_owner_binding_mismatch");
  }
  const applicationId = exactGuildId(client?.application?.id || client?.user?.id);
  if (!applicationId
      || (client?.application?.id && client?.user?.id
        && exactGuildId(client.application.id) !== exactGuildId(client.user.id))
      || clean(env?.DISCORD_CLIENT_ID) !== applicationId
      || clean(env?.FIMA_BOT_EXPECTED_APPLICATION_ID) !== applicationId) {
    throw failure("ft_community_live_application_binding_mismatch");
  }
  if (clean(env?.FIEELS_COMMUNITY_GUILD_ID) !== FIMA_COMMUNITY_PRODUCTION_GUILD_ID
      || clean(env?.DISCORD_GUILD_ID) !== FIMA_COMMUNITY_PRODUCTION_GUILD_ID
      || clean(env?.FT_COMMUNITY_PROFILE_GUILD_ID) !== FIMA_COMMUNITY_PRODUCTION_GUILD_ID
      || clean(env?.FT_COMMUNITY_PROFILE_OWNER_USER_ID) !== ownerId
      || clean(env?.FIMA_BOT_PROFILE_OWNER_USER_ID) !== ownerId) {
    throw failure("ft_community_runtime_scope_binding_mismatch");
  }
}

function assertBackup(preflight) {
  if (preflight?.ready !== true) {
    throw failure(clean(preflight?.code) || "production_rebuild_preflight_blocked");
  }
  if (preflight?.mutationCount !== 0) throw failure("production_rebuild_preflight_mutation_detected");
  const backup = preflight?.backupEnvelope;
  const validation = validateParadiseBackupEnvelope(backup);
  if (!validation.valid) throw failure("production_rebuild_plan_backup_invalid");
  if (exactGuildId(backup?.guildId || backup?.guild?.id) !== FIMA_COMMUNITY_PRODUCTION_GUILD_ID) {
    throw failure("production_rebuild_plan_backup_target_mismatch");
  }
  const stateDigest = paradiseBackupStateDigest(backup);
  if (clean(preflight?.backup?.digest).toLowerCase() !== stateDigest.toLowerCase()
      || clean(preflight?.backup?.artifactDigest).toLowerCase()
        !== clean(backup?.integrity?.digest).toLowerCase()) {
    throw failure("production_rebuild_plan_backup_readback_failed");
  }
  return backup;
}

function assertVerifiedRebuild(result) {
  if (result?.status !== "LIVE DISCORD VERIFIED") {
    throw failure("ft_community_live_rebuild_not_verified");
  }
  if (result?.structureVerification?.ready !== true) {
    throw failure("ft_community_live_structure_drift");
  }
  if (result?.reconciliation?.canRestore !== true
      || result?.reconciliation?.mutationsPlanned !== 0) {
    throw failure("ft_community_live_reconciliation_drift");
  }
  if (result?.rollback?.required !== true
      || !/^[a-z0-9_-]{8,128}$/iu.test(clean(result?.rollback?.markerId))
      || result?.rollback?.markerStatus !== "rollback_required"
      || result?.rollback?.pendingFinalization !== true) {
    throw failure("ft_community_live_rollback_required");
  }
  if (result?.roleIcons?.status !== "verified"
      || result?.roleIcons?.readiness?.ready !== true) {
    throw failure("ft_community_live_role_icons_not_verified");
  }
  if (result?.autoMod?.status !== "configured"
      || !Array.isArray(result?.autoMod?.errors)
      || result.autoMod.errors.length !== 0) {
    throw failure("ft_community_live_automod_not_verified");
  }
  if (result?.guideReadiness?.ready !== true) {
    throw failure("ft_community_live_guides_not_verified");
  }
  if (result?.staffTeam?.verified !== true) {
    throw failure("ft_community_live_staff_team_not_verified");
  }
  if (result?.communityLiveEvidence?.ready !== true) {
    throw failure("ft_community_live_evidence_not_verified");
  }
}

function assertPostAudit(postAudit, preflightCheckedAt, nowMs) {
  const checkedAtMs = Date.parse(clean(postAudit?.checkedAt));
  const preflightAtMs = Date.parse(clean(preflightCheckedAt));
  if (postAudit?.ready !== true
      || postAudit?.mutationCount !== 0
      || !Number.isFinite(checkedAtMs)
      || !Number.isFinite(preflightAtMs)
      || checkedAtMs < preflightAtMs
      || checkedAtMs > nowMs
      || nowMs - checkedAtMs > 60_000) {
    throw failure("ft_community_post_audit_not_verified");
  }
  assertBackup(postAudit);
}

function assertProfileInspection(status, code) {
  if (status?.applyEnabled !== true || status?.scopeReady !== true) throw failure(code);
}

function assertProfileApply(result, code) {
  if (result?.dryRun !== false
      || typeof result?.applied !== "boolean"
      || !Array.isArray(result?.changes)
      || result.applied !== (result.changes.length > 0)
      || result?.readback?.ready !== true
      || result?.readback?.fresh !== true) {
    throw failure(code);
  }
}

function safeSuccessSummary({ rebuild, postAudit, communityProfile, botProfile }) {
  return Object.freeze({
    schemaVersion: FT_COMMUNITY_PRODUCTION_ORCHESTRATOR_SCHEMA_VERSION,
    ok: true,
    code: "ft_community_production_completed",
    targetVerified: true,
    liveDiscordVerified: rebuild.status === "LIVE DISCORD VERIFIED",
    structureVerified: rebuild.structureVerification.ready === true,
    reconciliationVerified: rebuild.reconciliation.canRestore === true
      && rebuild.reconciliation.mutationsPlanned === 0,
    postAuditVerified: postAudit.ready === true && postAudit.mutationCount === 0,
    communityProfileReadbackVerified: communityProfile?.readback?.ready === true
      && communityProfile?.readback?.fresh === true,
    botProfileReadbackVerified: botProfile?.readback?.ready === true
      && botProfile?.readback?.fresh === true,
    communityProfileChanges: Array.isArray(communityProfile?.changes)
      ? communityProfile.changes.length
      : 0,
    botProfileChanges: Array.isArray(botProfile?.changes) ? botProfile.changes.length : 0,
    rollbackFinalized: true,
    planOutcome: "completed"
  });
}

/**
 * Executes the already owner-approved FT Community production operation.
 * The public result deliberately excludes tokens, secrets, plan IDs, backup
 * contents, hashes, URLs and raw dependency errors.
 */
export async function runFtCommunityProductionOrchestrator({
  client,
  env = process.env,
  planRoot,
  dependencies = {},
  now = () => Date.now()
} = {}) {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const ownerUserId = clean(env?.FIMA_OWNER_DISCORD_ID);
  const planSecret = clean(env?.PARADISE_PRODUCTION_REBUILD_PLAN_SECRET);
  const rehearsalSecret = clean(env?.PARADISE_REHEARSAL_EVIDENCE_SECRET);
  let phase = "deployment_readiness";
  let plan = null;
  let consumed = false;
  let planFinished = false;
  let targetValidated = false;
  let guild = null;
  let executionProof = null;
  let rebuild = null;
  let postAudit = null;
  let botProfileRemediationRequired = false;

  try {
    phase = "deployment_readiness";
    // Stop before creating/consuming a plan or attempting rollback. The legacy
    // production rebuild cannot satisfy the ID-preserving migration contract.
    if (deps.rebuild === rebuildFimaCommunityProduction) {
      throw failure("production_destructive_rebuild_disabled");
    }
    const deploymentReadiness = deps.inspectDeploymentReadiness(env);
    if (deploymentReadiness?.ready !== true) {
      throw failure("ft_community_deployment_not_ready");
    }
    phase = "release_attestation";
    assertFtCommunityReleaseAttestation(env);
    phase = "target_validation";
    if (!ownerUserId || !planSecret || !rehearsalSecret) {
      throw failure("ft_community_required_runtime_binding_missing");
    }
    phase = "canonical_text_encoding";
    const canonicalTextEncoding = deps.inspectCanonicalTextEncoding("community");
    if (canonicalTextEncoding?.ready !== true
        || canonicalTextEncoding?.code !== "canonical_text_encoding_verified") {
      throw failure("ft_community_canonical_text_encoding_invalid");
    }
    phase = "visual_assets";
    const visualAssets = await deps.inspectVisualAssets();
    if (visualAssets?.ready !== true
        || visualAssets?.code !== "ft_community_visual_assets_ready") {
      throw failure("ft_community_visual_assets_not_ready");
    }
    phase = "target_validation";
    guild = await client?.guilds?.fetch?.(FIMA_COMMUNITY_PRODUCTION_GUILD_ID);
    assertClientScope(client, guild);
    assertLiveRuntimeBindings(client, guild, env);
    targetValidated = true;

    phase = "preflight";
    const preflight = await deps.inspectPreflight(guild, {
      deploymentEnvironment: env,
      testGuildRehearsalEvidenceSecret: rehearsalSecret,
      includeBackupEnvelope: true
    });
    const backup = assertBackup(preflight);

    phase = "plan_create";
    plan = await deps.createPlan({
      guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
      expectedGuildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
      mode: "community",
      backup,
      ownerUserId,
      secret: planSecret,
      preflight,
      planRoot,
      nowMs: now()
    });
    if (plan?.state !== "ready" || !plan?.planId || !plan?.backup?.digest
        || !plan?.requiredConfirmation) {
      throw failure("production_rebuild_plan_readback_failed");
    }

    phase = "plan_consume";
    executionProof = await deps.consumePlan({
      planId: plan.planId,
      guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
      mode: "community",
      backupDigest: plan.backup.digest,
      ownerUserId,
      confirmation: plan.requiredConfirmation,
      secret: planSecret,
      planRoot,
      nowMs: now()
    });
    consumed = true;

    phase = "rebuild";
    rebuild = await deps.rebuild(
      guild,
      "community",
      FIMA_COMMUNITY_REBUILD_CONFIRMATION,
      {
        expectedBackupDigest: plan.backup.digest,
        executionProof,
        planId: plan.planId,
        executionProofSecret: planSecret,
        testGuildRehearsalEvidenceSecret: rehearsalSecret
      }
    );
    assertVerifiedRebuild(rebuild);

    phase = "post_audit";
    postAudit = await deps.inspectPostAudit(guild, {
      deploymentEnvironment: env,
      testGuildRehearsalEvidenceSecret: rehearsalSecret,
      includeBackupEnvelope: true
    });
    assertPostAudit(postAudit, preflight.checkedAt, now());

    const profileAuthorization = Object.freeze({
      ownerVerified: true,
      actorUserId: ownerUserId,
      confirmation: ftCommunityProfileConfirmation(FIMA_COMMUNITY_PRODUCTION_GUILD_ID)
    });
    phase = "community_profile_inspect";
    const communityStatus = await deps.inspectCommunityProfile(client, {
      config: ftCommunityProfileConfigFromEnv(env)
    });
    assertProfileInspection(communityStatus, "guild_profile_sync_scope_not_ready");
    phase = "community_profile_apply";
    const communityProfile = await deps.applyCommunityProfile(client, {
      authorization: profileAuthorization,
      config: ftCommunityProfileConfigFromEnv(env),
      dryRun: false
    });
    assertProfileApply(communityProfile, "guild_profile_sync_result_invalid");

    phase = "bot_profile_inspect";
    const botStatus = await deps.inspectBotProfile(client, {
      config: fimaBotProfileConfigFromEnv(env)
    });
    assertProfileInspection(botStatus, "profile_sync_scope_not_ready");
    phase = "bot_profile_apply";
    let botProfile;
    try {
      botProfile = await deps.applyBotProfile(client, {
        authorization: Object.freeze({
          ownerVerified: true,
          actorUserId: ownerUserId,
          confirmation: FIMA_BOT_PROFILE_CONFIRMATION
        }),
        config: fimaBotProfileConfigFromEnv(env),
        dryRun: false
      });
      assertProfileApply(botProfile, "profile_sync_result_invalid");
    } catch (error) {
      // Bot username/avatar/banner are global Discord identity fields and are
      // not restored by the guild backup. Once the apply call starts, any
      // failure is conservatively treated as a possibly partial mutation.
      botProfileRemediationRequired = true;
      throw error;
    }

    phase = "plan_finish";
    const finished = await deps.finishPlan({
      planId: plan.planId,
      outcome: "completed",
      secret: planSecret,
      planRoot,
      nowMs: now()
    });
    if (finished?.state !== "completed") throw failure("production_rebuild_plan_finish_failed");
    planFinished = true;

    phase = "finalization_receipt";
    const receipt = await deps.createFinalizationReceipt({
      planId: plan.planId,
      guildId: FIMA_COMMUNITY_PRODUCTION_GUILD_ID,
      mode: "community",
      markerId: rebuild.rollback.markerId,
      backupDigest: plan.backup.digest,
      postAuditVerified: postAudit?.ready === true && postAudit?.mutationCount === 0,
      communityProfileReadbackVerified: communityProfile?.readback?.ready === true
        && communityProfile?.readback?.fresh === true,
      botProfileReadbackVerified: botProfile?.readback?.ready === true
        && botProfile?.readback?.fresh === true,
      secret: planSecret,
      planRoot,
      nowMs: now()
    });
    if (!receipt?.receiptId || receipt?.outcome !== "completed") {
      throw failure("production_finalization_receipt_write_failed");
    }

    phase = "rollback_finalize";
    const finalized = await deps.finalizeRollback(guild, {
      markerId: rebuild.rollback.markerId,
      expectedBackupDigest: plan.backup.digest,
      executionProof,
      executionProofSecret: planSecret,
      planId: plan.planId,
      nowMs: now()
    });
    if (finalized?.status !== "ok" || finalized?.rollbackFinalized !== true) {
      throw failure("ft_community_rollback_finalization_failed");
    }

    return safeSuccessSummary({ rebuild, postAudit, communityProfile, botProfile });
  } catch (error) {
    if (planFinished && phase === "finalization_receipt") {
      return Object.freeze({
        schemaVersion: FT_COMMUNITY_PRODUCTION_ORCHESTRATOR_SCHEMA_VERSION,
        ok: false,
        code: "ft_community_finalization_receipt_blocked",
        phase: "finalization_receipt",
        targetVerified: true,
        planOutcome: "completed",
        structurePreserved: true,
        retryable: false,
        rollbackRequired: true
      });
    }
    if (planFinished && phase === "rollback_finalize") {
      return Object.freeze({
        schemaVersion: FT_COMMUNITY_PRODUCTION_ORCHESTRATOR_SCHEMA_VERSION,
        ok: false,
        code: "ft_community_rollback_finalization_pending",
        phase: "rollback_finalize",
        targetVerified: true,
        planOutcome: "completed",
        structurePreserved: true,
        retryable: true,
        rollbackRequired: true
      });
    }

    if (consumed && plan?.planId && !planFinished) {
      let recovered = false;
      try {
        const recovery = await deps.recoverRollback(guild, {
          executionProof,
          executionProofSecret: planSecret,
          planId: plan.planId,
          nowMs: now()
        });
        recovered = recovery?.status === "ok"
          && recovery?.rollbackRecovered === true
          && recovery?.reconciliationCanRestore === true
          && recovery?.reconciliationMutationsPlanned === 0;
      } catch {
        // The consumed plan and unresolved recovery state must remain an
        // explicit operational blocker. Raw recovery errors are never public.
      }
      if (!recovered) {
        return Object.freeze({
          schemaVersion: FT_COMMUNITY_PRODUCTION_ORCHESTRATOR_SCHEMA_VERSION,
          ok: false,
          code: "ft_community_rollback_recovery_blocked",
          phase: "rollback_recovery",
          targetVerified: targetValidated,
          planOutcome: "executing_blocked",
          rollbackRequired: true,
          botProfileRemediationRequired
        });
      }
      try {
        const failed = await deps.finishPlan({
          planId: plan.planId,
          outcome: "failed",
          secret: planSecret,
          planRoot,
          nowMs: now()
        });
        planFinished = failed?.state === "failed";
      } catch {
        // A recovered structure with an executing plan remains fail-closed.
      }
      if (!planFinished) {
        return Object.freeze({
          schemaVersion: FT_COMMUNITY_PRODUCTION_ORCHESTRATOR_SCHEMA_VERSION,
          ok: false,
          code: "ft_community_recovered_plan_finish_blocked",
          phase: "plan_finish_failed",
          targetVerified: targetValidated,
          planOutcome: "executing_blocked",
          rollbackRequired: botProfileRemediationRequired,
          botProfileRemediationRequired
        });
      }
      if (botProfileRemediationRequired) {
        return Object.freeze({
          schemaVersion: FT_COMMUNITY_PRODUCTION_ORCHESTRATOR_SCHEMA_VERSION,
          ok: false,
          code: "ft_community_bot_profile_remediation_required",
          phase: "bot_profile_remediation",
          targetVerified: targetValidated,
          planOutcome: "failed",
          structurePreserved: true,
          guildRollbackRecovered: true,
          botProfileRemediationRequired: true,
          rollbackRequired: true
        });
      }
    }
    return Object.freeze({
      schemaVersion: FT_COMMUNITY_PRODUCTION_ORCHESTRATOR_SCHEMA_VERSION,
      ok: false,
      code: safeDependencyCode(error, phase),
      phase,
      targetVerified: targetValidated,
      planOutcome: consumed ? (planFinished ? "failed" : "executing_blocked") : "not_consumed"
    });
  }
}
