import { Client, GatewayIntentBits } from "discord.js";
import { PARADISE_TEST_GUILD_ID } from "./runtimeEnvironment.js";
import {
  createParadiseRehearsalEvidence,
  PARADISE_REHEARSAL_EVIDENCE_DEFAULT_PATH,
  persistParadiseRehearsalEvidence
} from "./paradiseRehearsalEvidence.js";
import { createVerifiedFtCommunityReleaseBinding } from "./ftCommunityReleaseAttestation.js";

export const PARADISE_TEST_GUILD_ACTIONS = Object.freeze({
  preflight: Object.freeze({ mutating: false, confirmation: null }),
  status: Object.freeze({ mutating: false, confirmation: null }),
  apply: Object.freeze({ mutating: true, confirmation: "APPLY TEST COMMUNITY" }),
  smoke: Object.freeze({ mutating: true, confirmation: "SMOKE TEST COMMUNITY" }),
  rehearsal: Object.freeze({ mutating: true, confirmation: "REHEARSE TEST COMMUNITY" }),
  "recover-rollback": Object.freeze({ mutating: true, confirmation: "RECOVER TEST COMMUNITY ROLLBACK" }),
  rebuild: Object.freeze({ mutating: true, confirmation: "REBUILD TEST COMMUNITY" })
});

function runnerError(code, details = {}) {
  return Object.assign(new Error(code), { code, ...details });
}

function normalizedConfirmation(value) {
  return String(value || "").trim();
}

const SAFE_SHORT_CODE_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const SAFE_REVISION_PATTERN = /^3a[0-9]{2,4}-[a-z0-9][a-z0-9._-]{0,91}$/;
const SAFE_MODES = new Set(["community", "clan", "tsbtr"]);
const SAFE_STATUSES = new Set(["LIVE DISCORD VERIFIED", "LIVE DISCORD FAILED", "ok"]);
const DISCORD_SNOWFLAKE_PATTERN = /(?:^|[^0-9])[0-9]{17,20}(?:$|[^0-9])/;
const SAFE_SHA256_DIGEST_PATTERN = /^[a-f0-9]{64}$/;

function containsDiscordSnowflake(value) {
  return DISCORD_SNOWFLAKE_PATTERN.test(String(value || ""));
}

function safeShortCode(value, fallback = null) {
  const candidate = String(value || "").trim();
  return SAFE_SHORT_CODE_PATTERN.test(candidate) && !containsDiscordSnowflake(candidate)
    ? candidate
    : fallback;
}

function safeRevision(value) {
  const candidate = String(value || "").trim();
  return SAFE_REVISION_PATTERN.test(candidate) && !containsDiscordSnowflake(candidate)
    ? candidate
    : null;
}

function safeMode(value, fallback = null) {
  const candidate = String(value || "").trim();
  return SAFE_MODES.has(candidate) ? candidate : fallback;
}

function safeStatus(value) {
  const candidate = String(value || "").trim();
  return SAFE_STATUSES.has(candidate) ? candidate : null;
}

