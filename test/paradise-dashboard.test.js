import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const htmlSource = fs.readFileSync(new URL("../src/paradiseDashboardHtml.js", import.meta.url), "utf8");

test("Paradise dashboard requires the exact linked Discord owner ID", () => {
  assert.match(serverSource, /providerSubject:\s*"762858334440521739"/);
  assert.match(serverSource, /requireUser,\s*requireParadiseOwner/);
});

test("Paradise config writes require owner action header and same-origin validation", () => {
  assert.match(serverSource, /x-paradise-owner-action/);
  assert.match(serverSource, /origin_mismatch/);
});

test("Paradise dashboard is noindex and never renders a bot token", () => {
  assert.match(htmlSource, /noindex,nofollow,noarchive/);
  assert.doesNotMatch(htmlSource, /DISCORD_BOT_TOKEN|botToken|token\s*:/i);
});
