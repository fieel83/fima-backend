import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const htmlSource = fs.readFileSync(new URL("../public/paradise-content-studio.html", import.meta.url), "utf8");
const clientSource = fs.readFileSync(new URL("../public/assets/js/paradise-content-studio.js", import.meta.url), "utf8");
const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const botSource = fs.readFileSync(new URL("../src/discordBot.js", import.meta.url), "utf8");

test("Content Studio client parses as standalone JavaScript", () => {
  assert.doesNotThrow(() => new Function(clientSource));
});

test("Content Studio exposes the complete owner workflow", () => {
  for (const id of [
    "accessGate", "studio", "guildSelect", "documentList", "newDocument",
    "importChannelId", "importMessageId", "importMessage",
    "versionList", "documentName", "deliveryMode", "contentStage", "lineageStatus", "targetChannelId", "targetMessageId",
    "messageContent", "embedsList", "addEmbed", "overwriteConfirmation", "saveDocument",
    "previewShell", "validatePreview", "publishConfirmation", "publishMessage"
  ]) assert.match(htmlSource, new RegExp(`id="${id}"`), `missing ${id}`);
  assert.match(htmlSource, /data-preset="outfits"/);
  assert.match(htmlSource, /data-preset="capes"/);
  assert.match(htmlSource, /data-preview-mode="desktop"/);
  assert.match(htmlSource, /data-preview-mode="mobile"/);
  assert.match(htmlSource, /PUBLISH TEST CONTENT/);
  assert.match(htmlSource, /Outfits/);
  assert.match(htmlSource, /Capes/);
  assert.match(htmlSource, /Captured read-only from the real owner messages/i);
  assert.match(clientSource, /verified Discord source loaded/);
  assert.match(clientSource, /Original snapshot will remain immutable/);
});

test("Content Studio browser flow uses every safe API and optimistic revision", () => {
  for (const route of [
    "/api/paradise/content-studio/save",
    "/api/paradise/content-studio/rollback",
    "/api/paradise/content-studio/import",
    "/api/paradise/content-studio/preview",
    "/api/paradise/content-studio/publish"
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
  assert.doesNotMatch(clientSource, /Number\(raw\.color\)\.toString\(16\)/);
  assert.doesNotMatch(clientSource, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(htmlSource, /(?:id|name)="[^"]*webhook(?:url|token)|(?:id|name)="[^"]*(?:url|token)[^"]*webhook/i);
});

test("Content Studio server keeps writes owner-only, revision-safe, and test-guild-only", () => {
  const start = serverSource.indexOf('app.get("/api/paradise/content-studio"');
  assert.ok(start >= 0);
  const block = serverSource.slice(start, start + 14_000);
  assert.match(block, /requireUser,\s*requireParadiseOwner/);
  assert.match(block, /requireParadiseContentStudioRevision/);
  assert.match(block, /expectedStateUpdatedAt/);
  assert.match(block, /PUBLISH TEST CONTENT/);
  assert.match(block, /PARADISE_TEST_GUILD_ID/);
  assert.match(block, /content_source_export_required/);
  assert.match(block, /publishParadiseContentMessage/);
  assert.match(botSource, /assertParadiseTestGuildMutation/);
  assert.match(botSource, /content_studio_publish/);
  assert.match(botSource, /managedContentStudioWebhook/);
});
