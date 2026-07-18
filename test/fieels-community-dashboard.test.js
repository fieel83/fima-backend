import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const htmlSource = fs.readFileSync(path.join(root, "src", "paradiseDashboardHtml.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "public", "assets", "js", "paradise-community-structure.js"), "utf8");
const serverSource = fs.readFileSync(path.join(root, "src", "server.js"), "utf8");

test("Community dashboard client parses as standalone JavaScript", () => {
  assert.doesNotThrow(() => new Function(clientSource));
});

test("Community dashboard exposes every safe planning control", () => {
  for (const id of [
    "communityNamingLanguage",
    "communityCategoryFrame",
    "communityRoleSeparatorStyle",
    "communityImportantMarker",
    "communityNormalMarker",
    "communityPrivateMarker",
    "communityTextSeparator",
    "communityVoiceStyle",
    "communityStructureSafety",
    "communityDesktopPreview",
    "communityMobilePreview",
    "communityMappingPreview",
    "communityRolePreview",
    "communityPersonaPreview",
    "communityOperationStatus",
    "previewCommunityStructure",
    "saveCommunityStructureDraft",
    "applyCommunityTestGuild",
    "compareCommunityStructure",
    "renameExistingCommunity",
    "rollbackCommunityStructure"
  ]) {
    assert.match(htmlSource, new RegExp(`id=["']${id}["']`), `missing ${id}`);
  }
  assert.match(htmlSource, /src=["']\/assets\/js\/paradise-community-structure\.js["']/);
});

test("Community planning routes stay owner-only, test-guild-bound and mutation-free", () => {
  const start = serverSource.indexOf('app.get("/api/paradise/community-structure"');
  const end = serverSource.indexOf('app.get("/api/paradise/config/history"', start);
  assert.ok(start >= 0, "Community route block should exist");
  assert.ok(end > start, "Community route block should end before config history");
  const block = serverSource.slice(start, end);

  assert.match(block, /requireUser,\s*requireParadiseOwner/);
  assert.match(block, /operation === "apply_test_guild" && !isTestGuild/);
  assert.match(block, /mutationExecuted:\s*false/);
  assert.doesNotMatch(block, /\.channels\.create\s*\(/);
  assert.doesNotMatch(block, /\.roles\.create\s*\(/);
  assert.doesNotMatch(block, /\.delete\s*\(/);
  assert.doesNotMatch(block, /createMissingParadiseTemplateFromDashboard/);
  assert.doesNotMatch(block, /rebuildParadiseTestTemplateFromDashboard/);
});

test("Community client labels test apply as a plan, never a live mutation", () => {
  assert.match(clientSource, /mutationExecuted/);
  assert.match(clientSource, /Discord mutation remains stopped/);
  assert.match(clientSource, /No Discord roles or channels were changed/);
  assert.match(clientSource, /apply_test_guild/);
});
