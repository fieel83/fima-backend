import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../src/paradiseDashboardHtml.js", import.meta.url), "utf8");

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

test("Paradise dashboard is noindex and never renders a bot token", () => {
  assert.match(htmlSource, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(htmlSource, /DISCORD_BOT_TOKEN|botToken|token\s*:/i);
});

test("Paradise dashboard exposes a live HEX embed color control", () => {
  assert.match(htmlSource, /brandPicker/);
  assert.match(htmlSource, /data-save="branding"/);
  assert.match(htmlSource, /--brand/);
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
});

test("destructive Paradise setup requires a typed final confirmation", () => {
  const paradiseSource = fs.readFileSync(new URL("../src/paradise3a59.js", import.meta.url), "utf8");
  assert.match(paradiseSource, /paradise_setup_final/);
  assert.match(paradiseSource, /REBUILD \$\{mode\.toUpperCase\(\)\}/);
  assert.match(paradiseSource, /destructive \? "rebuild" : "repair"/);
});
