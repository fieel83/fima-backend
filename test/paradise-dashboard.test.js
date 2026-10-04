import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { paradiseDashboardHtml } from "../src/paradiseDashboardHtml.js";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../src/paradiseDashboardHtml.js", import.meta.url), "utf8");
const applicationSource = fs.readFileSync(new URL("../public/assets/js/paradise-apply.js", import.meta.url), "utf8");
const applicationHtml = fs.readFileSync(new URL("../public/paradise-apply.html", import.meta.url), "utf8");
const contentStudioHtml = fs.readFileSync(new URL("../public/paradise-content-studio.html", import.meta.url), "utf8");
const publicConfigSource = fs.readFileSync(new URL("../public/assets/js/config.js", import.meta.url), "utf8");

test("Paradise dashboard client script parses", () => {
  const html = paradiseDashboardHtml({ clientId: "123", apiBaseUrl: "https://api.example.test", frontendUrl: "https://example.test" });
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
  assert.ok(script.length > 1000);
  assert.doesNotThrow(() => new Function(script));
});

test("rendered question normalization preserves letters and collapses whitespace", () => {
  const html = paradiseDashboardHtml({ clientId: "123" });
  const body = html.match(/function normalizeApplicationQuestionBuckets\(value\)\{([\s\S]*?)\nfunction normalizeApplicationEvidenceBuckets/)?.[1];
  assert.ok(body);
  const normalize = new Function("APPLICATION_EDITOR_TYPE_SET", "isApplicationMap", "safeApplicationKey", `return function(value){${body}`)(
    new Set(["helper"]), value => value && typeof value === "object" && !Array.isArray(value), value => String(value)
  );
  assert.deepEqual(normalize({ helper: { reason: "  Skills\tand   experience.  " } }), { helper: { reason: "Skills and experience." } });
  assert.match(html, /name="application-editor-question"/);
});

test("application dashboard separates Community, business and template-specific review workflows", () => {
  const applicationSection = htmlSource.match(/<section class="panel application-editor" data-page="applications" id="applicationEditor">[\s\S]*?<\/section>/u)?.[0] || "";
  assert.match(applicationSection, /Community applications cover Helper, Staff, Moderator, Support, events, content and FIMA product teams/u);
  assert.match(applicationSection, /Partnership, Creator and Reseller use a separate business workflow/u);
  assert.match(applicationSection, /clan and TSBTR servers expose their template-specific roles/u);
  assert.match(applicationSection, /Every website and Discord submission enters the same private review queue/u);
  assert.match(applicationSection, /Grant an explicitly mapped template-server role after authorized approval/u);
  assert.match(applicationSection, /placeholder="FIMA · APPLICATION CENTER"/u);
  assert.match(applicationSection, /placeholder="Apply"/u);
  for (const type of ["helper", "partnership", "creator", "reseller", "clan_mainer", "war_hoster"]) {
    assert.match(applicationSection, new RegExp(`option value="${type}"`, "u"));
  }
  assert.match(applicationSection, /Community and business applications are always review-only/u);
  assert.match(htmlSource, /applicationAutoGrant'\)\.checked=apps\.autoGrantRole!==false/u);
  assert.match(serverSource, /sanitizeParadiseApplicationSettings\(value, config\.applicationSettings\)/u);
});

test("Paradise dashboard preserves Unicode prefix matching in the rendered browser script", () => {
  const html = paradiseDashboardHtml({ clientId: "123", apiBaseUrl: "https://api.example.test", frontendUrl: "https://example.test" });
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "";
  assert.match(script, /\^\(\[\^\\p\{L\}\\p\{N\}\]\*\)\(\[\\s\\S\]\+\)\$/u);
  assert.match(script, /prefix=\/\^\[\^\\p\{L\}\\p\{N\}\]\*\/u/u);
  assert.doesNotMatch(script, /prefix=\/\^\[\^p\{L\}p\{N\}\]\*\/u/u);
});

test("FIMA dashboard requires the ready production owner binding", () => {
  assert.match(serverSource, /function resolvedParadiseOwnerDiscordId\(\)/);
  assert.match(serverSource, /binding\?\.ready === true \? String\(binding\.ownerDiscordId \|\| ""\)\.trim\(\) : ""/);
  assert.match(serverSource, /Boolean\(ownerDiscordId\) && access\.discordUserId === ownerDiscordId/);
  assert.match(serverSource, /owner_runtime_binding_unavailable/);
  assert.match(serverSource, /requireUser,\s*requireParadiseOwner/);
});

test("Paradise config writes require owner action header and trusted official origins", () => {
  assert.match(serverSource, /x-paradise-owner-action/);
  assert.match(serverSource, /isTrustedParadiseOrigin/);
  assert.match(serverSource, /frontendUrl\(\)/);
  assert.match(serverSource, /apiBaseUrl\(\)/);
  assert.match(serverSource, /origin_mismatch/);
  assert.match(serverSource, /invalid_brand_color/);
  assert.match(serverSource, /createParadiseConfigVersion/);
  assert.match(serverSource, /paradise_config_version_/);
  assert.match(serverSource, /changedPaths/);
  assert.match(serverSource, /"featureFlags"/);
  assert.match(serverSource, /normalizeParadiseFeatureFlags/);
  assert.match(serverSource, /\/api\/fima-bot\/config\/history/);
  assert.match(serverSource, /\/api\/fima-bot\/config\/rollback-preview/);
  assert.match(serverSource, /buildParadiseConfigRollbackPreview/);
  assert.match(serverSource, /\/api\/fima-bot\/reconciliation/);
  assert.match(serverSource, /buildParadiseReconciliation/);
  assert.match(serverSource, /summarizeParadiseReconciliation/);
  assert.match(serverSource, /reconciliationHealth/);
});

test("browser dashboard route is UI-first while API authorization remains JSON", () => {
  assert.match(serverSource, /app\.get\(\["\/paradise", "\/dashboard\/paradise"\]/);
  assert.match(serverSource, /app\.get\("\/paradise\/dashboard"[\s\S]{0,140}redirectLegacyFimaBotRoute\(req, res, "\/fima-bot\/dashboard"\)/);
  assert.match(contentStudioHtml, /href="\/fima-bot\/dashboard">Dashboard<\/a>/);
  assert.doesNotMatch(contentStudioHtml, /href="\/paradise\/dashboard"/);
  assert.match(serverSource, /paradiseFrontendRedirectUrl\(/);
  assert.match(serverSource, /requestHost:\s*req\.get\("host"\)/);
  assert.match(serverSource, /if \(frontendRedirect\) return res\.redirect\(302, frontendRedirect\)/);
  assert.match(serverSource, /app\.get\("\/api\/fima-bot\/session-status"/);
  assert.match(serverSource, /reasonCode:\s*"login_required"/);
  assert.match(htmlSource, /FIMA login required/);
  assert.match(htmlSource, /Discord account required/);
  assert.match(htmlSource, /FIMA access is restricted/);
  assert.match(htmlSource, /FIMA Owner Console/);
  assert.match(htmlSource, /FIMA Operations Console/);
  assert.match(htmlSource, /FT Community/);
  assert.match(htmlSource, /Invite FIMA to another server/);
  assert.match(htmlSource, /fima-safe-config\.json/);
  assert.doesNotMatch(htmlSource, /Paradise Owner Console|Paradise Operations Console|Invite Paradise|Paradise access is restricted|Paradise Clan/);
  assert.match(htmlSource, /API_BASE\+'\/api\/fima-bot\/config'/);
});

test("cross-subdomain dashboard requests use secure credentialed API fetches", () => {
  assert.match(htmlSource, /credentials:'include'/);
  assert.match(htmlSource, /API_BASE\+'\/api\/fima-bot\/config'/);
  assert.match(serverSource, /sameSite:\s*"lax"/);
  assert.match(serverSource, /secure:\s*apiBaseUrl\(\)\.startsWith\("https"\)/);
  assert.match(serverSource, /credentials:\s*true/);
});

test("dashboard mutations use CSRF protection and retry one expired token safely", () => {
  assert.match(htmlSource, /API_BASE\+'\/api\/csrf-token'/);
  assert.match(htmlSource, /'x-fima-csrf':token/);
  assert.match(htmlSource, /result\.error==='csrf_required'&&retry/);
  assert.match(serverSource, /csrfReady/);
});

test("application mutations use only the canonical CSRF header in executable code", () => {
  assert.match(applicationSource, /"x-fima-csrf": token/);
  assert.doesNotMatch(applicationSource, /"x-csrf-token": token/);
  assert.doesNotMatch(applicationHtml, /application\/x-fima-legacy/);
  assert.equal((applicationHtml.match(/paradise-apply\.js/g) || []).length, 1);
});

test("application page exposes one clear, progressively updated multi-role journey", () => {
  for (const id of ["journeyVerify", "journeyPrepare", "journeyReview"]) {
    assert.match(applicationHtml, new RegExp(`id="${id}"`));
  }
  assert.match(applicationHtml, /Yalnız özel staff incelemesi/);
  assert.match(applicationHtml, /FIMA SAFE/);
  assert.match(applicationSource, /function setJourneyStage\(stage\)/);
  assert.match(applicationSource, /setJourneyStage\("prepare"\)/);
  assert.match(applicationSource, /setJourneyStage\("review"\)/);
});

test("application submit stays locked until answers and required evidence are ready", () => {
  assert.match(applicationSource, /let submissionPending = false/);
  assert.match(applicationSource, /!disabledContextReason\(context\)/);
  assert.match(applicationSource, /form\.checkValidity\(\)/);
  assert.match(applicationSource, /validateEvidenceSelection\(\{ quiet: true \}\)/);
  assert.match(applicationSource, /submitButton\.disabled = submissionPending \|\| !ready/);
  assert.match(applicationSource, /submissionPending = true;\s*submitButton\.disabled = true/);
  assert.match(applicationSource, /submissionPending = false;\s*const code = error\.body\?\.error \|\| error\.message/);
});

test("local browser verification stays on the loopback API without changing the production default", () => {
  assert.match(publicConfigSource, /fimaLoopbackHost/);
  assert.match(publicConfigSource, /window\.location\.origin/);
  assert.match(publicConfigSource, /https:\/\/api\.fimamacro\.com/);
  assert.match(applicationSource, /loopbackHost/);
  assert.match(applicationSource, /defaultApiBase = loopbackHost \? window\.location\.origin/);
  assert.match(applicationSource, /error\.status === 401/);
  assert.match(applicationSource, /FIMA hesabına giriş gerekli/);
});

test("multi-server owner console scopes reads and writes to a managed guild", () => {
  assert.match(htmlSource, /id="serverSelect"/);
  assert.match(htmlSource, /id="serverWorkspaceList" role="listbox"/);
  assert.match(htmlSource, /id="serverSearch" type="search"/);
  assert.match(htmlSource, /data-managed-guild=/);
  assert.match(htmlSource, /managed\.some\(server=>server\.id===guildId\)/);
  assert.match(htmlSource, /aria-current=/);
  assert.match(htmlSource, /No managed server online/);
  assert.match(htmlSource, /guildId:selectedGuildId/);
  assert.match(serverSource, /paradiseDiscordGuildsSnapshot/);
  assert.match(serverSource, /invalid_or_unmanaged_guild/);
  assert.match(serverSource, /state\.guildConfigs/);
});

test("guild-first dashboard opens on the server directory and keeps workspace chrome hidden", () => {
  assert.match(htmlSource, /<section class="panel server-directory" id="serverDirectory">/);
  assert.match(htmlSource, /<section class="hero workspace-topbar" id="workspaceHero" hidden>/);
  assert.match(htmlSource, /<div class="console-shell" id="workspaceShell" hidden>/);
  assert.match(htmlSource, /id="serverDirectorySearch"/);
  assert.match(htmlSource, /id="serverDirectoryGrid" role="listbox"/);
  assert.match(htmlSource, /id="serverDirectoryCount" aria-live="polite"/);
  assert.match(htmlSource, /aria-busy="true"/);
  assert.match(htmlSource, /id="backToServers"/);
  assert.match(htmlSource, /let currentPayload=null,selectedGuildId='',csrfPromise=null,currentTheme='paradise',selectorLookups=\{channels:\{\},roles:\{\}\},workspaceEntered=false,currentPage='overview'/);
  assert.match(htmlSource, /byId\('serverDirectory'\)\.hidden=workspaceEntered/);
  assert.match(htmlSource, /byId\('workspaceHero'\)\.hidden=!workspaceEntered/);
  assert.match(htmlSource, /byId\('workspaceShell'\)\.hidden=!workspaceEntered/);
});

test("guild directory has premium states, roving keyboard focus and a retry path", () => {
  assert.match(htmlSource, /function bindListboxKeyboard\(list,selector\)/);
  assert.match(htmlSource, /\['ArrowDown','ArrowUp','Home','End'\]/);
  assert.match(htmlSource, /tabindex="'\+\(index===0\?'0':'-1'\)\+'"/);
  assert.match(htmlSource, /function renderServerDirectoryState\(kind,message\)/);
  assert.match(htmlSource, /id="retryServerDirectory"/);
  assert.match(htmlSource, /renderServerDirectoryState\('error','Check your connection and try again\.'\)/);
  assert.match(htmlSource, /\.server-card:focus-visible,.workspace-option:focus-visible/);
  assert.match(htmlSource, /\.server-state-spinner/);
});

test("guild-first dashboard enters only a managed guild and can return to the directory", () => {
  assert.match(htmlSource, /async function enterWorkspace\(guildId,page='overview'\)/);
  assert.match(htmlSource, /if\(!managed\.some\(server=>server\.id===guildId\)\)return leaveWorkspace\(\)/);
  assert.match(htmlSource, /selectedGuildId=guildId;workspaceEntered=true;currentPage=page/);
  assert.match(htmlSource, /function leaveWorkspace\(\)\{[\s\S]*?workspaceEntered=false;selectedGuildId='';currentPage='overview'/);
  assert.match(htmlSource, /function leaveWorkspace\(\)\{\s*clearProductionPlan\(/);
  assert.match(htmlSource, /byId\('backToServers'\)\.onclick=leaveWorkspace/);
  assert.match(htmlSource, /data-directory-guild=/);
  assert.match(htmlSource, /button\.onclick=\(\)=>enterWorkspace\(button\.dataset\.directoryGuild\)/);
});

test("guild-first dashboard preserves an authorized guild/page route without accepting an API default", () => {
  assert.match(htmlSource, /function readDashboardRoute\(\)/);
  assert.match(htmlSource, /\/\^\\d\{16,22\}\$\/\.test\(params\.get\('guild'\)\|\|''\)/);
  assert.match(htmlSource, /page:params\.get\('page'\)\|\|'overview'/);
  assert.match(htmlSource, /const hash=workspaceEntered&&selectedGuildId\?'guild='\+encodeURIComponent\(selectedGuildId\)\+'&page='\+encodeURIComponent\(currentPage\):''/);
  assert.match(htmlSource, /const requestedGuildId=workspaceEntered\?selectedGuildId:''/);
  assert.match(htmlSource, /if\(workspaceEntered&&!managedServers\.some\(server=>server\.id===requestedGuildId\)\)\{leaveWorkspace\(\)\}else if\(workspaceEntered\)\{selectedGuildId=requestedGuildId\}/);
  assert.doesNotMatch(htmlSource, /selectedGuildId\s*=\s*j\.selectedGuildId/);
});

test("owner console exposes the persistent guild mutation lease without owner tokens", () => {
  assert.match(htmlSource, /id="mutationLockStatus"/);
  assert.match(htmlSource, /acquiring:lease\.acquiring/);
  assert.match(htmlSource, /correlationId:lease\.correlationId/);
  assert.match(htmlSource, /recoveryReason:lease\.recoveryReason/);
  assert.match(serverSource, /paradisePersistentMutationLockStatus\(selectedGuildId\)/);
  assert.doesNotMatch(htmlSource, /ownerToken/);
});

test("customer workspace discovery is separate from the owner console and requires Manage Guild/Admin", () => {
  assert.match(serverSource, /scope", "identify email guilds"/);
  assert.match(serverSource, /app\.get\("\/api\/fima-bot\/customer\/workspaces", requireUser/);
  assert.doesNotMatch(serverSource.match(/app\.get\("\/api\/fima-bot\/customer\/workspaces"[\s\S]{0,240}/)?.[0] || "", /requireParadiseOwner/);
  assert.match(serverSource, /paradiseCustomerWorkspaceAccess/);
  assert.match(serverSource, /discord_reauthorization_required/);
  assert.match(serverSource, /buildParadiseCustomerWorkspaceCards/);
});

test("customer workspace route remains guild-scoped and never reuses the owner console guard", () => {
  const route = serverSource.match(/app\.get\("\/api\/fima-bot\/customer\/workspaces\/:guildId"[\s\S]{0,1700}/)?.[0] || "";
  assert.match(route, /requireUser/);
  assert.doesNotMatch(route, /requireParadiseOwner/);
  assert.match(route, /workspaceAccess\.cards\.find/);
  assert.match(route, /guild_not_authorized/);
  assert.match(serverSource, /buildParadiseCustomerWorkspaceView/);
});

test("customer workspace write is guild-scoped, CSRF-protected by the shared middleware and persists state/version/audit atomically", () => {
  const route = serverSource.match(/app\.patch\("\/api\/fima-bot\/customer\/workspaces\/:guildId\/config"[\s\S]{0,4400}/)?.[0] || "";
  assert.match(route, /requireUser/);
  assert.doesNotMatch(route, /requireParadiseOwner/);
  assert.match(route, /workspaceAccess\.cards\.find/);
  assert.match(route, /guild_not_authorized/);
  assert.match(route, /bot_invite_required/);
  assert.match(route, /normalizeParadiseCustomerWorkspacePatch/);
  assert.match(route, /createParadiseConfigVersion/);
  assert.match(route, /prisma\.\$transaction/);
  assert.match(route, /paradise_customer_workspace_saved/);
  assert.match(serverSource, /requireCsrfForCookieMutations/);
});

test("Paradise dashboard is noindex and never renders a bot token", () => {
  assert.match(htmlSource, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(htmlSource, /DISCORD_BOT_TOKEN|botToken|token\s*:/i);
});

test("Paradise dashboard exposes a live HEX embed color control", () => {
  assert.match(htmlSource, /brandPicker/);
  assert.match(htmlSource, /data-save="branding"/);
  assert.match(htmlSource, /--brand/);
  assert.match(htmlSource, /FIMA Violet/);
  assert.match(htmlSource, /Charcoal/);
  assert.match(htmlSource, /Midnight/);
});

test("Paradise dashboard exposes explained operations fields and live Discord state", () => {
  for (const expected of [
    "channelMappings", "topSize", "top10Range", "codeExpiryMinutes", "loaMaxDays",
    "checkEveryHours", "mentionSpamLimit", "Danger zone", "runtimeStatus", "roleMappings",
    "Guide & handbook repost", "Relations board settings", "TSBTR setup", "FIMA"
  ]) assert.match(htmlSource, new RegExp(expected));
  assert.match(serverSource, /paradiseDiscordRuntimeSnapshot/);
  assert.match(serverSource, /invalid_channel_mappings/);
  assert.match(serverSource, /invalid_role_mappings/);
  assert.match(serverSource, /repostParadiseGuides/);
  assert.match(htmlSource, /Challenge transcripts \(private\)/);
  assert.match(htmlSource, /Support transcripts \(private\)/);
  assert.match(htmlSource, /Roster, lineup & mainer boards/);
  assert.match(htmlSource, /Blacklist, appeals & bail policy/);
});

test("FIMA Bot identity panel separates supported profile sync from application-name remediation", () => {
  const rendered = paradiseDashboardHtml({ clientId: "123", apiBaseUrl: "https://api.example.test", frontendUrl: "https://example.test" });
  const allowlistFunction = rendered.match(/function safeDiscordDeveloperPortalUrl\(value\)\{[\s\S]*?\n\}/u)?.[0] || "";
  const safeDiscordDeveloperPortalUrl = new Function(`${allowlistFunction};return safeDiscordDeveloperPortalUrl`)();
  assert.match(htmlSource, /id="fimaBotIdentityPanel"/u);
  assert.match(htmlSource, /The Discord bot-token API cannot change the application name/u);
  assert.match(htmlSource, /id="fimaBotDeveloperPortalLink"[^>]+rel="noopener noreferrer"[^>]+hidden/u);
  assert.equal(safeDiscordDeveloperPortalUrl("https://discord.com/developers/applications/12345678901234567/information"), "https://discord.com/developers/applications/12345678901234567/information");
  assert.equal(safeDiscordDeveloperPortalUrl("https://discord.example/developers/applications/12345678901234567/information"), null);
  assert.equal(safeDiscordDeveloperPortalUrl("https://discord.com/developers/applications/12345678901234567/information?redirect=evil"), null);
  assert.match(htmlSource, /const FIMA_BOT_PROFILE_CONFIRMATION='APPLY FIMA BOT PROFILE'/u);
  assert.match(htmlSource, /id="applyFimaBotProfile"[^>]+disabled/u);
  assert.match(htmlSource, /fimaBotProfileConfirmation'\)\.addEventListener\('input',updateFimaBotProfileApplyState\)/u);
  assert.match(htmlSource, /mutate\('\/api\/fima-bot\/actions\/fima-bot-profile',\{apply:true,confirmation\}\)/u);
  assert.match(htmlSource, /await loadFimaBotProfileStatus\(\)/u);
  assert.doesNotMatch(htmlSource, /application name (?:was )?(?:updated|changed) automatically/iu);
});

test("3A61 dashboard exposes Turkish UI, animated premium controls and real audit actions", () => {
  assert.match(htmlSource, /id="uiLanguage"/);
  assert.match(htmlSource, /Türkçe/);
  assert.match(htmlSource, /ambientDrift/);
  assert.match(htmlSource, /::-webkit-scrollbar-thumb/);
  assert.match(htmlSource, /runRealAudit/);
  assert.match(htmlSource, /runStructureBackup/);
  assert.match(htmlSource, /runSetupPreview/);
  assert.match(serverSource, /\/api\/fima-bot\/actions\/audit/);
  assert.match(serverSource, /\/api\/fima-bot\/actions\/backup/);
  assert.match(serverSource, /\/api\/fima-bot\/actions\/preview/);
});

test("3A64 dashboard is split into twenty-one understandable operation pages", () => {
  const pages = [...htmlSource.matchAll(/data-page-button="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(pages, [
    "overview", "channels", "roles", "roster", "leaderboard",
    "moderation", "blacklist", "challenge", "events", "xp", "applications", "tickets",
    "operations", "availability", "voice", "servers", "setup", "guides", "branding", "logs", "advanced"
  ]);
  for (const page of pages) assert.match(htmlSource, new RegExp(`data-page="${page}"`));
  for (const kind of ["staffOperations", "applications", "moderation", "events", "voice", "xp"]) {
    assert.match(htmlSource, new RegExp(`data-save="${kind}"`));
    assert.match(serverSource, new RegExp(`"${kind}"`));
  }
  assert.match(htmlSource, /Auto-detect channels \(preview only\)/);
  assert.match(htmlSource, /datalist id=/);
  assert.match(serverSource, /syncParadisePanelsFromDashboard/);
  assert.doesNotMatch(htmlSource, /<section class="panel">/);
  for (const action of [
    "previewSelectedSetup", "createMissingSetup", "repostSelectedGuides",
    "repairSelectedPermissions", "startSelectedSetup"
  ]) assert.match(htmlSource, new RegExp(`id="${action}"`));
  assert.match(serverSource, /\/api\/fima-bot\/actions\/create-missing/);
  assert.match(serverSource, /\/api\/fima-bot\/actions\/rebuild-test-template/);
  assert.match(serverSource, /\/api\/fima-bot\/actions\/run-test-smoke/);
  assert.match(serverSource, /\/api\/fima-bot\/actions\/run-test-rehearsal/);
  assert.match(htmlSource, /id="testRebuildConfirmation"/);
  assert.match(htmlSource, /id="rebuildTestTemplate"/);
  assert.match(htmlSource, /id="runTestSmoke"/);
  assert.match(htmlSource, /id="testRehearsalConfirmation"/);
  assert.match(htmlSource, /id="runTestRehearsal"/);
  assert.match(htmlSource, /REBUILD TEST/);
  assert.match(htmlSource, /REHEARSE TEST COMMUNITY/);
  assert.match(htmlSource, /two smoke runs passed/);
  assert.match(serverSource, /test_guild_only/);
});

test("production FT Community rebuild is bound to the owner UI with immutable preflight evidence", () => {
  assert.match(serverSource, /\/api\/fima-bot\/actions\/rebuild-fima-community\/status/);
  assert.match(serverSource, /\/api\/fima-bot\/actions\/rebuild-fima-community\/preflight/);
  assert.match(serverSource, /\/api\/fima-bot\/actions\/rebuild-fima-community/);
  assert.match(serverSource, /requireUser,\s*requireParadiseOwner/);
  assert.match(serverSource, /x-paradise-owner-action/);
  assert.match(serverSource, /mode !== "community"/);
  assert.match(serverSource, /production_community_only/);
  assert.match(serverSource, /guildId !== FIMA_COMMUNITY_PRODUCTION_GUILD_ID \|\| guildId === PARADISE_TEST_GUILD_ID/);
  assert.match(serverSource, /production_guild_only/);
  assert.match(serverSource, /consumeParadiseProductionRebuildPlan\(\{/);
  assert.match(serverSource, /ownerUserId: req\.user\.id/);
  assert.match(serverSource, /rebuildFimaCommunityProductionFromDashboard\(mode, guildId, confirmation, \{[\s\S]*?executionProof,[\s\S]*?planId,/);
  assert.match(serverSource, /finishParadiseProductionRebuildPlan\(\{/);
  assert.match(serverSource, /production_preflight_backup_digest_required/);
  assert.match(serverSource, /production_preflight_backup_digest_mismatch/);
  assert.match(serverSource, /\/api\/fima-bot\/actions\/rebuild-test-template/);
  assert.match(htmlSource, /Main servers cannot be rebuilt here/);
  assert.match(htmlSource, /\/api\/fima-bot\/actions\/recover-test-rollback/);
  assert.match(htmlSource, /\/api\/fima-bot\/actions\/rebuild-fima-community\/preflight/);
  assert.match(htmlSource, /\/api\/fima-bot\/actions\/rebuild-fima-community\/status/);
  assert.match(htmlSource, /mutate\('\/api\/fima-bot\/actions\/rebuild-fima-community',\{mode:'community',guildId:selectedGuildId,planId,backupDigest,confirmation\}\)/);
  assert.match(htmlSource, /plan\.requiredConfirmation/);
  assert.match(htmlSource, /plan\.backup\?\.digest/);
  assert.match(htmlSource, /productionPlan\.planId/);
  assert.match(htmlSource, /id="productionExecutionArmed" type="checkbox"/);
  assert.match(htmlSource, /id="productionConfirmation"/);
  assert.match(htmlSource, /byId\('recoverTestRollback'\)\.onclick=recoverSelectedTestRollback/);
  assert.match(htmlSource, /byId\('createProductionPreflight'\)\.onclick=createProductionPreflight/);
  assert.match(htmlSource, /byId\('executeProductionRebuild'\)\.onclick=executeProductionRebuild/);
  assert.doesNotMatch(htmlSource, /productionConfirmation[^\n]{0,160}value\s*=\s*productionPlan\?\.requiredConfirmation/);
  assert.doesNotMatch(htmlSource, /CONFIRM\s+REBUILD\s+FT\s+COMMUNITY/);
  assert.doesNotMatch(htmlSource, /[\u00c3\u00c2\u00c5][\u0080-\u00bf]|\ufffd/u);
});

test("FIMA dashboard groups navigation and keeps its mobile page selector synchronized", () => {
  const headings = [
    "Overview", "Community", "Moderation", "Operations", "Engagement", "Voice", "Configuration"
  ];
  for (const heading of headings) assert.ok(htmlSource.includes(`<summary>${heading}</summary>`));
  assert.equal((htmlSource.match(/<details class="nav-group"/g) || []).length, headings.length);
  assert.match(htmlSource, /<details class="nav-group" open><summary>Overview<\/summary>/);
  assert.match(htmlSource, /button\.closest\('\.nav-group'\)\?\.setAttribute\('open',''\)/);
  assert.match(htmlSource, /class="nav-brand"/);
  assert.match(htmlSource, /class="nav-foot"/);
  assert.match(htmlSource, /id="mobilePageSelect"/);
  assert.match(htmlSource, /const buttons=\[\.\.\.document\.querySelectorAll\('\[data-page-button\]'\)\]/);
  assert.match(htmlSource, /mobileSelect\.innerHTML=buttons\.map\(button=>/);
  assert.match(htmlSource, /mobileSelect\.onchange=event=>showPage\(event\.target\.value\)/);
  assert.match(htmlSource, /if\(mobileSelect\)mobileSelect\.value=page/);
  assert.match(htmlSource, /class="panel overview-lead" data-page="overview"/);
  assert.match(htmlSource, /class="overview-health"/);
  assert.match(htmlSource, /function setUiText\(id,source\)/);
  assert.match(htmlSource, /element\.dataset\.enText=source/);
  assert.match(htmlSource, /function translateUiSource\(source,lang\)/);
  assert.match(htmlSource, /function syncMobilePageLabels\(\)/);
  assert.match(htmlSource, /function applyPageButtonLabels\(lang\)/);
  assert.match(htmlSource, /PAGE_LABELS_TR\[button\.dataset\.pageButton\]/);
  assert.match(htmlSource, /\.metric span\[data-en-text\]/);
  assert.match(htmlSource, /<span data-en-text=/);
  assert.match(htmlSource, /escapeHtml\(tUi\(label\)\)/);
  assert.match(htmlSource, /setUiText\('accessTitle','FIMA login required'\)/);
  assert.match(htmlSource, /\.hero-brandline div span,.nav-brand div span,.mobile-page-picker>span,.page-kicker,.nav-group summary/);
  assert.match(htmlSource, /label,option,\.overview-health,.nav-foot/);
  for (const translated of [
    "Yönetim merkezi", "Yapı", "Rekabet ve ekip", "Topluluk operasyonları", "Yayınlama", "Sistem",
    "Owner yönetim merkezi", "Owner çalışma alanı", "Geçerli çalışma alanı", "Canlı yönetim merkezi", "Owner kontrolleri korumalı",
    "Güvenli owner oturumu", "Değişiklikler işlem kilidiyle korunur", "Yönetilen sunucular", "Açık meydan okumalar"
  ]) assert.match(htmlSource, new RegExp(translated));
});

test("FIMA bot keeps its brand mark visible in the compact header", () => {
  const botPage = fs.readFileSync(new URL("../public/paradise-bot.html", import.meta.url), "utf8");
  assert.match(botPage, /\.bot-brand>span:last-child\{display:none\}/);
  assert.doesNotMatch(botPage, /\.bot-brand span\{display:none\}/);
});

test("all application types use a bucket-preserving visual question editor with JSON compatibility", () => {
  for (const expected of [
    'id="applicationQuestionType"',
    'id="applicationQuestionList"',
    'id="addApplicationQuestion"',
    'class="application-question"',
    'data-direction="-1"',
    'data-direction="1"',
    'class="remove-question ghost"',
    'class="ghost duplicate-question"',
    'value="optional"',
    'value="required"'
  ]) assert.match(htmlSource, new RegExp(expected));
  const advancedSection = htmlSource.match(
    /<details[^>]*class="application-advanced"[^>]*>[\s\S]*?<\/details>/u
  )?.[0];
  assert.ok(advancedSection, "advanced application settings section should exist");
  assert.match(advancedSection, /id="applicationQuestions"/u);
  assert.match(advancedSection, /id="applicationEvidenceRequirements"/u);
  assert.match(htmlSource, /function normalizeApplicationQuestionBuckets\(value\)/u);
  assert.match(htmlSource, /const source=nested\?value:\{helper:value\}/u);
  assert.match(htmlSource, /applicationQuestionBuckets\[selectedApplicationType\]=questions/u);
  assert.match(htmlSource, /delete applicationQuestionBuckets\[selectedApplicationType\]/u);
  assert.match(htmlSource, /applicationQuestionRows=applicationRowsForType\(\)/u);
  assert.match(htmlSource, /function syncApplicationJson\(\)/u);
  assert.match(htmlSource, /extraQuestions:JSON\.parse\(byId\('applicationQuestions'\)\.value\|\|'\{\}'\)/u);
  assert.match(htmlSource, /evidenceRequirements:JSON\.parse\(byId\('applicationEvidenceRequirements'\)\.value\|\|'\{\}'\)/u);
  assert.match(htmlSource, /applicationQuestionRows\.length>=20/u);
  assert.match(htmlSource, /escapeHtml\(row\.key\)/u);
  assert.match(htmlSource, /escapeHtml\(row\.label\)/u);
  assert.match(htmlSource, /draggable="true"/u);
  assert.match(htmlSource, /addEventListener\('drop'/u);
});

test("FIMA dashboard guides expose publishing guardrails and accessible search feedback", () => {
  assert.match(htmlSource, /id="guideResultCount"[^>]+role="status"[^>]+aria-live="polite"/u);
  assert.match(htmlSource, /aria-label="Publishing safeguards"/u);
  assert.match(htmlSource, /Draft safely/u);
  assert.match(htmlSource, /Owner approval/u);
  assert.match(htmlSource, /Test guild first/u);
  assert.match(htmlSource, /function filterGuides\(\)/u);
  assert.match(htmlSource, /function updateGuideResultCount\(\)/u);
  assert.match(htmlSource, /:focus-visible/u);
  assert.match(htmlSource, /prefers-reduced-motion:reduce/u);
});

test("destructive Paradise setup requires a typed final confirmation", () => {
  const paradiseSource = fs.readFileSync(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(paradiseSource, /paradise_setup_final/);
  assert.match(paradiseSource, /REBUILD TEST \$\{mode\.toUpperCase\(\)\}/);
  assert.match(paradiseSource, /destructive \? "rebuild" : "repair"/);
});
