import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { FT_COMMUNITY_VISUAL_ASSET_PATHS } from "../src/ftCommunityVisualAssets.js";

const htmlSource = fs.readFileSync(new URL("../public/paradise-content-studio.html", import.meta.url), "utf8");
const clientSource = fs.readFileSync(new URL("../public/assets/js/paradise-content-studio.js", import.meta.url), "utf8");
const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const botSource = fs.readFileSync(new URL("../src/discordBot.js", import.meta.url), "utf8");

test("Content Studio client parses as standalone JavaScript", () => {
  assert.doesNotThrow(() => new Function(clientSource));
});

test("Studio session and CSRF use the account API origin with credentials", async () => {
  const base = clientSource.match(/  const API_BASE = [^\n]+/)[0];
  const helper = clientSource.slice(clientSource.indexOf("  async function api("), clientSource.indexOf("  async function csrf("));
  for (const configured of [undefined, "https://api-staging.fimamacro.test///"]) {
    const calls = [];
    const context = vm.createContext({
      window: { FIMA_API_BASE_URL: configured },
      fetch: async (url, options) => {
        calls.push({ url, options });
        return { ok: true, json: async () => ({ ownerAuthorized: true }) };
      }
    });
    vm.runInContext(base + "\n" + helper, context);
    await vm.runInContext('api("/api/fima-bot/session-status")', context);
    await vm.runInContext('api("/api/csrf-token")', context);
    const origin = configured ? "https://api-staging.fimamacro.test" : "https://api.fimamacro.com";
    assert.deepEqual(calls.map(call => call.url), [origin + "/api/fima-bot/session-status", origin + "/api/csrf-token"]);
    for (const call of calls) {
      assert.equal(call.options.credentials, "include");
      assert.equal(call.options.cache, "no-store");
    }
  }
});

