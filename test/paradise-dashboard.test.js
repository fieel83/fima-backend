import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { paradiseDashboardHtml } from "../src/paradiseDashboardHtml.js";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../src/paradiseDashboardHtml.js", import.meta.url), "utf8");

test("Paradise dashboard client script parses", () => {
  const html = paradiseDashboardHtml({ clientId: "123", apiBaseUrl: "https://api.example.test", frontendUrl: "https://example.test" });
  const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1] || "";
  assert.ok(script.length > 1000);
  assert.doesNotThrow(() => new Function(script));
});

test("Paradise dashboard requires the exact linked Discord owner ID", () => {
  assert.match(serverSource, /PARADISE_OWNER_DISCORD_ID\s*=\s*"762858334440521739"/);
  assert.match(serverSource, /discordUserId === PARADISE_OWNER_DISCORD_ID/);
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
  assert.match(serverSource, /\/api\/paradise\/config\/history/);
  assert.match(serverSource, /\/api\/paradise\/config\/rollback-preview/);
  assert.match(serverSource, /buildParadiseConfigRollbackPreview/);
  assert.match(serverSource, /\/api\/paradise\/reconciliation/);
  assert.match(serverSource, /buildParadiseReconciliation/);
});

test("browser dashboard route is UI-first while API authorization remains JSON", () => {
  assert.match(serverSource, /app\.get\(\["\/paradise", "\/dashboard\/paradise"\]/);
  assert.match(serverSource, /isParadiseApiHost\(req\.hostname\)/);
  assert.match(serverSource, /res\.redirect\(302, `\$\{frontendUrl\(\)\}\/paradise`\)/);
  assert.match(serverSource, /app\.get\("\/api\/paradise\/session-status"/);
  assert.match(serverSource, /reasonCode:\s*"login_required"/);
  assert.match(htmlSource, /Fima login required/);
  assert.match(htmlSource, /Discord account required/);
  assert.match(htmlSource, /Paradise access is restricted/);
});

test("cross-subdomain dashboard requests use secure credentialed API fetches", () => {
  assert.match(htmlSource, /credentials:'include'/);
  assert.match(htmlSource, /API_BASE\+'\/api\/paradise\/config'/);
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

test("multi-server owner console scopes reads and writes to a managed guild", () => {
  assert.match(htmlSource, /id="serverSelect"/);
  assert.match(htmlSource, /guildId:selectedGuildId/);
  assert.match(serverSource, /paradiseDiscordGuildsSnapshot/);
  assert.match(serverSource, /invalid_or_unmanaged_guild/);
  assert.match(serverSource, /state\.guildConfigs/);
});

test("customer workspace discovery is separate from the owner console and requires Manage Guild/Admin", () => {
  assert.match(serverSource, /scope", "identify email guilds"/);
  assert.match(serverSource, /app\.get\("\/api\/paradise\/customer\/workspaces", requireUser/);
  assert.doesNotMatch(serverSource.match(/app\.get\("\/api\/paradise\/customer\/workspaces"[\s\S]{0,240}/)?.[0] || "", /requireParadiseOwner/);
  assert.match(serverSource, /paradiseCustomerWorkspaceAccess/);
  assert.match(serverSource, /discord_reauthorization_required/);
  assert.match(serverSource, /buildParadiseCustomerWorkspaceCards/);
});

test("Paradise dashboard is noindex and never renders a bot token", () => {
  assert.match(htmlSource, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(htmlSource, /DISCORD_BOT_TOKEN|botToken|token\s*:/i);
});

test("Paradise dashboard exposes a live HEX embed color control", () => {
  assert.match(htmlSource, /brandPicker/);
  assert.match(htmlSource, /data-save="branding"/);
  assert.match(htmlSource, /--brand/);
  assert.match(htmlSource, /Paradise Purple/);
  assert.match(htmlSource, /Charcoal/);
  assert.match(htmlSource, /Midnight/);
});

test("Paradise dashboard exposes explained operations fields and live Discord state", () => {
  for (const expected of [
    "channelMappings", "topSize", "top10Range", "codeExpiryMinutes", "loaMaxDays",
    "checkEveryHours", "mentionSpamLimit", "Danger zone", "runtimeStatus", "roleMappings",
    "Guide & handbook repost", "Relations board settings", "TSBTR setup", "Fieel's Community"
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

test("3A61 dashboard exposes Turkish UI, animated premium controls and real audit actions", () => {
  assert.match(htmlSource, /id="uiLanguage"/);
  assert.match(htmlSource, /Türkçe/);
  assert.match(htmlSource, /ambientDrift/);
  assert.match(htmlSource, /::-webkit-scrollbar-thumb/);
  assert.match(htmlSource, /runRealAudit/);
  assert.match(htmlSource, /runStructureBackup/);
  assert.match(htmlSource, /runSetupPreview/);
  assert.match(serverSource, /\/api\/paradise\/actions\/audit/);
  assert.match(serverSource, /\/api\/paradise\/actions\/backup/);
  assert.match(serverSource, /\/api\/paradise\/actions\/preview/);
});

test("3A64 dashboard is split into twenty-one understandable operation pages", () => {
  const pages = [...htmlSource.matchAll(/data-page-button="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(pages, [
    "overview", "servers", "setup", "channels", "roles", "challenge", "leaderboard", "availability",
    "operations", "applications", "tickets", "moderation", "blacklist", "roster",
    "events", "voice", "xp", "guides", "branding", "logs", "advanced"
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
  assert.match(serverSource, /\/api\/paradise\/actions\/create-missing/);
  assert.match(serverSource, /\/api\/paradise\/actions\/rebuild-test-template/);
  assert.match(serverSource, /\/api\/paradise\/actions\/run-test-smoke/);
  assert.match(htmlSource, /id="testRebuildConfirmation"/);
  assert.match(htmlSource, /id="rebuildTestTemplate"/);
  assert.match(htmlSource, /id="runTestSmoke"/);
  assert.match(htmlSource, /REBUILD TEST/);
  assert.match(serverSource, /test_guild_only/);
});

test("destructive Paradise setup requires a typed final confirmation", () => {
  const paradiseSource = fs.readFileSync(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(paradiseSource, /paradise_setup_final/);
  assert.match(paradiseSource, /REBUILD \$\{mode\.toUpperCase\(\)\}/);
  assert.match(paradiseSource, /destructive \? "rebuild" : "repair"/);
});
