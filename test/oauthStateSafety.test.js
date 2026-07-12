import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

test("Discord OAuth consumes a signed state once and production cannot use the development fallback secret", async () => {
  const source = await fs.readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /const usedDiscordOAuthStates = new Map\(\)/);
  assert.match(source, /rememberUsedDiscordOAuthState\(String\(req\.query\?\.state \|\| ""\)\)/);
  assert.match(source, /function rememberUsedOAuthState\(store, state\)/);
  assert.match(source, /\["production", "prod", "staging"\]\.includes\(runtime\)/);
  assert.match(source, /oauth_state_secret_missing/);
  assert.match(source, /app\.get\("\/auth\/discord\/start", oauthLimiter/);
  assert.match(source, /app\.get\("\/auth\/discord\/callback", oauthLimiter/);
});
