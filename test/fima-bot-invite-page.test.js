import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../public/fima-bot-invite.html", import.meta.url), "utf8");
const script = fs.readFileSync(new URL("../public/assets/js/fima-bot-invite.js", import.meta.url), "utf8");
const dashboardScript = fs.readFileSync(new URL("../public/assets/js/fima-bot-dashboard.js", import.meta.url), "utf8");

test("FIMA Bot invite uses a dedicated review page before Discord authorization", () => {
  assert.match(serverSource, /app\.get\("\/fima-bot\/invite", sendFimaBotInvitePage\)/u);
  assert.match(serverSource, /app\.get\("\/fima-bot\/invite\/authorize", redirectFimaBotInvite\)/u);
  assert.match(html, /data-fima-surface="invite"/u);
  assert.match(html, /Discord’a devam et/u);
  assert.match(html, /href="\/fima-bot\/invite\/authorize"/u);
  assert.doesNotMatch(html, /http-equiv=["']refresh|location\.replace|location\.assign/u);
});

test("invite handoff keeps optional server context constrained to a Discord guild id", () => {
  assert.match(serverSource, /if \(\/\^\\d\{16,22\}\$\/\.test\(guildId\)\) url\.searchParams\.set\("guild_id", guildId\)/u);
  assert.match(script, /if \(\/\^\\d\{16,22\}\$\/\.test\(guildId\) && action\)/u);
  assert.match(dashboardScript, /\/fima-bot\/invite\?guild=\$\{encodeURIComponent\(card\.guildId\)\}/u);
  assert.doesNotMatch(script, /localStorage|sessionStorage|document\.cookie|fetch\(/u);
});

test("invite page is accessible, responsive, and exposes no legacy visible brand", () => {
  assert.match(html, /class="skip-link" href="#main"/u);
  assert.match(html, /role="alert"/u);
  assert.match(html, /fima-design-system\.css/u);
  assert.doesNotMatch(html, />[^<]*(?:Paradise|PARADISE)[^<]*</u);
  assert.doesNotMatch(html, /(?:aria-label|alt|title|placeholder)=["'][^"']*(?:Paradise|PARADISE)/u);
});
