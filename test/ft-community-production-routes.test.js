import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");

test("FT Community production rebuild exposes separate owner-only status, preflight and execute contracts", () => {
  assert.match(serverSource, /app\.get\("\/api\/fima-bot\/actions\/rebuild-fima-community\/status", requireUser, requireParadiseOwner/);
  assert.match(serverSource, /app\.post\("\/api\/fima-bot\/actions\/rebuild-fima-community\/preflight", requireUser, requireParadiseOwner/);
  assert.match(serverSource, /app\.post\("\/api\/fima-bot\/actions\/rebuild-fima-community", requireUser, requireParadiseOwner/);
  const freshOwnerProofChecks = serverSource.match(/if \(!hasFreshOwnerActionProof\(req\)\)/g) || [];
  assert.ok(freshOwnerProofChecks.length >= 3);
  assert.match(serverSource, /mutationExecuted: false/);
});

test("production readiness route is owner-only, fresh-proof gated and returns only the names-only readiness wrapper", () => {
  const route = serverSource.match(/app\.get\("\/api\/fima-bot\/actions\/ft-community-production\/readiness",[\s\S]*?\n\}\);/)?.[0] || "";
  assert.match(route, /requireUser, requireParadiseOwner/);
  assert.match(route, /if \(!hasFreshOwnerActionProof\(req\)\)/);
  assert.match(route, /buildFtCommunityDeploymentReadiness\(\)/);
  assert.match(route, /mutationExecuted: false/);
  assert.doesNotMatch(route, /process\.env|env\(|DISCORD_BOT_TOKEN|backupDigest|planId/);
});

test("production orchestrator route requires every explicit destructive-action gate", () => {
  const route = serverSource.match(/app\.post\("\/api\/fima-bot\/actions\/ft-community-production",[\s\S]*?\n\}\);/)?.[0] || "";
  assert.match(route, /requireUser, requireParadiseOwner/);
  assert.match(route, /x-paradise-owner-action/);
  assert.match(route, /isTrustedParadiseOrigin/);
  assert.match(route, /if \(!hasFreshOwnerActionProof\(req\)\)/);
  assert.match(route, /req\.body\?\.apply !== true/);
  assert.match(route, /guildId !== FIMA_COMMUNITY_PRODUCTION_GUILD_ID \|\| guildId === PARADISE_TEST_GUILD_ID/);
  assert.match(route, /String\(req\.body\?\.confirmation \|\| ""\) !== FIMA_COMMUNITY_REBUILD_CONFIRMATION/);
  assert.match(route, /runFtCommunityProductionOrchestrator\(\)/);
  assert.match(route, /paradise_bot_not_ready/);
  assert.match(route, /mutationStatus:/);
  assert.match(route, /"possible"/);
  assert.match(route, /mutationExecuted: true/);
  assert.doesNotMatch(route, /process\.env|env\(|DISCORD_BOT_TOKEN|PARADISE_REHEARSAL_EVIDENCE_SECRET|PARADISE_PRODUCTION_REBUILD_PLAN_SECRET|backupDigest|planId/);
});

test("new production orchestrator route preserves the existing signed-plan preflight and execute routes", () => {
  assert.match(serverSource, /app\.post\("\/api\/fima-bot\/actions\/rebuild-fima-community\/preflight", requireUser, requireParadiseOwner/);
  assert.match(serverSource, /app\.post\("\/api\/fima-bot\/actions\/rebuild-fima-community", requireUser, requireParadiseOwner/);
  assert.match(serverSource, /createParadiseProductionRebuildPlan\(/);
  assert.match(serverSource, /consumeParadiseProductionRebuildPlan\(/);
});

test("deployed test-guild smoke route requires fresh owner proof but cannot record rehearsal evidence", () => {
  const route = serverSource.match(/app\.post\("\/api\/fima-bot\/actions\/run-test-smoke",[\s\S]*?\n\}\);/)?.[0] || "";
  assert.match(route, /if \(!hasFreshOwnerActionProof\(req\)\)/);
  assert.match(route, /parseParadiseTestGuildArgs\(\[/);
  assert.match(route, /"smoke"/);
  assert.match(route, /String\(req\.body\?\.confirmation \|\| ""\)/);
  assert.match(route, /guildId !== options\.guildId/);
  assert.match(route, /evidenceRecorded: false/);
  assert.doesNotMatch(route, /persistParadiseTestGuildRehearsalEvidence/);
  assert.doesNotMatch(route, /PARADISE_REHEARSAL_EVIDENCE_SECRET/);
});

test("test-guild rollback recovery route is owner-gated, origin-bound and cannot target production", () => {
  const route = serverSource.match(/app\.post\("\/api\/fima-bot\/actions\/recover-test-rollback",[\s\S]*?\n\}\);/)?.[0] || "";
  assert.match(route, /requireUser, requireParadiseOwner/);
  assert.match(route, /x-paradise-owner-action/);
  assert.match(route, /isTrustedParadiseOrigin/);
  assert.match(route, /if \(!hasFreshOwnerActionProof\(req\)\)/);
  assert.match(route, /"recover-rollback"/);
  assert.match(route, /String\(req\.body\?\.confirmation \|\| ""\)/);
  assert.match(route, /guildId !== options\.guildId \|\| guildId !== PARADISE_TEST_GUILD_ID/);
  assert.match(route, /recoverParadiseTestRollbackFromDashboard\(guildId, options\.confirmation\)/);
  assert.doesNotMatch(route, /FIMA_COMMUNITY_PRODUCTION_GUILD_ID/);
  assert.doesNotMatch(route, /DISCORD_BOT_TOKEN/);
  assert.doesNotMatch(route, /PARADISE_REHEARSAL_EVIDENCE_SECRET/);
});

test("full test-guild rehearsal route is owner-gated, test-only and signs evidence only after a successful rehearsal", () => {
  const route = serverSource.match(/app\.post\("\/api\/fima-bot\/actions\/run-test-rehearsal",[\s\S]*?\n\}\);/)?.[0] || "";
  assert.match(route, /requireUser, requireParadiseOwner/);
  assert.match(route, /if \(!hasFreshOwnerActionProof\(req\)\)/);
  assert.match(route, /"rehearsal"/);
  assert.match(route, /String\(req\.body\?\.confirmation \|\| ""\)/);
  assert.match(route, /guildId !== options\.guildId \|\| guildId !== PARADISE_TEST_GUILD_ID/);
  const executeAt = route.indexOf("rehearseParadiseTestTemplateFromDashboard");
  const persistAt = route.indexOf("persistParadiseTestGuildRehearsalEvidence");
  assert.ok(executeAt >= 0 && persistAt > executeAt);
  assert.match(route, /PARADISE_REHEARSAL_EVIDENCE_SECRET/);
  assert.match(route, /smokeRunsCompleted/);
  assert.match(route, /restoredOriginalState/);
  assert.match(route, /originalStateMutationsPlanned/);
});

test("production preflight seals its full backup in a single-use plan without exposing the envelope", () => {
  assert.match(serverSource, /guildId !== FIMA_COMMUNITY_PRODUCTION_GUILD_ID \|\| guildId === PARADISE_TEST_GUILD_ID/);
  assert.match(serverSource, /inspectFimaCommunityProductionRebuildPreflightFromDashboard\(guildId, \{\s*includeBackupEnvelope: true,/);
  assert.match(serverSource, /testGuildRehearsalEvidenceSecret: env\("PARADISE_REHEARSAL_EVIDENCE_SECRET", ""\)/);
  assert.match(serverSource, /createParadiseProductionRebuildPlan\(\{[\s\S]*?backup: preflight\.backupEnvelope,[\s\S]*?ownerUserId: req\.user\.id/);
  assert.match(serverSource, /const \{ backupEnvelope: _sealedBackup, \.\.\.publicPreflight \} = preflight;/);
  assert.match(serverSource, /preflight: publicPreflight/);
  assert.doesNotMatch(
    serverSource.match(/app\.post\("\/api\/fima-bot\/actions\/rebuild-fima-community\/preflight"[\s\S]*?\n\}\);/)?.[0] || "",
    /rebuildFimaCommunityProductionFromDashboard/
  );
});

test("production execute consumes the bound plan and passes its short-lived proof into the rebuild", () => {
  assert.match(serverSource, /const backupDigest = String\(req\.body\?\.backupDigest \|\| ""\)\.trim\(\)\.toLowerCase\(\);/);
  assert.match(serverSource, /consumeParadiseProductionRebuildPlan\(\{[\s\S]*?planId,[\s\S]*?backupDigest,[\s\S]*?ownerUserId: req\.user\.id,[\s\S]*?confirmation/);
  assert.match(serverSource, /rebuildFimaCommunityProductionFromDashboard\(mode, guildId, confirmation, \{[\s\S]*?expectedBackupDigest: backupDigest,[\s\S]*?executionProof,[\s\S]*?planId,[\s\S]*?executionProofSecret: productionRebuildPlanSecret\(\)/);
  assert.match(serverSource, /finally \{\s*if \(planConsumed\) \{\s*await finishParadiseProductionRebuildPlan\(\{/);
  assert.match(serverSource, /"production_preflight_backup_digest_required"/);
  assert.match(serverSource, /"production_preflight_backup_digest_mismatch"/);
  const executeRoute = serverSource.match(/app\.post\("\/api\/fima-bot\/actions\/rebuild-fima-community",[\s\S]*?\n\}\);/)?.[0] || "";
  assert.doesNotMatch(executeRoute, /FIMA_COMMUNITY_REBUILD_CONFIRMATION/);
});
