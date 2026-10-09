import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GIT_COMMIT = /^[a-f0-9]{40}$/iu;
const SHA256 = /^[a-f0-9]{64}$/iu;
const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));

export const FT_COMMUNITY_RELEASE_ENV_NAMES = Object.freeze([
  "RENDER_GIT_COMMIT",
  "FT_COMMUNITY_APPROVED_RENDER_COMMIT",
  "FT_COMMUNITY_APPROVED_RELEASE_SHA256"
]);

// This is deliberately explicit. Adding or replacing a production mutation
// dependency requires a reviewed manifest change and therefore a new digest.
export const FT_COMMUNITY_CRITICAL_RELEASE_FILES = Object.freeze([
  ".env.example",
  "package-lock.json",
  "package.json",
  "prisma/migrations/202605260001_initial/migration.sql",
  "prisma/migrations/202605260002_admin_system/migration.sql",
  "prisma/migrations/202605310001_accounts_store/migration.sql",
  "prisma/migrations/202605310002_account_profile_and_email_quality/migration.sql",
  "prisma/migrations/202606010001_oauth_discord_robux/migration.sql",
  "prisma/migrations/202606020001_monthly_trial/migration.sql",
  "prisma/migrations/202606020002_referral_system/migration.sql",
  "prisma/migrations/202606020003_email_verification_tokens/migration.sql",
  "prisma/migrations/202606030001_gift_codes_direct_packages/migration.sql",
  "prisma/migrations/202606050001_gift_code_purchase_flow/migration.sql",
  "prisma/migrations/202606060001_optional_email_username_accounts/migration.sql",
  "prisma/migrations/202607110001_paradise_guild_scope_foundation/migration.sql",
  "prisma/migrations/202607160001_community_profile_preferences/migration.sql",
  "prisma/migrations/202607180001_community_activity_rewards/migration.sql",
  "prisma/migrations/202607180002_desktop_login_requests/migration.sql",
  "prisma/migrations/202607180003_secure_manual_robux_orders/migration.sql",
  "prisma/migrations/202607180004_community_booster_rewards/migration.sql",
  "prisma/migrations/202610030001_account_username/migration.sql",
  "prisma/migrations/migration_lock.toml",
  "prisma/schema.prisma",
  "public/account-setup.html",
  "public/assets/css/account.css",
  "public/assets/css/desktop-login.css",
  "public/assets/css/fima-bot-dashboard.css",
  "public/assets/css/fima-bot-pages.css",
  "public/assets/css/fima-design-system.css",
  "public/assets/css/paradise-workspace.css",
  "public/assets/css/styles.css",
  "public/assets/css/updating.css",
  "public/assets/images/discord/extended-v2/discord-extended-asset-manifest-v2.json",
  "public/assets/images/discord/v5/discord-asset-manifest-v5.json",
  "public/assets/js/account-identity.js",
  "public/assets/js/account.js",
  "public/assets/js/app.js",
  "public/assets/js/config.js",
  "public/assets/js/dashboard-shell.js",
  "public/assets/js/desktop-login-i18n.js",
  "public/assets/js/desktop-login.js",
  "public/assets/js/fima-bot-commands.js",
  "public/assets/js/fima-bot-dashboard-i18n.js",
  "public/assets/js/fima-bot-dashboard.js",
  "public/assets/js/fima-bot-invite.js",
  "public/assets/js/fima-bot-pages-i18n.js",
  "public/assets/js/fima-guild-operations.js",
  "public/assets/js/fima-owner-community.js",
  "public/assets/js/fima-owner-integration.js",
  "public/assets/js/fima-owner-tools.js",
  "public/assets/js/fima-owner-workspace.js",
  "public/assets/js/fima-surface-i18n.js",
  "public/assets/js/owner-sign-in.js",
  "public/assets/js/paradise-application-questions-en.js",
  "public/assets/js/paradise-apply.js",
  "public/assets/js/paradise-community-structure.js",
  "public/assets/js/paradise-content-studio.js",
  "public/assets/js/paradise-workspace.js",
  "public/assets/js/success.js",
  "public/assets/js/updating.js",
  "public/assets/styles/fima-bot.css",
  "public/auth/roblox-callback.html",
  "public/dashboard.html",
  "public/desktop-login.html",
  "public/download-unavailable.html",
  "public/download.html",
  "public/faq.html",
  "public/features.html",
  "public/fima-bot-commands.html",
  "public/fima-bot-dashboard.html",
  "public/fima-bot-feedback.html",
  "public/fima-bot-invite.html",
  "public/fima-bot-premium.html",
  "public/forgot-password.html",
  "public/how-to-get-key.html",
  "public/index.html",
  "public/legal.html",
  "public/login.html",
  "public/macros.html",
  "public/my-products.html",
  "public/owner-sign-in.html",
  "public/paradise-apply.html",
  "public/paradise-bot.html",
  "public/paradise-content-studio.html",
  "public/payment-cancelled.html",
  "public/payment-success.html",
  "public/pricing.html",
  "public/privacy/index.html",
  "public/register.html",
  "public/reset-password.html",
  "public/roblox-login.html",
  "public/security.html",
  "public/store.html",
  "public/success.html",
  "public/support.html",
  "public/terms/index.html",
  "public/updating.html",
  "render.yaml",
  "scripts/ft-community-production.js",
  "scripts/paradise-test-guild.js",
  "src/accountDeviceRebind.js",
  "src/accountDeviceRoutes.js",
  "src/accountIdentity.js",
  "src/accountIdentityReveal.js",
  "src/accountProfilePreferences.js",
  "src/accountRateLimit.js",
  "src/adminAuth.js",
  "src/adminHtml.js",
  "src/adminRbac.js",
  "src/aiSupportDiscordBridge.js",
  "src/appVersionPolicy.js",
  "src/communityActivity.js",
  "src/communityActivitySettings.js",
  "src/communityActivityRoles.js",
  "src/communityBooster.js",
  "src/communityGuildPolicy.js",
  "src/csrf.js",
  "src/db.js",
  "src/desktopAuthSessions.js",
  "src/desktopCommerceRoutes.js",
  "src/desktopLogin.js",
  "src/desktopLoginRoutes.js",
  "src/deviceEnvironmentRisk.js",
  "src/discordBot.js",
  "src/fimaTemporaryVoiceLifecycle.js",
  "src/fimaTicketIntake.js",
  "src/fimaTicketLifecycle.js",
  "src/fimaTicketState.js",
  "src/fimaTicketTranscript.js",
  "src/fimaVoicePermissions.js",
  "src/fimaPurgeConfirmation.js",
  "src/ftCommunityChannelMigration.js",
  "src/ftCommunityInfo.js",
  "src/ftCommunityChannelNames.js",
  "src/ftCommunityMigrationPlan.js",
  "src/ftCommunityMessageSafety.js",
  "src/ftCommunityBehaviorSafety.js",
  "src/ftCommunityMediaSafety.js",
  "src/ftCommunityMediaWorker.js",
  "src/ftCommunityShowcase.js",
  "src/ftCommunityWelcome.js",
  "src/ftCommunityStaffActions.js",
  "src/discordGuildMemberships.js",
  "src/ecosystemFeedbackDiscord.js",
  "src/entitlementRefreshSecurity.js",
  "src/entitlements.js",
  "src/env.js",
  "src/fieelsCommunityStructure.js",
  "src/fimaAiAdapter.js",
  "src/fimaBotApplicationPageHtml.js",
  "src/fimaBotApplicationPolicy.js",
  "src/fimaBotApplicationRoute.js",
  "src/fimaBotContentStudioPolicy.js",
  "src/fimaBotDashboardContract.js",
  "src/fimaBotExperienceContract.js",
  "src/fimaBotIdentity.js",
  "src/fimaBotProfileSync.js",
  "src/fimaBotSiteExperience.js",
  "src/fimaDiscordGateway.js",
  "src/fimaGuildArchitecture.js",
  "src/fimaGuildOperations.js",
  "src/fimaGuildOperationsRouter.js",
  "src/fimaOwnerToolsFragment.js",
  "src/fimaProfileProjection.js",
  "src/fimaStructuralMigration.js",
  "src/fimaVoiceProvisioning.js",
  "src/ftCommunityDeploymentReadiness.js",
  "src/ftCommunityProductionOrchestrator.js",
  "src/ftCommunityProfileSync.js",
  "src/ftCommunityReadonlyAudit.js",
  "src/ftCommunityReleaseAttestation.js",
  "src/ftCommunityVisualAssets.js",
  "src/googleOAuthCookie.js",
  "src/license.js",
  "src/macroHandoffCandidate.mjs",
  "src/macroHandoffContract.mjs",
  "src/manualRobuxPayments.js",
  "src/oauthStateReplay.js",
  "src/ownerAccess.js",
  "src/ownerFreshProof.js",
  "src/ownerGrantJob.js",
  "src/paradise3a59.js",
  "src/paradiseApplicationAccess.js",
  "src/paradiseApplicationDraft.js",
  "src/paradiseApplicationHttp.js",
  "src/paradiseApplicationSettings.js",
  "src/paradiseBackupIntegrity.js",
  "src/paradiseCommandRegistry.js",
  "src/paradiseComponentProtocol.js",
  "src/paradiseConfigVersioning.js",
  "src/paradiseContentArchive.js",
  "src/paradiseContentStudio.js",
  "src/paradiseCustomerWorkspaces.js",
  "src/paradiseDashboardHtml.js",
  "src/paradiseDashboardRoute.js",
  "src/paradiseDashboardWorkspace.js",
  "src/paradiseEnvironmentReadiness.js",
  "src/paradiseFeatureFlags.js",
  "src/paradiseGuildRestore.js",
  "src/paradiseGuildScope.js",
  "src/paradiseGuildStateRepository.js",
  "src/paradiseLegacyStateInventory.js",
  "src/paradiseMutationLease.js",
  "src/paradiseProductionRebuildPlan.js",
  "src/paradiseRbac.js",
  "src/paradiseRebuildPreflight.js",
  "src/paradiseReconciliation.js",
  "src/paradiseRehearsalEvidence.js",
  "src/paradiseRollbackMarker.js",
  "src/paradiseTestGuildRunner.js",
  "src/paradiseWorkspaceReadModel.js",
  "src/passwordCredentials.js",
  "src/plans.js",
  "src/roblox-v2/authority.mjs",
  "src/roblox-v2/bootstrap.mjs",
  "src/roblox-v2/callbackRelay.mjs",
  "src/roblox-v2/environment.mjs",
  "src/roblox-v2/httpAdapter.mjs",
  "src/roblox-v2/provider.mjs",
  "src/roblox-v2/robloxOAuthCandidate.mjs",
  "src/roblox-v2/sealing.mjs",
  "src/robloxAccountSecurity.js",
  "src/runtime-package-integrity.mjs",
  "src/runtimeEnvironment.js",
  "src/securityE2EJob.js",
  "src/server.js",
  "src/siteUpdatingMode.js",
  "src/stripeSafety.js",
  "src/trialPromo.js"
]);

