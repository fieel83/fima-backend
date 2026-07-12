import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildParadiseLegacyStateInventory } from "../src/paradiseLegacyStateInventory.js";

const root = process.cwd();
const outDir = path.join(root, "artifacts", "paradise-vnext");
const now = new Date().toISOString();
const localCommit = (() => {
  if (String(process.env.PARADISE_LOCAL_COMMIT || "").trim()) return String(process.env.PARADISE_LOCAL_COMMIT).trim();
  try { return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch { return "unavailable"; }
})();
const observedProductionVersion = (() => {
  const commit = String(process.env.PARADISE_PRODUCTION_COMMIT || "").trim();
  const version = String(process.env.PARADISE_PRODUCTION_VERSION || "").trim();
  return commit || version
    ? { status: "LIVE VERIFIED", commit: commit || null, version: version || null, source: "read-only /api/version" }
    : { status: "SOURCE ONLY", commit: null, version: null, source: "not re-read during this matrix generation" };
})();

const requirement = (requirementId, title, description, {
  module, priority = "P2", milestone = "Milestone 2", dependencies = [], templateScope = ["all"],
  premiumScope = "all", ownerDecisionRequired = false, securityCritical = false, destructive = false,
  conflicts = [], resolvedRule = "No conflict recorded.", acceptanceCriteria = [], testRequirements = [],
  sourceStatus = "SOURCE ONLY", localTestStatus = "SOURCE ONLY", deployStatus = "SOURCE ONLY",
  liveDiscordStatus = "SOURCE ONLY", dashboardBrowserStatus = "SOURCE ONLY", evidencePath = [],
  blocker = null, nextExactAction = "Implement after all dependencies are verified.", affectedFiles = [],
  affectedDatabaseTables = [], affectedDiscordObjects = [], rollbackMethod = "Feature flag disable and configuration rollback.", securityRisk = "medium"
} = {}) => ({
  requirementId, title, description, sourcePlan: ["Paradise vNext consolidated specification", "3A72 missing contracts", "3A73 execution directive"],
  module, templateScope, premiumScope, dependencies, conflicts, resolvedRule, ownerDecisionRequired,
  securityCritical, destructive, acceptanceCriteria, testRequirements, priority, milestone,
  sourceStatus, localTestStatus, deployStatus, liveDiscordStatus, dashboardBrowserStatus,
  evidencePath, blocker, nextExactAction, affectedFiles, affectedDatabaseTables,
  affectedDiscordObjects, rollbackMethod, securityRisk
});

const commonTest = ["node --check", "node --test", "secret scan", "matrix row update"];
const testGuild = "1520519015661961257";

const requirements = [
  requirement("LIC-001", "Paid license reveal and repair regression safety", "Paid active licenses must never report an available key while secure reveal/copy is unavailable. Repair stays on the same entitlement record and logs only masked metadata.", {
    module: "license", priority: "P0", milestone: "Milestone 1", securityCritical: true,
    dependencies: ["ENV-001", "AUTH-001", "CFG-001"],
    acceptanceCriteria: ["GET metadata never exposes a raw key", "authenticated POST reveal/copy returns a usable key or support-safe error", "paid-null-key scan is masked", "repair preserves plan and entitlement"],
    testRequirements: [...commonTest, "owner-authenticated production scan", "owner-controlled browser copy/reveal"],
    sourceStatus: "DEPLOYED", localTestStatus: "LOCAL VERIFIED", deployStatus: "DEPLOYED", liveDiscordStatus: "SOURCE ONLY", dashboardBrowserStatus: "BLOCKED",
    evidencePath: ["artifacts/post-security-backlog/3a71-production-license-hotfix-deploy.json", "artifacts/post-security-backlog/3a71-production-paid-license-null-key-scan.json"],
    blocker: "Post-deploy owner browser and production scan are blocked by unavailable owner Chrome connection.",
    nextExactAction: "Reconnect owner browser; run masked paid-license scan and copy/reveal test without recording the key.",
    affectedFiles: ["src/server.js", "src/entitlements.js"], affectedDatabaseTables: ["licenses", "audit_logs"], securityRisk: "critical"
  }),
  requirement("ENV-001", "Fail-closed runtime environment guard", "Development, staging and production must be explicit. Missing or malformed environment identity must never default to production or permit production Discord mutation.", {
    module: "environment", priority: "P0", milestone: "Milestone 1", securityCritical: true,
    acceptanceCriteria: ["environment validation rejects invalid marker", "production mutation requires explicit production guard", "only the exact test guild can run setup/create-missing/rebuild/smoke", "no secret values appear in error output"],
    testRequirements: [...commonTest, "development/staging/production matrix test"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED",
    evidencePath: ["test/runtimeEnvironment.test.js", "test/paradise3a59.test.js"],
    nextExactAction: "Create the redacted staging/production readiness contract for ENV-002; do not widen the exact test-guild guard.", affectedFiles: ["src/runtimeEnvironment.js", "src/env.js", "src/server.js", "src/discordBot.js", "src/paradise3a59.js"], securityRisk: "critical"
  }),
  requirement("ENV-002", "Environment deployment separation", "Development, staging and production need distinct DB identity, OAuth callback, session secret, bot identity and mutation policy.", {
    module: "environment", priority: "P1", milestone: "Milestone 1", dependencies: ["ENV-001"], securityCritical: true,
    acceptanceCriteria: ["separate staging configuration documented", "production credentials cannot be accepted in staging guard", "Render environment checklist exists"],
    testRequirements: [...commonTest, "staging readiness dry-run"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["src/paradiseEnvironmentReadiness.js", "test/paradiseEnvironmentReadiness.test.js"], blocker: "Real staging/Render identities were not inspected or changed in this local worktree.", nextExactAction: "Have the owner provision separate staging identities, then run the redacted readiness check before any staging deploy.", affectedFiles: ["src/paradiseEnvironmentReadiness.js", ".env.example", "render.yaml", "src/server.js"], securityRisk: "critical"
  }),
  requirement("AUTH-001", "Owner Console versus customer dashboard authorization", "Owner-only operational APIs are separate from customer guild workspaces. Customer users can view only Discord guilds where they have Manage Guild or Administrator.", {
    module: "authorization", priority: "P0", milestone: "Milestone 1", dependencies: ["ENV-001"], securityCritical: true,
    acceptanceCriteria: ["guild-scope authorization on every API", "cross-guild request is denied", "owner endpoints require step-up policy", "customer dashboard does not expose owner operations"],
    testRequirements: [...commonTest, "two-user/two-guild authorization test"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["test/paradiseFoundation.test.js", "test/paradiseCustomerWorkspaces.test.js", "test/paradise-dashboard.test.js"], nextExactAction: "Run an owner-controlled OAuth guilds-scope browser test, then add a separately authorized customer guild config route; keep owner console routes owner-only.", affectedFiles: ["src/paradiseGuildScope.js", "src/paradiseCustomerWorkspaces.js", "src/server.js", "src/adminAuth.js"], affectedDatabaseTables: ["users", "oauth_links", "audit_logs"], securityRisk: "critical"
  }),
  requirement("AUTH-002", "Dashboard API and OAuth hardening", "OAuth state/PKCE, CSRF, secure sessions, rate limits, encrypted provider token storage, webhook signatures and owner session revocation are enforced.", {
    module: "authorization", priority: "P1", milestone: "Milestone 2", dependencies: ["AUTH-001", "ENV-001"], securityCritical: true,
    acceptanceCriteria: ["OAuth state replay fails", "CSRF retry does not bypass authorization", "provider tokens are encrypted", "SSRF/file upload validation exists"],
    testRequirements: [...commonTest, "OAuth state test", "CSRF negative test", "guild scope API test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Design after the shared guild authorization foundation is established.", affectedFiles: ["src/server.js", "src/csrf.js", "src/adminAuth.js"], securityRisk: "critical"
  }),
  requirement("CFG-001", "Configuration versioning and audit foundation", "Every guild configuration save creates a schema-versioned snapshot, field-level diff, actor, source and rollback record.", {
    module: "configuration", priority: "P0", milestone: "Milestone 1", dependencies: ["AUTH-001"], securityCritical: true,
    acceptanceCriteria: ["one safe config save creates an audit row", "rollback preview is available", "invalid advanced JSON is rejected", "no cross-guild config access"],
    testRequirements: [...commonTest, "save/reload/audit test"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["test/paradiseFoundation.test.js", "test/paradise-dashboard.test.js"], nextExactAction: "Browser-test history and rollback preview in an owner session; keep actual rollback disabled until a verified backup and dual-write migration are available.", affectedFiles: ["src/paradiseConfigVersioning.js", "src/server.js", "src/paradise3a59.js"], affectedDatabaseTables: ["settings", "audit_logs"], securityRisk: "high"
  }),
  requirement("FLAG-001", "Feature flags and kill switches", "High-risk modules use global/environment/guild/plan/role scoped flags with safe disable/re-enable behavior.", {
    module: "feature-flags", priority: "P0", milestone: "Milestone 1", dependencies: ["ENV-001", "CFG-001", "AUTH-001"], securityCritical: true,
    acceptanceCriteria: ["disabled module rejects new action safely", "existing state remains intact", "flag transition is audited", "test guild canary cannot affect production guild"],
    testRequirements: [...commonTest, "enable/disable/re-enable test"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["src/paradiseFeatureFlags.js", "src/paradise3a59.js", "test/paradiseFoundation.test.js", "test/paradise-dashboard.test.js"], blocker: "No isolated staging bot/runtime identity or safe staging deployment path is currently available.", nextExactAction: "Deploy only to staging/test guild and verify the command registry canary enables there while its kill switch leaves production command behavior unchanged.", affectedFiles: ["src/paradiseFeatureFlags.js", "src/server.js", "src/paradise3a59.js"], affectedDatabaseTables: ["settings", "audit_logs"], securityRisk: "high"
  }),
  requirement("DB-001", "PostgreSQL guild-scope data foundation", "Guild-local Paradise state moves from opaque state JSON toward scoped PostgreSQL records while global identity remains separate.", {
    module: "database", priority: "P0", milestone: "Milestone 1", dependencies: ["ENV-001", "CFG-001"], securityCritical: true,
    acceptanceCriteria: ["guild ID is required on new scoped records", "indexes support guild lookups", "cross-guild reference tests fail safely", "critical state is not memory-only"],
    testRequirements: [...commonTest, "Prisma schema validation", "guild isolation test"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["prisma/migrations/202607110001_paradise_guild_scope_foundation/migration.sql", "test/paradiseGuildStateRepository.test.js"], blocker: "The additive migration is intentionally unapplied until a verified backup and count preview are available.", nextExactAction: "Run Prisma migration only in an isolated staging database, then dual-write a single safe guild config before any legacy-state migration.", affectedFiles: ["prisma/schema.prisma", "prisma/migrations/202607110001_paradise_guild_scope_foundation/migration.sql", "src/paradiseGuildStateRepository.js", "src/paradise3a59.js"], affectedDatabaseTables: ["settings", "paradise_guild_configs", "paradise_guild_records", "audit_logs"], securityRisk: "critical"
  }),
  requirement("DB-002", "Legacy state migration preview", "Profiles, verification, panels, XP, tickets, applications, lineups, cooldowns and jobs receive backup, count comparison, duplicate detection and rollback-ready migration previews.", {
    module: "database", priority: "P0", milestone: "Milestone 1", dependencies: ["DB-001", "BACKUP-001"], destructive: true, securityCritical: true,
    acceptanceCriteria: ["legacy inventory counts exist", "migration preview has old/new counts", "duplicate/referential integrity checks exist", "production apply is blocked without verified backup"],
    testRequirements: [...commonTest, "synthetic migration dry-run", "rollback dry-run"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["test/paradiseLegacyStateInventory.test.js", "artifacts/paradise-vnext/milestone-1-legacy-state-migration-preview.json"], blocker: "Production DB state inspection is intentionally blocked without authenticated owner access.", nextExactAction: "Design additive Prisma migration after production count preview and backup validation are available.", affectedFiles: ["src/paradiseLegacyStateInventory.js", "src/paradise3a59.js", "prisma/schema.prisma"], affectedDatabaseTables: ["settings"], securityRisk: "critical"
  }),
  requirement("BACKUP-001", "Backup integrity foundation", "Backups carry schema version, counts, overwrite and panel metadata, checksum, validation and restore dry-run status.", {
    module: "backup", priority: "P0", milestone: "Milestone 1", dependencies: ["ENV-001"], securityCritical: true,
    acceptanceCriteria: ["backup includes integrity metadata", "invalid backup blocks rebuild", "restore dry-run verifies counts and schema", "backup action is audited"],
    testRequirements: [...commonTest, "backup checksum test", "restore dry-run test"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["test/paradiseBackupIntegrity.test.js", "test/paradise3a59.test.js"], nextExactAction: "Define encrypted backup storage and perform an authorized restore drill in staging before any production rebuild path can consume backups.", affectedFiles: ["src/paradiseBackupIntegrity.js", "src/paradise3a59.js", "src/discordBot.js", "src/server.js"], affectedDatabaseTables: ["settings", "audit_logs"], securityRisk: "critical"
  }),
  requirement("OPS-001", "Reconciliation health foundation", "Recurring safe checks discover orphaned channels, roles, panels, tickets, transcripts, component schemas, leaderboard duplicates and cross-guild references.", {
    module: "operations", priority: "P0", milestone: "Milestone 1", dependencies: ["CFG-001", "DB-001", "BACKUP-001"], securityCritical: true,
    acceptanceCriteria: ["health result distinguishes healthy/auto-repairable/owner-review/unsafe", "no destructive auto-repair", "test-guild canary persists only a redacted rate-limited summary", "overview can display last reconciliation safely"],
    testRequirements: [...commonTest, "synthetic orphan detection test", "interval/redacted-summary test"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["src/paradiseReconciliation.js", "src/paradise3a59.js", "src/server.js", "test/paradiseReconciliation.test.js", "test/paradise3a59.test.js", "test/paradise-dashboard.test.js"], blocker: "No isolated staging bot/runtime identity or safe staging deployment path is currently available.", nextExactAction: "Deploy only to isolated staging/the exact test guild; verify one scheduled run stores the safe summary and that a production guild cannot enable this canary.", affectedFiles: ["src/paradiseReconciliation.js", "src/paradise3a59.js", "src/server.js"], securityRisk: "high"
  }),
  requirement("CMD-001", "Central command registry", "Every command/subcommand has one manifest for template, module, premium tier, channel, role, parameters, help text, audit and registration scope.", {
    module: "commands", priority: "P0", milestone: "Milestone 1", dependencies: ["RBAC-001", "FLAG-001", "AUTH-001"], securityCritical: true,
    acceptanceCriteria: ["same manifest drives slash registration/help/backend authorization", "Community excludes challenge/roster/referee", "disabled module command is rejected at runtime"],
    testRequirements: [...commonTest, "template command visibility test", "role visibility test", "runtime denial test"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["src/paradiseCommandRegistry.js", "src/paradise3a59.js", "test/paradiseFoundation.test.js", "test/paradise3a59.test.js"], blocker: "No isolated staging bot/runtime identity or safe staging deployment path is currently available.", nextExactAction: "Deploy only to staging/test guild, re-register scoped commands, then prove member /help and Community command denial without unregistering legacy commands.", affectedFiles: ["src/paradiseCommandRegistry.js", "src/paradise3a59.js", "src/discordBot.js"], securityRisk: "high"
  }),
  requirement("RBAC-001", "Paradise RBAC and role manifest foundation", "Discord role checks, Paradise permissions, hierarchy validation and role assignment authority are centralized.", {
    module: "rbac", priority: "P0", milestone: "Milestone 1", dependencies: ["AUTH-001", "CFG-001"], securityCritical: true,
    acceptanceCriteria: ["role/persona check is centralized", "bot hierarchy blocker is explicit", "hidden command remains runtime denied", "owner actions are audited"],
    testRequirements: [...commonTest, "owner/admin/member/referee persona tests"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["src/paradiseRbac.js", "src/paradise3a59.js", "test/paradiseFoundation.test.js", "test/paradise3a59.test.js"], blocker: "No isolated staging bot/runtime identity or safe staging deployment path is currently available.", nextExactAction: "Deploy only to staging/test guild, then run Owner, Training Hoster, Trial Referee and normal-member persona proof against challenge controls without changing role assignments.", affectedFiles: ["src/paradiseRbac.js", "src/paradise3a59.js", "src/discordBot.js"], securityRisk: "critical"
  }),
  requirement("COMP-001", "Persistent Discord component protocol", "Versioned custom IDs are guild scoped, restart safe, authorization checked and repairable without collectors.", {
    module: "components", priority: "P0", milestone: "Milestone 1", dependencies: ["RBAC-001", "CFG-001"], securityCritical: true,
    acceptanceCriteria: ["restart-safe component dispatch", "stale/cross-guild/unauthorized interaction is rejected", "no secret in custom ID", "outdated panel gives repair response"],
    testRequirements: [...commonTest, "restart interaction test", "stale component test", "cross-guild replay test"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["test/paradiseFoundation.test.js", "test/paradise3a59.test.js"], blocker: "No isolated staging bot/runtime identity or safe staging deployment path is currently available.", nextExactAction: "Deploy and test the non-destructive availability refresh panel across a bot restart in the exact test guild; retain old panel compatibility during the migration window.", affectedFiles: ["src/paradiseComponentProtocol.js", "src/paradise3a59.js", "src/discordBot.js"], securityRisk: "high"
  }),
  requirement("SETUP-001", "Exact setup preview, status and audit commands", "Setup commands use test-guild guard, preview/create-missing/repair/repost/backup/restore/rebuild/status/audit behavior and never mutate production without confirmation.", {
    module: "setup", priority: "P0", milestone: "Milestone 1", dependencies: ["ENV-001", "BACKUP-001", "RBAC-001", "CMD-001"], destructive: true, securityCritical: true,
    acceptanceCriteria: ["test guild exact allowlist works", "production guild guard fails", "preview/status/audit are non-destructive", "repeated create-missing is idempotent"],
    testRequirements: [...commonTest, "test guild safe preview", "non-allowed guild denial", "idempotency test"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", liveDiscordStatus: "SOURCE ONLY", evidencePath: ["src/paradise3a59.js", "test/paradise3a59.test.js"], blocker: "The current guarded setup code is not deployed to an isolated staging/test-guild runtime.", nextExactAction: "Deploy only to isolated staging/the exact test guild; prove preview, create-missing, idempotent rerun and a production-guild guard denial using the current compact schema.", affectedFiles: ["src/paradise3a59.js", "src/discordBot.js", "src/server.js"], affectedDiscordObjects: ["test-guild structure"], securityRisk: "critical"
  }),
  requirement("DASH-001", "Customer dashboard baseline", "Authorized login, top server selector, isolated routes, safe config save/reload, validation, toast and CSRF retry form the first dashboard proof.", {
    module: "dashboard", priority: "P0", milestone: "Milestone 1", dependencies: ["AUTH-001", "CFG-001"],
    acceptanceCriteria: ["Manage Guild/Admin scope", "bot installed/invite state", "safe save/reload", "audit record", "desktop/mobile proof", "not one giant route"],
    testRequirements: [...commonTest, "authorized browser save/reload", "CSRF retry", "two-guild isolation"], sourceStatus: "SOURCE ONLY", localTestStatus: "LOCAL VERIFIED", dashboardBrowserStatus: "BLOCKED", evidencePath: ["artifacts/post-security-backlog/3a68-dashboard-owner-save-live-proof.json"], blocker: "Owner-authenticated browser interaction not currently available.", nextExactAction: "Map existing dashboard APIs to guild-scope auth; defer visual polish until baseline save/reload works.", affectedFiles: ["src/server.js", "src/paradiseDashboardHtml.js", "public/dashboard.html"], securityRisk: "high"
  }),
  requirement("TEST-001", "Test-guild-only smoke proof", "The exact test guild proves safe guard, setup preview/status/audit, idempotency, persistent component restart and RBAC denial without production mutation.", {
    module: "testing", priority: "P0", milestone: "Milestone 1", dependencies: ["ENV-001", "SETUP-001", "COMP-001", "RBAC-001"], securityCritical: true,
    acceptanceCriteria: ["test guild identified", "production guard denial captured", "persistent component survives restart", "no duplicate safe object", "real command/message proof"],
    testRequirements: ["live bot test on guild " + testGuild, "restart proof", "guard negative proof"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", liveDiscordStatus: "SOURCE ONLY", evidencePath: ["src/paradise3a59.js", "test/paradise3a59.test.js"], blocker: "The current guarded code is not deployed to an isolated staging/test-guild runtime.", nextExactAction: "Deploy current code only to the exact test guild, then record guard denial, restart and no-duplicate proof; do not rebuild the lab for artifact-only work.", affectedFiles: ["src/paradise3a59.js", "src/discordBot.js"], affectedDiscordObjects: ["test guild only"], securityRisk: "high"
  }),
  requirement("TPL-001", "Compact template architecture", "Community, Clan and TSBTR enforce channel budgets, disabled-module absence, same-channel consolidation and test-before-main installation.", { module: "templates", priority: "P1", dependencies: ["SETUP-001", "RBAC-001"], acceptanceCriteria: ["Community 10-12 public/4-6 private", "Clan 15-18 public/6-8 private", "TSBTR 14-17 public/6-8 private", "no default role-guide", "welcome/leave and staff guides are consolidated"], testRequirements: [...commonTest, "channel-budget unit test", "three template install comparison", "current-schema idempotency proof"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["src/paradise3a59.js", "test/paradise3a59.test.js"], blocker: "No isolated staging bot/runtime identity is available to install the current compact schemas in the exact test guild.", nextExactAction: "Deploy only to isolated staging/the exact test guild, install each compact template, verify channel type/count/mapping/role visibility, and capture no-duplicate repair proof before any production migration preview.", affectedFiles: ["src/paradise3a59.js", "test/paradise3a59.test.js"], securityRisk: "medium" }),
  requirement("NAMING-001", "Premium controlled naming and branding", "Five test-guild sidebar concepts precede owner selection. Naming is decorative but readable, template-specific, configurable and never production-applied without approval.", { module: "branding", priority: "P2", ownerDecisionRequired: true, dependencies: ["TPL-001"], acceptanceCriteria: ["five real sidebar variants", "TR/EN previews", "no emoji spam/corporate codes", "no duplicate rename repair"], testRequirements: ["test-guild screenshots", "mobile sidebar review"], sourceStatus: "SOURCE ONLY", nextExactAction: "Deferred until compact template foundation and owner branding decision.", securityRisk: "low" }),
  requirement("LANG-001", "Three language layers and natural copy", "Personal dashboard language, guild canonical panel language and personal ephemeral help language remain separate; no language click creates duplicate panels.", { module: "i18n", priority: "P1", dependencies: ["CFG-001", "COMP-001"], acceptanceCriteria: ["canonical stored message edits in place", "TR/EN completeness checks", "personal help is ephemeral", "natural non-literal copy"], testRequirements: [...commonTest, "TR/EN message-ID test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer after component/config foundation.", securityRisk: "medium" }),
  requirement("PANEL-001", "Canonical panels and handbooks", "Overview, rules, roles, support, staff guides and operational channel handbooks are stored, pinned where needed and edited in place.", { module: "panels", priority: "P1", dependencies: ["COMP-001", "LANG-001", "TPL-001"], acceptanceCriteria: ["one canonical ID per panel", "no duplicates", "handbook repair works", "footer policy followed"], testRequirements: [...commonTest, "panel delete/repair test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until component and language foundations are complete.", securityRisk: "medium" }),
  requirement("PROFILE-001", "Profile and Roblox verification", "Short single-use Roblox-safe codes, duplicate prevention, privacy, re-verification and verified-profile gates support profile/challenge/leaderboard systems.", { module: "profiles", priority: "P1", dependencies: ["DB-001", "RBAC-001"], acceptanceCriteria: ["no duplicate active profile", "code expiry/rate limit", "privacy controls", "verified gate works"], testRequirements: [...commonTest, "profile verify/duplicate test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until database migration preview is ready.", affectedDatabaseTables: ["future guild profiles", "settings"], securityRisk: "high" }),
  requirement("PROFILE-002", "Profile transfer and privacy", "Old/new Discord confirmation, Roblox/Fima secondary verification, fraud controls, review-only AI and rollback govern transfers.", { module: "profiles", priority: "P2", dependencies: ["PROFILE-001", "AI-002"], acceptanceCriteria: ["dual confirmation", "manual staff-only finalization", "history/rollback", "blacklist restriction"], testRequirements: [...commonTest, "transfer fraud/rollback test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until verified profile storage exists.", securityRisk: "high" }),
  requirement("CHALLENGE-001", "Leaderboard and stage/range rules", "Compact public boards, full profile view, Stage/Level/Strength, ranges, cooldowns, immunity and manual management use guild-scope audited state.", { module: "challenge", priority: "P1", dependencies: ["PROFILE-001", "DB-001", "CMD-001", "RBAC-001"], acceptanceCriteria: ["public cards hide internal data", "vacant is friendly", "timestamps are correct", "manual edits audit"], testRequirements: [...commonTest, "Top10/20/30 update-in-place test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer after profile/database foundation.", securityRisk: "high" }),
  requirement("CHALLENGE-002", "Challenge result transaction and referee approval", "Post/autowin/score approval/co-ref/stroke reason workflows atomically update result, board, immunity, cooldown, availability, ticket and referee activity.", { module: "challenge", priority: "P1", dependencies: ["CHALLENGE-001", "TICKET-001", "RBAC-001", "OPS-001"], acceptanceCriteria: ["no partial result state", "Trial Referee blocked", "ticket autofill", "approval audit"], testRequirements: [...commonTest, "transaction failure test", "referee persona test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until ticket and persisted leaderboard foundations exist.", securityRisk: "critical" }),
  requirement("SESSION-001", "Training, tryout, results and activity", "Active posts are plain Markdown in the guild language; result authority, evidence, activity quotas, promotion and lifecycle replies are controlled and audited.", { module: "sessions", priority: "P1", dependencies: ["RBAC-001", "COMP-001", "PROFILE-001"], acceptanceCriteria: ["no active embed", "TR/EN announcement and button language", "no Made By Fieel footer on active session posts", "reply lifecycle", "authority ceiling", "training activity review"], testRequirements: [...commonTest, "Turkish/English Markdown rendering test", "training/tryout live lifecycle", "authority persona test"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["src/paradise3a59.js", "test/paradise3a59.test.js"], blocker: "No isolated staging bot/runtime identity or safe staging deployment path is currently available.", nextExactAction: "Deploy only to isolated staging/the exact test guild; create Turkish and English training/tryout posts, press Lock/Unlock/End as authorized and unauthorized personas, then verify reply placement and no active-session footer.", securityRisk: "high" }),
  requirement("TICKET-001", "Ticket state machine and transcript-first delete", "Open/claimed/closed controls are state-aware. Close/reopen/delete, transcripts, retention, naming, logs and safe failure behavior use one backend state machine.", { module: "tickets", priority: "P1", dependencies: ["DB-001", "RBAC-001", "COMP-001", "BACKUP-001"], securityCritical: true, acceptanceCriteria: ["closed shows Reopen/Delete only", "delete creates transcript first", "failure blocks deletion", "senior staff-only delete confirmation", "staff-only transcript access"], testRequirements: [...commonTest, "state-aware control test", "close/reopen/delete/transcript failure live test"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["src/paradise3a59.js", "test/paradise3a59.test.js"], blocker: "No isolated staging bot/runtime identity or safe staging deployment path is currently available.", nextExactAction: "Deploy only to isolated staging/the exact test guild; prove Claim → Close → Reopen → Close → typed Delete and transcript-failure channel preservation with staff and member personas.", securityRisk: "critical" }),
  requirement("TICKET-002", "Ticket categories, command parity and optional appeal guild", "Commands match controls, template categories are configured, and optional appeal guild bridge remains disabled by default.", { module: "tickets", priority: "P2", dependencies: ["TICKET-001", "CMD-001"], ownerDecisionRequired: true, acceptanceCriteria: ["command/control parity", "category templates", "appeal bridge audited"], testRequirements: [...commonTest, "appeal visibility test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer after ticket state machine.", securityRisk: "high" }),
  requirement("VOICE-001", "Real Join-to-Create voice system", "Voice-purpose mappings must be real voice channels; temporary room state, controls, cleanup and wrong-type repair are safe and persistent.", { module: "voice", priority: "P1", dependencies: ["DB-001", "RBAC-001", "COMP-001", "SETUP-001"], acceptanceCriteria: ["wrong text mapping detected", "repair creates the correct voice type before any approved removal", "temporary room/move/cleanup works", "restart recovery", "owner-only repair"], testRequirements: [...commonTest, "voice type mismatch unit test", "voice type and temporary room live test"], sourceStatus: "LOCAL VERIFIED", localTestStatus: "LOCAL VERIFIED", evidencePath: ["src/paradise3a59.js", "src/discordBot.js", "test/paradise3a59.test.js"], blocker: "No isolated staging bot/runtime identity or safe staging deployment path is currently available.", nextExactAction: "Deploy only to isolated staging/the exact test guild; verify Join to Create, Community Voice and AFK are GuildVoice, then test move, control panel, empty cleanup and wrong-type repair preview.", securityRisk: "high" }),
  requirement("APP-001", "Appy-inspired application workflow", "Template-specific multi-step forms, draft expiry, review, role grants, website submission and audit use one shared queue.", { module: "applications", priority: "P2", dependencies: ["DB-001", "RBAC-001", "COMP-001"], acceptanceCriteria: ["5-input modal steps", "duplicate pending blocked", "approve/deny/more-info audit", "website and Discord same queue"], testRequirements: [...commonTest, "application live flow"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer after persistent component and DB foundation.", securityRisk: "high" }),
  requirement("RESELL-001", "Reseller and partner safe model", "Referral code, pending commission, fraud review, clawback and manual payout avoid raw key/customer data exposure.", { module: "reseller", priority: "P2", dependencies: ["APP-001", "BILLING-001", "AUTH-001"], ownerDecisionRequired: true, acceptanceCriteria: ["no raw key distribution", "hold/clawback", "manual payout approval"], testRequirements: [...commonTest, "self-referral/fraud test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until billing/legal owner decision.", securityRisk: "high" }),
  requirement("ROBUX-001", "Robux purchase ticket workflow", "Product selection, fee explanation, proof, fraud review, staff approval, license creation, Buyer role and transcript remain separate from Stripe billing.", { module: "payments", priority: "P2", dependencies: ["TICKET-001", "LIC-001", "RBAC-001"], acceptanceCriteria: ["AI cannot approve/issue", "proof/audit/transcript", "role after approval only"], testRequirements: [...commonTest, "safe mocked payment flow"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until ticket transaction and owner policy." , securityRisk: "critical"}),
  requirement("LINEUP-001", "Lineup, roster, mainer, war and relations", "Stored board IDs and complete command families update Main/Roster/War boards in place with audit, authority and consolidated channels.", { module: "clan", priority: "P2", dependencies: ["DB-001", "CMD-001", "RBAC-001", "PANEL-001"], acceptanceCriteria: ["add/remove/move/edit/clear/repost", "mainer canonical message", "war/spar audit"], testRequirements: [...commonTest, "board update-in-place test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until persisted board foundation.", securityRisk: "medium" }),
  requirement("XP-001", "XP, permissions and Daily Question", "Chat/voice XP, trusted media/link roles, board, anti-AFK and clan-only Daily Question with manual Robux queue are configurable and audited.", { module: "xp", priority: "P2", dependencies: ["DB-001", "RBAC-001", "OPS-001"], acceptanceCriteria: ["anti-spam/anti-AFK", "temporary level post", "trusted roles do not bypass scam checks", "daily reward no auto-pay"], testRequirements: [...commonTest, "XP/role reward/scheduled job test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until scheduler/persistence base.", securityRisk: "medium" }),
  requirement("EVENT-001", "Giveaway, event, tournament and Game Night", "Entry validation, host permissions, anti-alt, bracket progression, result correction and audit are enforced.", { module: "events", priority: "P2", dependencies: ["DB-001", "RBAC-001", "COMP-001"], acceptanceCriteria: ["winner validation", "bracket progression", "image preview", "reroll history"], testRequirements: [...commonTest, "event/tournament workflow test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until shared event state and components exist.", securityRisk: "medium" }),
  requirement("SOCIAL-001", "Social feeds and Fima update notices", "Official YouTube, Twitch, Kick and permitted TikTok feeds support delay, dedupe, health and role pings; verified Fima releases may announce once.", { module: "social", priority: "P2", dependencies: ["FLAG-001", "OPS-001", "BILLING-001"], ownerDecisionRequired: true, acceptanceCriteria: ["official/approved source only", "dedupe", "health", "rollback correction"], testRequirements: [...commonTest, "feed dedupe/scheduler test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer pending provider selection and release policy.", securityRisk: "medium" }),
  requirement("AI-001", "AI safety and community/ticket modes", "Approved knowledge, opt-in channels, rate/cost limits, redaction, escalation and kill switch govern AI.", { module: "ai", priority: "P2", dependencies: ["FLAG-001", "AUTH-001", "OPS-001"], ownerDecisionRequired: true, securityCritical: true, acceptanceCriteria: ["secret redaction", "staff escalation", "provider failure fallback", "kill switch"], testRequirements: [...commonTest, "redaction/escalation/limit test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until AI provider/consent owner decision.", securityRisk: "critical" }),
  requirement("AI-002", "AI knowledge base governance", "Draft/review/approve/publish/deprecate/rollback and response source logging ensure approved knowledge only.", { module: "ai", priority: "P2", dependencies: ["AI-001", "DB-001"], acceptanceCriteria: ["KB versioning", "staff log includes item/version", "raw conversations never auto-publish"], testRequirements: [...commonTest, "KB rollback/language test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until AI mode foundation.", securityRisk: "high" }),
  requirement("SEC-001", "Security, media/link/invite policy and moderation", "Quarantine, raid, lockdown, scam links/media, invite policy, utility commands, case approvals and audit are policy-driven.", { module: "security", priority: "P1", dependencies: ["RBAC-001", "LOG-001", "FLAG-001"], securityCritical: true, acceptanceCriteria: ["no unsafe auto-ban", "trusted roles do not bypass scans", "utility commands audit", "approval path works"], testRequirements: [...commonTest, "moderation persona/negative test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until RBAC/log base is integrated.", securityRisk: "critical" }),
  requirement("LOG-001", "Complete log taxonomy and retention", "Separate configurable logs, redaction, retention, viewers, correlation IDs and export policy cover Discord, billing, AI and setup events.", { module: "logging", priority: "P1", dependencies: ["DB-001", "RBAC-001", "CFG-001"], securityCritical: true, acceptanceCriteria: ["event schema per type", "redaction", "viewer checks", "retention policy"], testRequirements: [...commonTest, "sensitive payload redaction test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Create shared safe audit/log event envelope after config versioning.", securityRisk: "critical" }),
  requirement("BLACKLIST-001", "Blacklist, appeal and bail access", "BLACKLISTED users see only configured appeal route; staff review/evidence stays private; unblacklist restores only safe default access.", { module: "security", priority: "P2", dependencies: ["RBAC-001", "TICKET-001"], acceptanceCriteria: ["idempotent role add/remove", "visibility matrix", "appeal audit"], testRequirements: [...commonTest, "blacklisted persona test"], sourceStatus: "LOCAL VERIFIED", liveDiscordStatus: "LIVE DISCORD VERIFIED", evidencePath: ["artifacts/post-security-backlog/3a67-blacklist-appeal-bail-permissions.json"], nextExactAction: "Re-test after RBAC migration; preserve known behavior.", securityRisk: "high" }),
  requirement("WEB-001", "Public Paradise bot product website", "Landing, invite, command directory, docs, feedback, changelog, status, support, privacy, terms, AI disclosure and apply pages form the customer-facing product.", { module: "website", priority: "P2", dependencies: ["CMD-001", "AUTH-001", "BILLING-001"], acceptanceCriteria: ["searchable command directory", "feedback workflow", "no false live claims"], testRequirements: [...commonTest, "public route/accessibility test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until command registry and dashboard auth are reliable.", securityRisk: "medium" }),
  requirement("BILLING-001", "Paradise billing, VAT and legal gate", "Legal seller, VAT, currency, invoices, refunds, cancellation, chargebacks and subscription reconciliation are defined before paid plans activate.", { module: "billing", priority: "P2", ownerDecisionRequired: true, dependencies: ["LIC-001", "AUTH-001"], securityCritical: true, acceptanceCriteria: ["legal/tax approval", "webhook idempotency", "downgrade/reconciliation test"], testRequirements: [...commonTest, "billing lifecycle test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Blocked pending owner legal/tax and product activation decision.", securityRisk: "critical" }),
  requirement("LEGAL-001", "Privacy, retention and GDPR controls", "Privacy, terms, AI disclosure, data export/delete, retention, guild disconnect and provider disclosure are documented and enforceable.", { module: "legal", priority: "P2", ownerDecisionRequired: true, dependencies: ["DB-001", "LOG-001", "AI-001"], acceptanceCriteria: ["retention policies map to storage", "export/delete workflow", "AI disclosure"], testRequirements: [...commonTest, "privacy deletion/export test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer pending owner legal policy decision.", securityRisk: "high" }),
  requirement("OPS-002", "Scheduler, queues, performance and recovery", "Timezone-aware idempotent jobs, rate recovery, dead-letter queue, service objectives, encrypted backups and restore drills support multi-guild operation.", { module: "operations", priority: "P1", dependencies: ["ENV-002", "BACKUP-001", "OPS-001", "FLAG-001"], securityCritical: true, acceptanceCriteria: ["DST/missed-job policy", "queue health", "RPO/RTO", "restore drill"], testRequirements: [...commonTest, "scheduler DST/restart test", "load/recovery test"], sourceStatus: "SOURCE ONLY", nextExactAction: "Defer until environment and backup foundation pass.", securityRisk: "critical" }),
  requirement("MIGRATE-001", "Production migration matrix and reference audit", "KEEP/EDIT/REPOST/ARCHIVE/DELETE/CREATE decisions preserve important human content and prevent unapproved production rebuilds.", { module: "migration", priority: "P2", dependencies: ["BACKUP-001", "SETUP-001", "TPL-001"], ownerDecisionRequired: true, destructive: true, acceptanceCriteria: ["per-object matrix", "backup", "preview", "human/bot message distinction", "owner confirmation gate"], testRequirements: ["read-only audit", "preview review"], sourceStatus: "SOURCE ONLY", nextExactAction: "Deferred until compact templates and backup integrity are complete.", securityRisk: "critical" }),
  requirement("FIMAAPP-001", "Separate Fima desktop app backlog", "Fima GUI, key-screen clipping, FPS/MS, update center, auto-update, admin parity and release gate remain a linked but separate backlog.", { module: "fima-app", priority: "P2", ownerDecisionRequired: true, acceptanceCriteria: ["visual screenshot diff", "updater integrity", "release gate remains separate"], testRequirements: ["desktop UI regression suite", "license/macro soak"], sourceStatus: "SOURCE ONLY", nextExactAction: "Do not mix into Milestone 1; later read-only reference intake from owner-provided Fima assets.", securityRisk: "high" })
];

const decisions = [
  ["DEC-001", "Milestone 1 scope", "Freeze the listed foundation requirements; all later features remain deferred.", "PROVISIONAL", "Reversible"],
  ["DEC-002", "Test guild safe defaults", `Use only the verified test guild ${testGuild} for provisional non-production smoke work.`, "PROVISIONAL", "Reversible"],
  ["DEC-003", "Production naming concept", "Final Paradise visual/naming concept for production guilds.", "OWNER DECISION REQUIRED", "Production rename is externally visible"],
  ["DEC-004", "Production guild rebuild", "Any destructive Paradise/Fieel's Community/TSBTR rebuild.", "OWNER DECISION REQUIRED", "Destructive"],
  ["DEC-005", "Premium and billing activation", "Final prices, Stripe product creation, VAT/legal seller setup.", "OWNER DECISION REQUIRED", "Financial/legal"],
  ["DEC-006", "AI provider and consent", "Provider, cost ceiling, storage policy and production opt-in default.", "OWNER DECISION REQUIRED", "Privacy/cost"],
  ["DEC-007", "Retention policy", "Production transcript, log and attachment retention periods.", "OWNER DECISION REQUIRED", "Privacy/legal"],
  ["DEC-008", "Appeal guild", "Dedicated appeal guild enabled or disabled.", "OWNER DECISION REQUIRED", "Cross-guild workflow"],
  ["DEC-009", "Optional providers", "Kick/TikTok provider availability and music provider/roadmap choice.", "OWNER DECISION REQUIRED", "Provider/legal"],
  ["DEC-010", "RPO/RTO and storage", "Production backup retention, encryption location class and recovery targets.", "OWNER DECISION REQUIRED", "Operations"],
  ["DEC-011", "Public assets", "Generated banners/icons approved for production use.", "OWNER DECISION REQUIRED", "Public branding"],
  ["DEC-012", "Daily Question and Robux policy", "Enablement, reward amount and payout approval roles.", "OWNER DECISION REQUIRED", "Financial/community"]
].map(([decisionId, title, description, status, reason]) => ({ decisionId, title, description, status, reason, createdAt: now }));

const included = ["LIC-001", "ENV-001", "ENV-002", "AUTH-001", "CFG-001", "FLAG-001", "DB-001", "DB-002", "BACKUP-001", "OPS-001", "CMD-001", "RBAC-001", "COMP-001", "SETUP-001", "DASH-001", "TEST-001"];
const registry = {
  schemaVersion: 1,
  generatedAt: now,
  status: "LOCAL VERIFIED",
  authoritativeProgressSource: "artifacts/paradise-vnext/paradise-vnext-execution-matrix.json",
  sourcePlans: ["Paradise vNext consolidated plan", "Naming correction", "Final missing contracts", "Final execution safety and cutover contracts", "3A73 directive"],
  conflictResolutions: [
    { id: "CONFLICT-001", sources: ["early ticket panel", "final ticket contract"], resolution: "Closed ticket shows only Reopen and Delete; deletion is transcript-first and transcript failure blocks deletion." },
    { id: "CONFLICT-002", sources: ["early channel proposals", "compact channel and naming corrections"], resolution: "Use compact channel budgets and owner-selected premium readable naming; no generic emoji spam or corporate codes." },
    { id: "CONFLICT-003", sources: ["early footer use", "visual copy correction"], resolution: "Made By Fieel appears only on selected important static panels, never active sessions, welcome/leave or ticket state posts." },
    { id: "CONFLICT-004", sources: ["public command guide", "role-aware guide contract"], resolution: "Public help is member-safe; staff command guide is private, role-aware and template-aware." },
    { id: "CONFLICT-005", sources: ["embedded session posts", "owner explicit instruction"], resolution: "Training/Tryout active posts are plain Markdown; only configured result/static panels may be embeds." }
  ],
  requirements
};

const executionRows = requirements.map(item => ({
  requirementId: item.requirementId, module: item.module, priority: item.priority, milestone: item.milestone,
  dependencyIds: item.dependencies, ownerDecision: item.ownerDecisionRequired ? "OWNER DECISION REQUIRED" : null,
  sourceStatus: item.sourceStatus, localTestStatus: item.localTestStatus, deployStatus: item.deployStatus,
  liveDiscordStatus: item.liveDiscordStatus, dashboardBrowserStatus: item.dashboardBrowserStatus,
  evidencePath: item.evidencePath, blocker: item.blocker, nextExactAction: item.nextExactAction,
  affectedFiles: item.affectedFiles, affectedDatabaseTables: item.affectedDatabaseTables,
  affectedDiscordObjects: item.affectedDiscordObjects, rollbackMethod: item.rollbackMethod,
  securityRisk: item.securityRisk, acceptanceCriteria: item.acceptanceCriteria
}));

const matrix = {
  schemaVersion: 1,
  generatedAt: now,
  progressRule: "This is the only progress source of truth. Previous artifacts are evidence only and do not override a matrix row without re-verification.",
  selectionRule: "Before work, select the oldest incomplete unblocked dependency in Milestone 1; update the same row and avoid duplicate status artifacts.",
  statusSummary: {
    totalAcceptedRequirements: executionRows.length,
    sourceStatus: Object.fromEntries(["SOURCE ONLY", "LOCAL VERIFIED", "DEPLOYED", "LIVE VERIFIED", "BLOCKED", "FAILED"].map(status => [status, executionRows.filter(row => row.sourceStatus === status).length])),
    localTestStatus: Object.fromEntries(["SOURCE ONLY", "LOCAL VERIFIED", "BLOCKED", "FAILED"].map(status => [status, executionRows.filter(row => row.localTestStatus === status).length])),
    deployStatus: Object.fromEntries(["SOURCE ONLY", "DEPLOYED", "LIVE VERIFIED", "BLOCKED", "FAILED"].map(status => [status, executionRows.filter(row => row.deployStatus === status).length])),
    liveDiscordStatus: Object.fromEntries(["SOURCE ONLY", "LIVE DISCORD VERIFIED", "BLOCKED", "FAILED"].map(status => [status, executionRows.filter(row => row.liveDiscordStatus === status).length])),
    dashboardBrowserStatus: Object.fromEntries(["SOURCE ONLY", "DASHBOARD VERIFIED", "BROWSER VERIFIED", "BLOCKED", "FAILED"].map(status => [status, executionRows.filter(row => row.dashboardBrowserStatus === status).length])),
    blockedRows: executionRows.filter(row => row.sourceStatus === "BLOCKED" || row.localTestStatus === "BLOCKED" || row.deployStatus === "BLOCKED" || row.liveDiscordStatus === "BLOCKED" || row.dashboardBrowserStatus === "BLOCKED" || row.blocker).map(row => row.requirementId)
  },
  rows: executionRows
};

const milestone = {
  schemaVersion: 1,
  frozenAt: now,
  title: "PARADISE FOUNDATION AND SAFETY",
  status: "FROZEN",
  testGuildId: testGuild,
  includedRequirementIds: included,
  excludedDeferredRequirementIds: requirements.filter(item => !included.includes(item.requirementId)).map(item => item.requirementId),
  dependencyOrder: ["LIC-001", "ENV-001", "ENV-002", "AUTH-001", "CFG-001", "FLAG-001", "DB-001", "RBAC-001", "COMP-001", "BACKUP-001", "DB-002", "OPS-001", "CMD-001", "DASH-001", "SETUP-001", "TEST-001"],
  blockingOwnerDecisions: [],
  provisionalDefaults: ["Use the fixed test guild only for non-production smoke work.", "Keep high-risk features disabled until a later milestone enables them.", "Do not apply naming, billing, AI provider or production retention choices during Milestone 1."],
  definitionOfDone: ["Milestone requirements have source/local/deploy/live evidence or explicit BLOCKED status", "test guild guard denies non-allowed guilds", "safe config save/reload baseline is browser verified", "no production Discord mutation", "latest.json unchanged", "no desktop release created"],
  rollbackBoundary: "Milestone 1 may add additive configuration/audit/environment foundations only. Production migrations, paid Paradise billing, main guild rebuilds and public branding are outside the boundary."
};

const inventory = {
  schemaVersion: 1,
  capturedAt: now,
  status: "LOCAL VERIFIED",
  repository: { localCommit, dirtyWorktree: true, note: "Existing user changes in dashboard/public files and prior artifacts are preserved; this inventory does not claim they are part of the new foundation work." },
  runtimeEvidence: { deployedLicenseHotfix: "DEPLOYED", deployedLicenseHotfixCommitFromEvidence: "77fb4e7ceee322ae135b570602a7cdd86fae2ea3", observedProductionVersion, productionScan: "BLOCKED", browserCopyReveal: "BLOCKED", testGuildSmoke: "SOURCE ONLY", currentLocalTestCount: 115, latestJsonChanged: false, productionGuildsChanged: false },
  database: { provider: "PostgreSQL via Prisma", migrationState: "not queried in this local inventory", paradiseState: "Stored primarily in Setting key paradise_3a59_state_v1 with artifact JSON fallback", risk: "Critical Paradise state remains partly opaque JSON/fallback-based." },
  commandRegistration: { status: "LOCAL VERIFIED", evidence: ["src/paradiseCommandRegistry.js", "registry-backed guild command filtering", "registry-backed member /help and runtime denial"], gap: "Staging/test-guild command re-registration and real interaction proof remain BLOCKED until a safe deployment path exists." },
  rbac: { status: "LOCAL VERIFIED", evidence: ["src/paradiseRbac.js", "challenge autowin and approval now use shared referee permissions"], gap: "Role-persona proof in the exact test guild remains BLOCKED until a safe deployment path exists." },
  environment: { status: "partially implemented", evidence: ["src/env.js helpers", "NODE_ENV guards", "src/runtimeEnvironment.js", "exact test-guild assertions for setup/create-missing/rebuild/smoke"], gap: "Staging/production configuration separation and Render readiness evidence are not yet available." },
  configurationVersioning: { status: "partially implemented", evidence: ["src/paradiseConfigVersioning.js", "versioned Paradise dashboard config save"], gap: "History browsing and rollback UI are not implemented." },
  dashboard: { status: "partially implemented", evidence: ["Paradise dashboard route and APIs exist", "local dashboard tests exist"], gap: "Owner authenticated save/reload/CSRF browser proof is blocked; visual architecture still needs milestone work." },
  components: { status: "partially implemented", evidence: ["custom ID family dispatch exists in src/paradise3a59.js", "src/paradiseComponentProtocol.js"], gap: "Existing component families are not yet migrated to the versioned protocol." },
  backup: { status: "LOCAL VERIFIED", evidence: ["src/paradiseBackupIntegrity.js", "SHA256 backup envelope", "non-mutating restore dry-run"], gap: "Encrypted storage and an authorized staging restore drill remain BLOCKED." },
  reconciliation: { status: "LOCAL VERIFIED", evidence: ["src/paradiseReconciliation.js", "test-guild-only scheduled reconciliation summary", "no automatic Discord mutation"], gap: "A deployed test-guild canary run is BLOCKED until an isolated staging bot/runtime identity exists." },
  featureFlags: { status: "LOCAL VERIFIED", evidence: ["src/paradiseFeatureFlags.js", "test-guild-only command registry canary", "persisted guild featureFlags configuration"], gap: "Canary enable/disable proof after deploy remains BLOCKED." },
  testGuildGuard: { status: "LOCAL VERIFIED", evidence: ["PARADISE_TEST_GUILD_ID is fixed to the accepted guild", "centralized guarded setup/create-missing/rebuild/smoke"], gap: "Negative live proof for a non-allowed guild remains BLOCKED until a safe test deployment." },
  currentMilestoneClassification: executionRows.map(row => ({ requirementId: row.requirementId, status: included.includes(row.requirementId) ? row.sourceStatus : "DEFERRED" }))
};

const legacyFallbackPath = path.join(root, "artifacts", "post-security-backlog", "3a59-paradise-state-fallback.json");
const legacyProfileFallbackPath = path.join(root, "artifacts", "post-security-backlog", "3a59-verified-roblox-profiles.json");
let legacySource = {};
let legacySourceStatus = "fallback_absent";
for (const candidate of [legacyFallbackPath, legacyProfileFallbackPath]) {
  try {
    legacySource = JSON.parse(await fs.readFile(candidate, "utf8"));
    legacySourceStatus = path.basename(candidate);
    break;
  } catch {}
}
const legacyMigrationPreview = {
  schemaVersion: 1,
  generatedAt: now,
  status: "LOCAL VERIFIED",
  sourceInventory: buildParadiseLegacyStateInventory(legacySource),
  sourceStatus: legacySourceStatus,
  productionDbInspection: {
    status: "BLOCKED",
    reason: "No production database credential or owner-authenticated DB session was read for this local preview."
  },
  applyBlockedUntil: ["verified backup integrity", "production count comparison", "duplicate detection", "referential integrity check", "owner approval for destructive migration"],
  outputPolicy: "Counts and bucket mappings only; no profile, ticket, transcript, key or private message content is written."
};

const mdRows = executionRows.map(row => `| ${row.requirementId} | ${row.priority} | ${row.milestone} | ${row.sourceStatus} | ${row.localTestStatus} | ${row.deployStatus} | ${row.liveDiscordStatus} | ${row.dashboardBrowserStatus} | ${row.nextExactAction.replace(/\|/g, "/")} |`).join("\n");
const markdown = `# Paradise vNext Execution Matrix\n\nGenerated: ${now}\n\nThis file is a readable view of \`paradise-vnext-execution-matrix.json\`. The JSON matrix is authoritative.\n\n## Current status summary\n\n- Total accepted requirements: ${matrix.statusSummary.totalAcceptedRequirements}\n- SOURCE ONLY: ${matrix.statusSummary.sourceStatus["SOURCE ONLY"]}\n- LOCAL VERIFIED: ${matrix.statusSummary.sourceStatus["LOCAL VERIFIED"]}\n- DEPLOYED: ${matrix.statusSummary.sourceStatus.DEPLOYED}\n- LIVE DISCORD VERIFIED: ${matrix.statusSummary.liveDiscordStatus["LIVE DISCORD VERIFIED"]}\n- DASHBOARD VERIFIED: ${matrix.statusSummary.dashboardBrowserStatus["DASHBOARD VERIFIED"]}\n- BLOCKED rows: ${matrix.statusSummary.blockedRows.length}\n- FAILED rows: ${matrix.statusSummary.sourceStatus.FAILED + matrix.statusSummary.localTestStatus.FAILED + matrix.statusSummary.deployStatus.FAILED + matrix.statusSummary.liveDiscordStatus.FAILED + matrix.statusSummary.dashboardBrowserStatus.FAILED}\n\n| ID | Priority | Milestone | Source | Local | Deploy | Live Discord | Dashboard/Browser | Next action |\n|---|---|---|---|---|---|---|---|---|\n${mdRows}\n\n## Milestone 1 frozen scope\n\n${included.map(id => `- ${id}`).join("\n")}\n\n## Blocking owner decisions\n\n${milestone.blockingOwnerDecisions.map(id => { const d = decisions.find(x => x.decisionId === id); return `- ${id}: ${d.title}`; }).join("\n")}\n\n## Progress rule\n\nBefore work, read the JSON matrix, select the oldest incomplete unblocked dependency in Milestone 1, update the same row and avoid duplicate proof artifacts.\n`;

await fs.mkdir(outDir, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(outDir, "paradise-vnext-requirement-registry.json"), `${JSON.stringify(registry, null, 2)}\n`),
  fs.writeFile(path.join(outDir, "paradise-vnext-execution-matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`),
  fs.writeFile(path.join(outDir, "paradise-vnext-execution-matrix.md"), markdown),
  fs.writeFile(path.join(outDir, "paradise-vnext-owner-decisions.json"), `${JSON.stringify({ schemaVersion: 1, generatedAt: now, decisions }, null, 2)}\n`),
  fs.writeFile(path.join(outDir, "milestone-1-scope-freeze.json"), `${JSON.stringify(milestone, null, 2)}\n`),
  fs.writeFile(path.join(outDir, "milestone-1-current-state-inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`),
  fs.writeFile(path.join(outDir, "milestone-1-legacy-state-migration-preview.json"), `${JSON.stringify(legacyMigrationPreview, null, 2)}\n`)
]);

console.log(JSON.stringify({ requirements: requirements.length, milestoneOne: included.length, outDir }, null, 2));