function safeIsoTimestamp(value) {
  const candidate = String(value || "").trim();
  const timestamp = Date.parse(candidate);
  return candidate && Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function safeCount(value) {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate > 0
    ? Math.min(Math.floor(candidate), Number.MAX_SAFE_INTEGER)
    : 0;
}

function safeSha256Digest(value) {
  const candidate = String(value || "").trim();
  return SAFE_SHA256_DIGEST_PATTERN.test(candidate) ? candidate : null;
}

export function parseParadiseTestGuildArgs(argv = []) {
  const args = [...argv];
  const action = String(args.shift() || "preflight").trim().toLowerCase();
  const policy = PARADISE_TEST_GUILD_ACTIONS[action];
  if (!policy) throw runnerError("invalid_test_guild_action", { action });

  let confirmation = null;
  while (args.length) {
    const flag = args.shift();
    if (flag !== "--confirm" || confirmation !== null || !args.length) {
      throw runnerError("invalid_test_guild_argument", { argument: String(flag || "") });
    }
    confirmation = String(args.shift() || "");
  }

  if (!policy.mutating && confirmation !== null) {
    throw runnerError("confirmation_not_allowed_for_read_only_action");
  }
  if (policy.mutating && normalizedConfirmation(confirmation) !== policy.confirmation) {
    throw runnerError("typed_confirmation_mismatch", { expectedConfirmation: policy.confirmation });
  }

  return Object.freeze({
    action,
    guildId: PARADISE_TEST_GUILD_ID,
    mode: "community",
    confirmation: policy.confirmation,
    mutating: policy.mutating
  });
}

export function summarizeParadiseTestGuildResult(action, result = {}) {
  if (action === "preflight") {
    return {
      action,
      ready: result.ready === true,
      code: safeShortCode(result.code, "unknown"),
      mutationCount: safeCount(result.mutationCount),
      checks: Array.isArray(result.checks)
        ? result.checks.map(check => ({
            id: safeShortCode(check?.id),
            ok: check?.ok === true,
            code: safeShortCode(check?.code)
          }))
        : [],
      blockers: Array.isArray(result.blockers)
        ? result.blockers.map(blocker => ({
            check: safeShortCode(blocker?.check),
            code: safeShortCode(blocker?.code)
          }))
        : []
    };
  }
  if (action === "status") {
    return {
      action,
      completed: result.completed === true,
      communityReady: result.communityReady === true,
      revision: safeRevision(result.revision),
      completedAt: safeIsoTimestamp(result.completedAt),
      lastError: safeShortCode(result.lastError),
      structureVerificationAvailable: result.structureVerificationAvailable === true,
      structureReady: result.structureReady === true,
      structureMismatchCount: safeCount(result.structureMismatchCount),
      roleIconReady: result.roleIconReady === true,
      roleIconMismatchCount: safeCount(result.roleIconMismatchCount),
      roleIconBlockerCount: safeCount(result.roleIconBlockerCount),
      smokeEvidenceReady: result.smokeEvidenceReady === true,
      smokeEvidenceMissingCount: safeCount(result.smokeEvidenceMissingCount),
      liveEvidenceAvailable: result.liveEvidenceAvailable === true,
      liveEvidenceVerifiedCount: safeCount(result.liveEvidenceVerifiedCount),
      liveEvidenceRequiredCount: safeCount(result.liveEvidenceRequiredCount),
      leaderboardBoardCount: safeCount(result.leaderboardBoardCount),
      leaderboardReady: result.leaderboardReady === true,
      welcomeLeaveReady: result.welcomeLeaveReady === true,
      staffTeamReady: result.staffTeamReady === true,
      helpGuideReady: result.helpGuideReady === true,
      applicationPanelReady: result.applicationPanelReady === true,
      supportPanelReady: result.supportPanelReady === true,
      supportTicketReady: result.supportTicketReady === true,
      supportTicketTranscriptReady: result.supportTicketTranscriptReady === true,
      supportTicketReopenReady: result.supportTicketReopenReady === true,
      moderationPanelReady: result.moderationPanelReady === true,
      securityPanelReady: result.securityPanelReady === true,
      textActivityReady: result.textActivityReady === true,
      voiceActivityReady: result.voiceActivityReady === true,
      activityRewardsPanelReady: result.activityRewardsPanelReady === true,
      rewardPolicyReady: result.rewardPolicyReady === true,
      activityWorkerReady: result.activityWorkerReady === true,
      activityDatabaseReady: result.activityDatabaseReady === true,
      blacklistedRoleReady: result.blacklistedRoleReady === true,
      blacklistPermissionReady: result.blacklistPermissionReady === true
    };
  }
  const summary = {
    action: Object.hasOwn(PARADISE_TEST_GUILD_ACTIONS, action) ? action : null,
    status: safeStatus(result.status),
    completedAt: safeIsoTimestamp(result.completedAt),
    mode: safeMode(result.mode, "community"),
    createdChannels: safeCount(result.createdChannels),
    createdRoles: safeCount(result.createdRoles),
    mappedChannelCount: safeCount(result.mappedChannelCount),
    guidePosts: safeCount(result.guidePosts),
    leaderboardBoardCount: safeCount(result.leaderboardBoardCount || result.leaderboardBoards?.length),
    staffTeamReady: Boolean(result.staffTeamReady || result.staffTeam),
    structureReady: result.structureVerification?.ready === true
  };
  if (action === "rehearsal") {
    return {
      ...summary,
      smokeRunsCompleted: safeCount(result.smokeRunsCompleted),
      fullSmokeRunsVerified: result.fullSmokeRunsVerified === true,
      initialBackupVerified: result.initialBackupVerified === true,
      persistedBackupVerified: result.persistedBackupVerified === true,
      backupAlgorithm: result.backupAlgorithm === "sha256" ? "sha256" : null,
      backupArtifactDigest: safeSha256Digest(result.backupArtifactDigest),
      backupStateDigest: safeSha256Digest(result.backupStateDigest),
      persistedBackupArtifactDigest: safeSha256Digest(result.persistedBackupArtifactDigest),
      persistedBackupStateDigest: safeSha256Digest(result.persistedBackupStateDigest),
      restoredOriginalState: result.restoredOriginalState === true,
      originalStateCanRestore: result.originalStateCanRestore === true,
      originalStateMutationsPlanned: safeCount(result.originalStateMutationsPlanned)
    };
  }
  if (action === "recover-rollback") {
    return {
      ...summary,
      rollbackRecovered: result.rollbackRecovered === true,
      reconciliationCanRestore: result.reconciliationCanRestore === true,
      reconciliationMutationsPlanned: safeCount(result.reconciliationMutationsPlanned)
    };
  }
  return summary;
}

export async function executeParadiseTestGuildAction(options, dependencies = {}) {
  const action = String(options?.action || "");
  const policy = PARADISE_TEST_GUILD_ACTIONS[action];
  if (!policy) throw runnerError("invalid_test_guild_action", { action });
  if (String(options?.guildId || "") !== PARADISE_TEST_GUILD_ID) {
    throw runnerError("test_guild_only");
  }
  if (policy.mutating && normalizedConfirmation(options?.confirmation) !== policy.confirmation) {
    throw runnerError("typed_confirmation_mismatch", { expectedConfirmation: policy.confirmation });
  }
  const guild = dependencies.guild;
  if (!guild || String(guild.id || "") !== PARADISE_TEST_GUILD_ID) {
    throw runnerError("test_guild_only");
  }
  const operations = dependencies.operations || await import("./paradise3a59.js");
  if (action === "preflight") return operations.inspectParadiseTestTemplateRebuildPreflight(guild);
  if (action === "status") return operations.paradiseTestLabStatus(guild);
  if (action === "apply") {
    return operations.applyParadiseTemplateMissingOnly(guild, "community", { repairPermissions: true });
  }
  if (action === "smoke") return operations.runParadiseTestSmokeSuite(guild, { fast: false });
  if (action === "rehearsal") {
    return operations.rehearseParadiseTestTemplate(guild, "community", policy.confirmation);
  }
  if (action === "recover-rollback") {
    return operations.recoverParadiseTestRollback(guild, policy.confirmation);
  }
  return operations.rebuildParadiseTestTemplate(guild, "community", policy.confirmation);
}

export async function persistParadiseTestGuildRehearsalEvidence(
  { guildId, result, verifiedAt } = {},
  dependencies = {}
) {
  const verifiedRehearsal = result?.action === "rehearsal"
    && result?.status === "LIVE DISCORD VERIFIED"
    && result?.smokeRunsCompleted === 2
    && result?.fullSmokeRunsVerified === true
    && result?.initialBackupVerified === true
    && result?.persistedBackupVerified === true
    && result?.backupAlgorithm === "sha256"
    && safeSha256Digest(result?.backupArtifactDigest) !== null
    && safeSha256Digest(result?.backupStateDigest) !== null
    && result?.backupArtifactDigest === result?.persistedBackupArtifactDigest
    && result?.backupStateDigest === result?.persistedBackupStateDigest
    && result?.restoredOriginalState === true
    && result?.originalStateCanRestore === true
    && result?.originalStateMutationsPlanned === 0;
  if (!verifiedRehearsal) {
    throw runnerError("test_guild_rehearsal_not_live_verified");
  }
  const release = createVerifiedFtCommunityReleaseBinding();
  const summary = summarizeParadiseTestGuildResult("rehearsal", result);
  const evidence = createParadiseRehearsalEvidence({
    guildId,
    result: summary,
    verifiedAt: verifiedAt ?? dependencies.nowMs ?? Date.now(),
    release
  }, {
    secret: dependencies.rehearsalEvidenceSecret
  });
  const persistEvidence = dependencies.persistRehearsalEvidence || persistParadiseRehearsalEvidence;
  await persistEvidence(
    dependencies.rehearsalEvidencePath || PARADISE_REHEARSAL_EVIDENCE_DEFAULT_PATH,
    evidence,
    {
      fileApi: dependencies.fileApi,
      secret: dependencies.rehearsalEvidenceSecret
    }
  );
  return Object.freeze({
    recorded: true,
    verifiedAt: evidence.verifiedAt,
    status: summary.status
  });
}

// Compatibility export for older imports. The v2 evidence creator rejects
// plain smoke results, so this alias cannot reopen the production gate.
export const persistParadiseTestGuildSmokeEvidence = persistParadiseTestGuildRehearsalEvidence;

async function withTimeout(promise, timeoutMs, code) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(runnerError(code)), timeoutMs);
        timeout.unref?.();
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function awaitDiscordClientReady(client, timeoutMs = 45_000) {
  if (client?.isReady?.() === true) return;
  if (typeof client?.once !== "function") throw runnerError("discord_client_ready_unavailable");
  await new Promise((resolve, reject) => {
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      client.off?.("clientReady", onReady);
      client.off?.("error", onError);
      if (error) reject(error);
      else resolve();
    };
    const onReady = () => finish();
    const onError = () => finish(runnerError("discord_client_ready_failed"));
    const timeout = setTimeout(
      () => finish(runnerError("discord_client_ready_timeout")),
      Math.max(1, Number(timeoutMs) || 45_000)
    );
    timeout.unref?.();
    client.once("clientReady", onReady);
    client.once("error", onError);
    if (client.isReady?.() === true) onReady();
  });
  if (client.isReady?.() !== true) throw runnerError("discord_client_not_ready");
}