function clean(value) {
  return String(value ?? "").trim();
}

export function computeFtCommunityReleaseDigest({
  repositoryRoot = REPOSITORY_ROOT,
  readFileSync = fs.readFileSync,
  files = FT_COMMUNITY_CRITICAL_RELEASE_FILES
} = {}) {
  const hash = createHash("sha256");
  hash.update("FIMA_FT_COMMUNITY_RELEASE_V1\0", "utf8");
  for (const relativePath of [...files].sort()) {
    const normalized = clean(relativePath).replaceAll("\\", "/");
    if (!normalized || normalized.startsWith("/") || normalized.includes("../")) {
      throw Object.assign(new Error("invalid_release_file"), {
        code: "ft_community_release_manifest_invalid"
      });
    }
    const bytes = readFileSync(path.join(repositoryRoot, ...normalized.split("/")));
    hash.update(normalized, "utf8");
    hash.update("\0", "utf8");
    hash.update(String(bytes.length), "utf8");
    hash.update("\0", "utf8");
    hash.update(bytes);
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}

/**
 * Names-only attestation result. Commit and digest values are intentionally
 * omitted so readiness endpoints cannot become deployment fingerprint oracles.
 */
function evaluateFtCommunityReleaseAttestation(source = process.env, options = {}) {
  const missing = FT_COMMUNITY_RELEASE_ENV_NAMES.filter(name => !clean(source?.[name]));
  const invalid = [];
  const deployedCommit = clean(source?.RENDER_GIT_COMMIT);
  const approvedCommit = clean(source?.FT_COMMUNITY_APPROVED_RENDER_COMMIT);
  const approvedDigest = clean(source?.FT_COMMUNITY_APPROVED_RELEASE_SHA256);

  if (!missing.includes("RENDER_GIT_COMMIT") && !GIT_COMMIT.test(deployedCommit)) {
    invalid.push("RENDER_GIT_COMMIT");
  }
  if (!missing.includes("FT_COMMUNITY_APPROVED_RENDER_COMMIT")
      && (!GIT_COMMIT.test(approvedCommit)
        || (GIT_COMMIT.test(deployedCommit)
          && approvedCommit.toLowerCase() !== deployedCommit.toLowerCase()))) {
    invalid.push("FT_COMMUNITY_APPROVED_RENDER_COMMIT");
  }

  let computedDigest = "";
  let releaseReadable = true;
  try {
    computedDigest = computeFtCommunityReleaseDigest(options);
  } catch {
    releaseReadable = false;
  }
  if (!missing.includes("FT_COMMUNITY_APPROVED_RELEASE_SHA256")
      && (!releaseReadable
        || !SHA256.test(approvedDigest)
        || approvedDigest.toLowerCase() !== computedDigest.toLowerCase())) {
    invalid.push("FT_COMMUNITY_APPROVED_RELEASE_SHA256");
  }

  const status = Object.freeze({
    schemaVersion: 1,
    ready: releaseReadable && missing.length === 0 && invalid.length === 0,
    code: !releaseReadable
      ? "ft_community_release_files_unreadable"
      : missing.length > 0
        ? "ft_community_release_attestation_missing"
        : invalid.length > 0
          ? "ft_community_release_attestation_mismatch"
          : "ft_community_release_attestation_verified",
    required: FT_COMMUNITY_RELEASE_ENV_NAMES,
    missing: Object.freeze(missing),
    invalid: Object.freeze(invalid),
    criticalFileCount: FT_COMMUNITY_CRITICAL_RELEASE_FILES.length,
    outputPolicy: "Only environment variable names and verification states are returned; values are never returned."
  });
  return Object.freeze({
    status,
    binding: status.ready
      ? Object.freeze({
          revision: deployedCommit.toLowerCase(),
          criticalDigest: computedDigest.toLowerCase()
        })
      : null
  });
}

export function inspectFtCommunityReleaseAttestation(source = process.env, options = {}) {
  return evaluateFtCommunityReleaseAttestation(source, options).status;
}

export function assertFtCommunityReleaseAttestation(source = process.env, options = {}) {
  const status = inspectFtCommunityReleaseAttestation(source, options);
  if (!status.ready) {
    throw Object.assign(new Error(status.code), { code: status.code });
  }
  return status;
}

/**
 * Server-side binding for signed mutation evidence. Unlike the public
 * readiness status, this value must never be returned from an HTTP endpoint.
 * The exact digest used by the attestation is returned, without a second
 * filesystem pass that could observe different bytes. This path deliberately
 * has no injectable digest or filesystem options.
 */
export function createVerifiedFtCommunityReleaseBinding(source = process.env) {
  const evaluation = evaluateFtCommunityReleaseAttestation(source);
  if (!evaluation.status.ready) {
    throw Object.assign(new Error(evaluation.status.code), { code: evaluation.status.code });
  }
  return evaluation.binding;
}
