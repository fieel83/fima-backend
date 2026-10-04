import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  FIMA_BOT_IDENTITY,
  FIMA_BOT_PUBLIC_ROUTE_ALIASES,
  FIMA_BOT_SLASH_COMMAND_METADATA,
  canonicalFimaBotProductId,
  fimaBotApiCompatibility,
  publicFimaBotIdentity,
  rewriteFimaBotApiUrl
} from "../src/fimaBotIdentity.js";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const discordBotSource = fs.readFileSync(new URL("../src/discordBot.js", import.meta.url), "utf8");

test("FIMA Bot is canonical while legacy product identifiers remain accepted", () => {
  assert.equal(FIMA_BOT_IDENTITY.displayName, "FIMA Bot");
  assert.equal(canonicalFimaBotProductId("fima-bot"), "fima-bot");
  assert.equal(canonicalFimaBotProductId("paradise"), "fima-bot");
  assert.equal(canonicalFimaBotProductId("Paradise-Bot"), "fima-bot");
  assert.equal(canonicalFimaBotProductId("fima-macro"), "fima-macro");

  const publicIdentity = publicFimaBotIdentity();
  assert.equal(publicIdentity.productId, "fima-bot");
  assert.equal(publicIdentity.canonical.productPage, "/fima-bot");
  assert.equal(publicIdentity.canonical.dashboard, "/fima-bot/dashboard");
  assert.equal(publicIdentity.canonical.apiPrefix, "/api/fima-bot");
  assert.equal(publicIdentity.displayName, "FIMA Bot");
  assert.equal(JSON.stringify(publicIdentity).includes("Paradise"), false);
  assert.equal(Object.hasOwn(publicIdentity, "legacy"), false);
});

test("legacy API URLs safely reuse the canonical FIMA Bot handlers", () => {
  assert.equal(rewriteFimaBotApiUrl("/api/paradise"), "/api/fima-bot");
  assert.equal(rewriteFimaBotApiUrl("/api/paradise/public-status"), "/api/fima-bot/public-status");
  assert.equal(
    rewriteFimaBotApiUrl("/api/paradise/customer/workspaces?guild=synthetic"),
    "/api/fima-bot/customer/workspaces?guild=synthetic"
  );
  assert.equal(rewriteFimaBotApiUrl("/api/fima-bot/public-status"), "/api/fima-bot/public-status");
  assert.equal(rewriteFimaBotApiUrl("/api/paradise-evil/status"), "/api/paradise-evil/status");

  const req = { url: "/api/paradise/config?synthetic=1" };
  const headers = new Map();
  const res = { setHeader(name, value) { headers.set(name, value); } };
  let nextCalls = 0;
  fimaBotApiCompatibility(req, res, () => { nextCalls += 1; });
  assert.equal(req.url, "/api/fima-bot/config?synthetic=1");
  assert.equal(headers.get("Deprecation"), "true");
  assert.equal(headers.get("Link"), "</api/fima-bot>; rel=\"successor-version\"");
  assert.equal(nextCalls, 1);

  const canonicalReq = { url: "/api/fima-bot/config" };
  fimaBotApiCompatibility(canonicalReq, res, () => { nextCalls += 1; });
  assert.equal(canonicalReq.url, "/api/fima-bot/config");
  assert.equal(nextCalls, 2);
});

test("canonical FIMA Bot routes own the public surface and legacy aliases redirect", () => {
  assert.equal(FIMA_BOT_PUBLIC_ROUTE_ALIASES["/paradise"], "/fima-bot/dashboard");
  assert.equal(FIMA_BOT_PUBLIC_ROUTE_ALIASES["/paradise-bot"], "/fima-bot");
  assert.equal(FIMA_BOT_PUBLIC_ROUTE_ALIASES["/paradise/content-studio"], "/fima-bot/content-studio");
  for (const route of ["/paradise", "/dashboard/paradise", "/fima-bot", "/fima-bot/dashboard", "/dashboard/fima-bot"]) {
    assert.ok(serverSource.includes(`"${route}"`));
  }
  assert.match(serverSource, /redirectLegacyFimaBotRoute\(req, res, "\/fima-bot\/dashboard"\)/);
  assert.match(serverSource, /app\.get\(\["\/paradise-bot", "\/paradise-bot\.html"\], \(_req, res\) => res\.redirect\(301, "\/fima-bot"\)\)/);
  assert.match(serverSource, /app\.use\(fimaBotApiCompatibility\)/);
  assert.match(serverSource, /app\.get\("\/api\/fima-bot\/identity"/);
  assert.doesNotMatch(serverSource, /app\.(?:get|post|put|patch|delete)\("\/api\/paradise(?:\/|\")/);
});

test("slash metadata is FIMA-first and legacy setup dispatch remains compatible", () => {
  assert.equal(FIMA_BOT_SLASH_COMMAND_METADATA.setup.name, "setupfima");
  assert.match(FIMA_BOT_SLASH_COMMAND_METADATA.setup.description, /FIMA community/);
  assert.deepEqual(FIMA_BOT_SLASH_COMMAND_METADATA.setup.legacyNames, ["setupfieelscommunity"]);
  assert.match(discordBotSource, /\.setName\("setupfima"\)/);
  assert.match(discordBotSource, /interaction\.commandName === "setupfieelscommunity"/);
});

test("identity compatibility layer contains no Discord registration or mutation", () => {
  const source = fs.readFileSync(new URL("../src/fimaBotIdentity.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /discord\.com|application\.commands\.set|guilds?\.|webhooks?|fetch\(/i);
});
