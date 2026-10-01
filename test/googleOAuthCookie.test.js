import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { parseGoogleOAuthCookie } from "../src/googleOAuthCookie.js";

test("Google callback preserves the exact OIDC nonce from the start cookie", () => {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const state = "signed.payload.signature";
  assert.deepEqual(parseGoogleOAuthCookie(`${state}.${nonce}`), { state, nonce });
});

test("Google cookie rejects missing, malformed and truncated nonce", () => {
  for (const cookie of [null, "", "state", ".abcdefghijklmnopqrstuv", "state.short", "state.abcdefghijklmnopqrstu!"]) {
    assert.throws(() => parseGoogleOAuthCookie(cookie), /invalid_google_nonce/u);
  }
});

test("shipped callback uses the nonce parser and compares the verified ID token nonce", () => {
  const source = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
  const callback = source.slice(source.indexOf('app.get("/auth/google/callback"'), source.indexOf('app.get("/auth/discord/callback"'));
  assert.match(callback, /parseGoogleOAuthCookie\(req\.cookies/u);
  assert.match(callback, /payload\.nonce !== nonce/u);
  assert.doesNotMatch(callback, /Buffer\.from\(cookieState/u);
});
