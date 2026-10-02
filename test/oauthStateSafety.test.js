import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import vm from "node:vm";

test("OAuth state rejects suffix, noncanonical encoding, cookie mismatch and expired payload", async () => {
  const source = await fs.readFile(new URL("../src/server.js", import.meta.url), "utf8");
  const start = source.indexOf("function verifyOAuthState(");
  const end = source.indexOf("\nfunction robloxOAuthPublicError", start);
  const verify = vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
    Buffer, crypto, Date, oauthSecret: () => "fixture-secret", timingSafeTextEqual: (a, b) => a === b
  });
  const sign = payload => {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${crypto.createHmac("sha256", "fixture-secret").update(encoded).digest("base64url")}`;
  };
  const state = sign({provider: "discord", exp: Date.now() + 60000});
  assert.equal(verify(state, state, "discord").provider, "discord");
  for (const altered of [state + ".suffix", state + "=", state.replace(".", "=."), state + "."]) {
    assert.throws(() => verify(altered, altered, "discord"), /invalid_oauth_state_format/);
  }
  assert.throws(() => verify(state, "different", "discord"), /invalid_oauth_state/);
  assert.throws(() => verify(state, state, "google"), /expired_oauth_state/);
  for (const exp of [Date.now() - 1, "9999999999999", null]) {
    const expired = sign({provider: "discord", exp});
    assert.throws(() => verify(expired, expired, "discord"), /expired_oauth_state/);
  }
});

test("Discord OAuth consumes a signed state once and production cannot use the development fallback secret", async () => {
  const source = await fs.readFile(new URL("../src/server.js", import.meta.url), "utf8");
  assert.match(source, /import \{ consumeOAuthState \} from "\.\/oauthStateReplay\.js"/);
  for (const provider of ["google", "discord", "roblox"]) {
    assert.ok(source.includes(`await consumeOAuthState(prisma, { provider: "${provider}"`));
  }
  assert.doesNotMatch(source, /used(?:Google|Discord|Roblox)OAuthStates = new Map/);
  assert.match(source, /\["production", "prod", "staging"\]\.includes\(runtime\)/);
  assert.match(source, /oauth_state_secret_missing/);
  assert.match(source, /app\.get\("\/auth\/discord\/start", oauthLimiter/);
  assert.match(source, /app\.get\("\/auth\/discord\/callback", oauthLimiter/);
});