test("Content Studio and Embed Builder share a no-store shell with guarded data APIs", () => {
  const handlerStart = serverSource.indexOf("function sendFimaBotContentStudio");
  const handlerBlock = serverSource.slice(handlerStart, handlerStart + 900);
  assert.match(handlerBlock, /Cache-Control", "no-store"/);
  assert.match(handlerBlock, /X-Robots-Tag", "noindex, nofollow, noarchive"/);
  assert.match(handlerBlock, /paradise-content-studio\.html/);
  const apiRoutes = serverSource.split('\n').filter(line => /app\.(get|post)\("\/api\/fima-bot\/content-studio/.test(line));
  assert.ok(apiRoutes.length >= 10);
  for (const route of apiRoutes) assert.match(route, /requireUser, requireParadiseOwner/);

  assert.match(handlerBlock, /app\.get\(\["\/fima-bot\/content-studio", "\/paradise-content-studio", "\/paradise-content-studio\.html"\], sendFimaBotContentStudio\)/);
  assert.match(handlerBlock, /app\.get\("\/fima-bot\/embed-builder", sendFimaBotContentStudio\)/);
});

test("shared content workspace selects one accessible page mode and safe auth return path", () => {
  assert.match(htmlSource, /data-content-workspace="content-studio" href="\/fima-bot\/content-studio"/);
  assert.match(htmlSource, /data-content-workspace="embed-builder" href="\/fima-bot\/embed-builder"/);
  assert.match(clientSource, /window\.location\.pathname === "\/fima-bot\/embed-builder"/);
  assert.match(clientSource, /document\.body\.dataset\.fimaContentView = pageMode/);
  assert.match(clientSource, /if \(active\) link\.setAttribute\("aria-current", "page"\)/);
  assert.match(clientSource, /else link\.removeAttribute\("aria-current"\)/);
  assert.match(clientSource, /encodeURIComponent\(currentPath\)/);
  assert.match(clientSource, /byId\("loginLink"\)\.href = `\/login\?returnTo=\$\{encodedReturnTo\}`/);
  assert.match(clientSource, /byId\("discordLink"\)\.href = `\/auth\/discord\/start\?returnTo=\$\{encodedReturnTo\}`/);
  assert.match(clientSource, /document\.title = "FIMA Embed Builder"/);
  assert.match(clientSource, /configurePageMode\(\);\s*bindEvents\(\)/);
});

test("Content Studio stays library-only while Embed Builder keeps editor and preview", () => {
  assert.match(htmlSource, /body\[data-fima-content-view="content-studio"\] \.editor-panel,body\[data-fima-content-view="content-studio"\] \.preview-panel\{display:none\}/);
  assert.match(htmlSource, /body\[data-fima-content-view="content-studio"\] \.workspace\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(htmlSource, /body\[data-fima-content-view="embed-builder"\] \.workspace\{grid-template-columns:minmax\(270px,310px\) minmax\(500px,1fr\) minmax\(350px,\.78fr\)\}/);
  assert.match(htmlSource, /id="guildSelect"/);
});

test("Content Studio sources contain no common UTF-8 mojibake", () => {
  const commonMojibake = /(?:â€¦|â€”|â€“|â€™|â€œ|â€|Ã[\x80-\xBF]|Â[\x80-\xBF])/u;
  assert.doesNotMatch(htmlSource, commonMojibake);
  assert.doesNotMatch(clientSource, commonMojibake);
});

test("Content Studio exposes the complete owner workflow", () => {
  for (const id of [
    "accessGate", "studio", "guildSelect", "documentList", "newDocument",
    "importChannelId", "importMessageId", "importMessage", "archiveStatus", "archiveMessage", "importArchiveMessage",
    "versionList", "documentName", "deliveryMode", "contentStage", "lineageStatus", "targetChannelId", "targetMessageId",
    "messageContent", "embedsList", "addEmbed", "overwriteConfirmation", "saveDocument",
    "previewShell", "validatePreview", "publishConfirmation", "publishMessage"
  ]) assert.match(htmlSource, new RegExp(`id="${id}"`), `missing ${id}`);
  assert.match(htmlSource, /data-preset="outfits"/);
  assert.match(htmlSource, /data-preset="capes"/);
  assert.match(htmlSource, /data-ft-content-starter="fake-headless"/);
  assert.match(htmlSource, /data-ft-content-starter="fieel-info"/);
  assert.match(htmlSource, /data-preview-mode="desktop"/);
  assert.match(htmlSource, /data-preview-mode="mobile"/);
  assert.match(htmlSource, /PUBLISH TEST CONTENT/);
  assert.match(htmlSource, /Outfits/);
  assert.match(htmlSource, /Capes/);
  assert.match(htmlSource, /Captured read-only from the real owner messages/i);
  assert.match(htmlSource, /Read-only archive import/i);
  assert.match(htmlSource, /never restores, sends, edits or deletes Discord content automatically/i);
  assert.match(clientSource, /verified Discord source loaded/);
  assert.match(clientSource, /Original snapshot will remain immutable/);
  assert.match(htmlSource, /data-fima-design-system="teal-obsidian"/);
  assert.match(htmlSource, /class="panel library-panel"/);
  assert.match(htmlSource, /class="panel editor-panel"/);
  assert.match(htmlSource, /Library → Editor → Publish/);
});

test("Content Studio includes cleaned Fake Headless and Fieel Info starter drafts", () => {
  for (const id of ["fake-headless", "fieel-info"]) {
    assert.match(htmlSource, new RegExp(`data-ft-content-starter="${id}"`));
  }
  for (const sourceUrl of [
    "medal.tv/de/games/roblox/clips/mfqULk9pcDzFuJNT0",
    "drive.google.com/file/d/1AbGdsXa5u65xp5MWcivZy1-L_KaI2v-Y",
    "drive.google.com/file/d/14FbefwxTTGoUDsNxYaoATT8hrYpgwFe9",
    "drive.google.com/file/d/1F1qV-HasRsK1nZy8p9GRLs1KYUx-fcWV",
    "guns.lol/fieel",
    "tiktok.com/@fieel_",
    "youtube.com/@fieel83"
  ]) assert.ok(clientSource.includes(sourceUrl), `missing source link ${sourceUrl}`);
  assert.match(clientSource, /function loadFtContentStarter\(id\)/);
  assert.match(clientSource, /querySelectorAll\("\[data-ft-content-starter\]"\)/);
  assert.match(clientSource, /metadata:\s*Object\.freeze\(\{ starterKind: "ft_content" \}\)/);
  assert.match(clientSource, /stage:\s*"starter_draft"/);
  assert.match(clientSource, /originalSnapshot:\s*null/);
});

test("Content Studio browser flow uses every safe API and optimistic revision", () => {
  for (const route of [
    "/api/fima-bot/content-studio/save",
    "/api/fima-bot/content-studio/rollback",
    "/api/fima-bot/content-studio/import",
    "/api/fima-bot/content-studio/archive",
    "/api/fima-bot/content-studio/archive/import",
    "/api/fima-bot/content-studio/preview",
    "/api/fima-bot/content-studio/publish"
  ]) assert.match(clientSource, new RegExp(route.replaceAll("/", "\\/")));
  assert.match(clientSource, /expectedStateUpdatedAt:\s*studioState\.updatedAt/);
  assert.match(clientSource, /"x-paradise-owner-action":\s*"1"/);
  assert.match(clientSource, /"x-fima-csrf":\s*await csrf\(\)/);
  assert.match(clientSource, /function formatEmbedColor\(rawColor\)/);
  assert.match(clientSource, /Number\.isInteger\(rawColor\)/);
  assert.match(clientSource, /formatEmbedColor\(raw\.color\)/);
  assert.match(clientSource, /stage:\s*byId\("contentStage"\)\.value/);
  assert.match(clientSource, /originalSnapshot:\s*currentOriginalSnapshot/);
  assert.match(clientSource, /importStatus:\s*currentImportStatus/);
  assert.match(clientSource, /content_message_not_owned_by_bot/);
  assert.match(clientSource, /content_message_not_owned_by_managed_webhook/);
  assert.match(clientSource, /content_source_export_required/);
  assert.match(clientSource, /currentImportStatus\s*!==\s*"pending_source_export"/);
  assert.match(clientSource, /function loadContentArchive\(guildId\)/);
  assert.match(clientSource, /function importArchiveMessage\(\)/);
  assert.match(clientSource, /restorePolicy\s*===\s*"content_studio_import_only"/);
  assert.match(clientSource, /record\.automaticRestore\s*===\s*false/);
  const readOnlyPostStart = clientSource.indexOf("async function ownerReadOnlyPost");
  const readOnlyPostEnd = clientSource.indexOf("\n  }", readOnlyPostStart) + 4;
  const readOnlyPostBlock = clientSource.slice(readOnlyPostStart, readOnlyPostEnd);
  assert.match(readOnlyPostBlock, /"x-fima-csrf":\s*await csrf\(\)/);
  assert.doesNotMatch(readOnlyPostBlock, /x-paradise-owner-action/);
  assert.doesNotMatch(clientSource, /Number\(raw\.color\)\.toString\(16\)/);
  assert.doesNotMatch(clientSource, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(htmlSource, /(?:id|name)="[^"]*webhook(?:url|token)|(?:id|name)="[^"]*(?:url|token)[^"]*webhook/i);
});

test("Content Studio offers the fixed FT visual library without weakening publish payloads", () => {
  for (const [tag, assetPath] of Object.entries(FT_COMMUNITY_VISUAL_ASSET_PATHS.tags)) {
    assert.ok(clientSource.includes(assetPath), `Content Studio tag ${tag} drifted from the canonical manifest path`);
  }
  assert.doesNotMatch(clientSource, /tag-[a-z-]+-v1\.png|tag-\$\{id\}-v1\.png/);
  for (const [category, assetPath] of Object.entries(FT_COMMUNITY_VISUAL_ASSET_PATHS.categories)) {
    assert.ok(clientSource.includes(assetPath), `Content Studio category ${category} drifted from the canonical manifest path`);
  }
  assert.match(clientSource, /allowedLocalVisualPaths\.has\(normalized\)/);
  assert.match(clientSource, /ftPreviewStorageKey\s*=\s*"fima\.contentStudio\.ftPreviewVisuals\.v1"/);
  assert.match(clientSource, /window\.localStorage\.getItem\(ftPreviewStorageKey\)/);
  assert.match(clientSource, /window\.localStorage\.setItem\(ftPreviewStorageKey/);
  assert.match(clientSource, /function normalizeFtPreviewVisual\(raw\)/);
  assert.match(clientSource, /function loadFtPreviewVisuals\(documentId\)/);
  assert.match(clientSource, /function persistFtPreviewVisuals\(documentId/);
  assert.match(clientSource, /const previewVisuals = saved \? loadFtPreviewVisuals\(document\.id\) : \[\]/);
  assert.match(clientSource, /Preview-only assets/);
  assert.match(clientSource, /discord forum-tag icons or arbitrary webhook data/i);
  assert.match(clientSource, /editorCard\?\.dataset\.previewThumbnail/);
  assert.match(clientSource, /editorCard\?\.dataset\.previewTag/);
  assert.doesNotMatch(clientSource, /embed\.(?:tag|forumTag|webhook)|webhookUrl|webhookToken/);
  for (const group of ["Identity & accent", "Title & message", "Banner & thumbnail", "Footer & time", "Fields"]) {
    assert.match(clientSource, new RegExp(group.replaceAll("&", "\\&")));
  }
  assert.match(clientSource, /Message text/);
  assert.match(clientSource, /Banner \/ image URL \(HTTPS\)/);
  assert.match(htmlSource, /\.ft-visual-library/);
  assert.match(htmlSource, /\.embed-editor-group/);
  assert.match(htmlSource, /\.preview-tag-badge/);
});

test("Content Studio opens every canonical FT banner as one unsaved starter draft", () => {
  const bannerPaths = {
    welcome: "ft-community-welcome-v5.png",
    leave: "ft-community-leave-v5.png",
    rules: "ft-community-rules-v5.png",
    staff: "ft-community-staff-v5.png",
    "video-team": "ft-community-video-team-v5.png",
    announcement: "ft-community-announcement-v5.png",
    leaderboard: "ft-community-leaderboard-v5.png",
    booster: "ft-community-booster-v5.png"
  };
  for (const [id, filename] of Object.entries(bannerPaths)) {
    assert.match(htmlSource, new RegExp(`type="button" data-ft-banner-starter="${id}"`));
    assert.ok(clientSource.includes(`https://fimamacro.com/assets/images/discord/v5/${filename}`));
  }
  assert.match(htmlSource, /class="ft-banner-starter-grid"/);
  assert.match(htmlSource, /@media\(max-width:760px\)[\s\S]*?\.ft-banner-starter-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(clientSource, /function loadFtBannerStarter\(id\)/);
  assert.match(clientSource, /applyDocument\(starter\)/);
  assert.match(clientSource, /stage:\s*"starter_draft"/);
  assert.match(clientSource, /source:\s*"starter"/);
  assert.match(clientSource, /importStatus:\s*"not_applicable"/);
  assert.match(clientSource, /originalSnapshot:\s*null/);
  assert.match(clientSource, /targetChannelId:\s*""/);
  assert.match(clientSource, /targetMessageId:\s*""/);
  assert.match(clientSource, /embeds:\s*Object\.freeze\(\[embed\]\)/);
  assert.match(clientSource, /querySelectorAll\("\[data-ft-banner-starter\]"\)/);
});

test("Content Studio server keeps writes owner-only, revision-safe, and test-guild-only", () => {
  const start = serverSource.indexOf('app.get("/api/fima-bot/content-studio"');
  assert.ok(start >= 0);
  const block = serverSource.slice(start, start + 14_000);
  assert.match(block, /requireUser,\s*requireParadiseOwner/);
  assert.match(block, /requireParadiseContentStudioRevision/);
  assert.match(block, /expectedStateUpdatedAt/);
  assert.match(block, /PUBLISH TEST CONTENT/);
  assert.match(block, /PARADISE_TEST_GUILD_ID/);
  assert.match(block, /content_source_export_required/);
  assert.match(block, /publishParadiseContentMessage/);
  assert.match(block, /withParadiseGuildMutationLease/);
  assert.match(block, /content_studio_publish/);
  assert.match(block, /phase:\s*"discord_published_state_pending"/);
  assert.match(block, /reconciliation:\s*\{[\s\S]*required:\s*true/);
  assert.match(botSource, /assertParadiseTestGuildMutation/);
  assert.match(botSource, /content_studio_publish/);
  assert.match(botSource, /managedContentStudioWebhook/);
});

test("Content Studio archive source is owner-only, checksum validated, and Discord read-only", () => {
  const listStart = serverSource.indexOf('app.get("/api/fima-bot/content-studio/archive"');
  const importStart = serverSource.indexOf('app.post("/api/fima-bot/content-studio/archive/import"');
  const liveImportStart = serverSource.indexOf('app.post("/api/fima-bot/content-studio/import"');
  assert.ok(listStart >= 0);
  assert.ok(importStart > listStart);
  assert.ok(liveImportStart > importStart);
  const listBlock = serverSource.slice(listStart, serverSource.indexOf("\n});", listStart) + 4);
  const importBlock = serverSource.slice(importStart, serverSource.indexOf("\n});", importStart) + 4);
  const block = `${listBlock}\n${importBlock}`;
  assert.match(block, /requireUser,\s*requireParadiseOwner/);
  assert.match(block, /readParadiseContentArchiveBackup/);
  assert.match(block, /listParadiseContentArchive/);
  assert.match(block, /importParadiseContentArchiveMessage/);
  assert.doesNotMatch(block, /paradiseContentStudioOwnerMutationAllowed/);
  assert.doesNotMatch(block, /paradiseDiscordContentMessage|publishParadiseContentMessage|withParadiseGuildMutationLease/);
});