export async function runParadiseTestGuildCli(options, dependencies = {}) {
  const token = String(dependencies.token ?? process.env.DISCORD_BOT_TOKEN ?? "").trim();
  if (!token) throw runnerError("discord_bot_token_missing");

  const createClient = dependencies.createClient || (() => new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent
    ]
  }));
  const client = createClient();
  try {
    await withTimeout(client.login(token), 45_000, "discord_login_timeout");
    await awaitDiscordClientReady(client, dependencies.clientReadyTimeoutMs);
    const guild = await withTimeout(client.guilds.fetch(PARADISE_TEST_GUILD_ID), 30_000, "test_guild_fetch_timeout");
    if (!guild || String(guild.id || "") !== PARADISE_TEST_GUILD_ID) throw runnerError("test_guild_only");
    await Promise.all([
      guild.channels.fetch?.(),
      guild.roles.fetch?.(),
      guild.members.fetch?.()
    ]);
    const requiredMembers = [
      ["guild_owner_member_not_available", String(guild.ownerId || "")],
      ["bot_member_not_available", String(client.user?.id || guild.client?.user?.id || guild.members?.me?.id || "")]
    ];
    for (const [code, memberId] of requiredMembers) {
      if (!memberId) throw runnerError(code);
      const member = guild.members.cache?.get?.(memberId) || await guild.members.fetch?.(memberId);
      const capturedId = String(member?.id || member?.user?.id || "");
      if (capturedId !== memberId || (guild.members.cache?.get && !guild.members.cache.get(memberId))) {
        throw runnerError(code);
      }
    }
    const result = await executeParadiseTestGuildAction(options, {
      guild,
      operations: dependencies.operations
    });
    const summary = summarizeParadiseTestGuildResult(options.action, result);
    if (options.action === "rehearsal") await persistParadiseTestGuildRehearsalEvidence({
      guildId: guild.id,
      result,
      verifiedAt: dependencies.nowMs ?? Date.now()
    }, dependencies);
    return summary;
  } finally {
    await client.destroy?.();
  }
}
