import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const appSource = fs.readFileSync(new URL("../public/assets/js/app.js", import.meta.url), "utf8");
const paradiseSource = fs.readFileSync(new URL("../public/paradise-bot.html", import.meta.url), "utf8");

test("standalone Paradise page is not collapsed into the marketing home route", () => {
  assert.match(paradiseSource, /<body[^>]+data-page=["']paradise-bot["']/u);
  assert.match(appSource, /const visibleSectionIds = pageSections\[page\];/u);
  assert.match(appSource, /if \(!visibleSectionIds\) \{[\s\S]*?classList\.remove\(["']page-section-hidden["']\)[\s\S]*?removeAttribute\(["']aria-hidden["']\)[\s\S]*?return;/u);
  assert.doesNotMatch(appSource, /pageSections\[page\]\s*\|\|\s*pageSections\.home/u);
});

test("known marketing routes still use the section visibility allowlist", () => {
  assert.match(appSource, /const visibleSections = new Set\(visibleSectionIds\);/u);
  assert.match(appSource, /section\.classList\.toggle\(["']page-section-hidden["'],\s*!isVisible\)/u);
  assert.match(appSource, /section\.setAttribute\(["']aria-hidden["'],\s*String\(!isVisible\)\)/u);
});
