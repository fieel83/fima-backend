import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import express from "express";
import cookieParser from "cookie-parser";
import { parseGoogleOAuthCookie } from "../src/googleOAuthCookie.js";

// Actual callback handlers + signed state + actual reset/link/session functions.
// Provider exchanges and the database are controlled local adapters, not live-provider evidence.
const source = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
function extract(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Missing source boundary: ${start}`);
  return source.slice(first, last);
}
const executable = [
  extract('app.get("/auth/google/callback",', 'app.get("/auth/roblox/start",'),
  extract("function createOAuthState(", "function robloxOAuthPublicError("),
  extract("function safeFrontendPath(", "function createPkcePair("),
  extract("async function loginOrLinkDiscordAccount(", "async function getRobloxOidcDiscovery("),
  extract("async function revokeAccountCredentialProofs(", "async function sendPasswordResetEmail("),
  extract("async function issueUserSession(", "function clearUserCookie("),
  extract("function oauthInitiatingSessionProof(", "async function getOptionalUser("),
  "({createOAuthState, captureOAuthInitiatingSession, validateOAuthInitiatingSession, consumePasswordReset, issueUserSession})"
].join("\n");
const hash = (token) => token ? crypto.createHash("sha256").update(token).digest("hex") : "";
const copy = (value) => structuredClone(value);
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
async function fixture(t, provider, { loggedOut = false, oldState = false, pauseReferral = false } = {}) {
  const user = { id: "fima-one", email: "one@example.com", emailNormalized: "one@example.com", passwordHash: "strong-password-hash" };
  let state = {
    users: [user], sessions: [{ id: "session-one", userId: user.id, tokenHash: hash("cookie-one"), expiresAt: new Date(Date.now() + 60_000) }],
    links: loggedOut ? [{ id: "existing-link", userId: user.id, provider, providerSubject: provider === "google" ? "google-subject" : "1511058472748454019" }] : [],
    resets: [{ id: "reset-one", userId: user.id, usedAt: null, expiresAt: new Date(Date.now() + 60_000) }]
  };
  const writes = [];
  const locks = [];
  let counter = 0;
  const matches = (row, where) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === "object" && "gt" in value) return row[key] > value.gt;
    return row[key] === value;
  });
  function delegates(get) {
    return {
      async $queryRaw(strings, ...values) { locks.push({ sql: strings.join("?"), id: values[0] }); },
      user: {
        async findUnique({ where }) { return copy(get().users.find((u) => matches(u, where)) || null); },
        async findFirst({ where }) { return copy(get().users.find((u) => where.OR ? where.OR.some((w) => matches(u, w)) : matches(u, where)) || null); },
        async update({ where, data }) { const u = get().users.find((row) => matches(row, where)); assert.ok(u); Object.assign(u, copy(data)); writes.push("user-update"); return copy(u); },
        async create({ data }) { const u = { id: `user-${++counter}`, ...copy(data) }; get().users.push(u); writes.push("user-create"); return copy(u); }
      },
      userSession: {
        async findUnique({ where }) { const row = get().sessions.find((s) => matches(s, where)); return row ? { ...copy(row), user: copy(get().users.find((u) => u.id === row.userId)) } : null; },
        async create({ data }) { const row = { id: `new-session-${++counter}`, ...copy(data) }; get().sessions.push(row); writes.push("session-create"); return copy(row); },
        async deleteMany({ where }) { const before = get().sessions.length; get().sessions = get().sessions.filter((s) => !matches(s, where)); return { count: before - get().sessions.length }; }
      },
      oAuthLink: {
        async findUnique({ where }) { const row = get().links.find((l) => matches(l, where.provider_providerSubject)); return row ? { ...copy(row), user: copy(get().users.find((u) => u.id === row.userId)) } : null; },
        async findFirst({ where }) { return copy(get().links.find((l) => matches(l, where)) || null); },
        async create({ data }) { const row = { id: `link-${++counter}`, ...copy(data) }; get().links.push(row); writes.push("link-create"); return copy(row); },
        async update({ where, data }) { const row = get().links.find((l) => matches(l, where.provider_providerSubject)); Object.assign(row, copy(data)); writes.push("link-update"); return copy(row); }
      },
      passwordResetToken: {
        async updateMany({ where, data }) { const rows = get().resets.filter((r) => matches(r, where)); rows.forEach((r) => Object.assign(r, copy(data))); return { count: rows.length }; }
      }
    };
  }
  const prisma = delegates(() => state);
  let tail = Promise.resolve();
  prisma.$transaction = async (callback) => {
    const previous = tail;
    const finished = deferred(); tail = finished.promise;
    await previous;
    const draft = copy(state);
    try { const result = await callback(delegates(() => draft)); state = draft; return result; }
    finally { finished.resolve(); }
  };
  const reached = deferred(); const proceed = deferred(); const referralReached = deferred(); const referralProceed = deferred();
  let exchangeCalls = 0;
  async function exchange() { exchangeCalls += 1; reached.resolve(); await proceed.promise; return { access_token: "local-adapter", id_token: "local-id-token", scope: "identify email" }; }
  const nonce = "1234567890123456789012";
  const profile = { id: "1511058472748454019", username: "discord-user", email: "one@example.com", verified: true };
  const app = express(); app.use(cookieParser());
  const api = runInNewContext(executable, {
    app, prisma, crypto, Buffer, URL, Date, parseGoogleOAuthCookie,
    USER_SESSION_COOKIE: "fima_user_session", OAUTH_STATE_COOKIE: "fima_oauth_state", OAUTH_PKCE_COOKIE: "fima_oauth_pkce",
    oauthLimiter: (_req, _res, next) => next(), oauthSecret: () => "controlled-local-test-secret",
    timingSafeTextEqual: (a, b) => crypto.timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b))),
    hashToken: hash, normalizeEmail: (v) => v.toLowerCase(), normalizeAccountEmail: (v) => v.toLowerCase(),
    isValidEmail: (v) => typeof v === "string" && v.includes("@"), randomToken: () => `local-random-${++counter}`,
    hashPassword: async () => "setup-password-hash", encryptToken: (v) => v ? "encrypted" : null,
    env: (key, fallback) => ({ GOOGLE_CLIENT_ID: "local-client", GOOGLE_CLIENT_SECRET: "local-secret" })[key] || fallback,
    apiBaseUrl: () => "http://127.0.0.1", frontendUrl: () => "https://local-ui.invalid",
    rememberUsedGoogleOAuthState: () => {}, rememberUsedDiscordOAuthState: () => {},
    clearOAuthCookies: () => {}, createAuditLog: async () => {}, publicError: (error) => ({ message: error.message }),
    console: { error() {}, warn() {} },
    exchangeDiscordCode: exchange, fetchDiscordProfile: async () => profile,
    evaluateReferralForUser: async () => { if (pauseReferral) { referralReached.resolve(); await referralProceed.promise; } },
    OAuth2Client: class {
      async getToken() { return { tokens: await exchange() }; }
      async verifyIdToken() { return { getPayload: () => ({ iss: "https://accounts.google.com", aud: "local-client", sub: "google-subject", email: "one@example.com", email_verified: true, nonce, exp: Math.floor(Date.now() / 1000) + 60 }) }; }
    }
  }, { filename: "actual-oauth-session-boundary.js" });
  const initiatingSession = loggedOut || oldState ? null : await api.captureOAuthInitiatingSession({ cookies: { fima_user_session: "cookie-one" } }, user);
  const signedState = api.createOAuthState(provider, { userId: loggedOut ? null : user.id, initiatingSession });
  const server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  async function callback(cookie = loggedOut ? null : "cookie-one") {
    const cookies = [`fima_oauth_state=${provider === "google" ? `${signedState}.${nonce}` : signedState}`, `fima_oauth_pkce=${"a".repeat(43)}`];
    if (cookie) cookies.push(`fima_user_session=${cookie}`);
    return fetch(`http://127.0.0.1:${server.address().port}/auth/${provider}/callback?code=local-code&state=${signedState}`, { headers: { cookie: cookies.join("; ") }, redirect: "manual" });
  }
  return { api, callback, reached, proceed, referralReached, referralProceed, writes, locks, signedState,
    exchangeCalls: () => exchangeCalls, state: () => copy(state), revoke: () => { state.sessions = []; },
    expire: () => { state.sessions[0].expiresAt = new Date(0); },
    replace: () => { state.sessions[0].tokenHash = hash("replacement-token"); },
    passwordChangeOnly: () => { state.users[0].passwordHash = "changed-password-hash"; },
    unlink: () => { state.links = []; state.users[0].discordUserId = null; },
    rebind: () => { state.links[0].userId = "other-account"; },
    changeDiscordIdentity: () => { state.users[0].discordUserId = "1511058472748454020"; },
    addSameAccountSession: () => state.sessions.push({ ...copy(state.sessions[0]), id: "session-two", tokenHash: hash("cookie-two") }),
    reset: () => api.consumePasswordReset({ id: "reset-one", userId: user.id }, "changed-password-hash") };
}
function rejected(response, provider) {
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), `https://local-ui.invalid/login?error=${provider}_oauth_failed`);
  assert.equal(response.headers.get("set-cookie"), null, "Denied callback must not issue a new login cookie");
}
for (const provider of ["google", "discord"]) {
  test(`${provider}: same initiating session links and issues session under account/session locks`, async (t) => {
    const f = await fixture(t, provider); f.proceed.resolve();
    const payload = JSON.parse(Buffer.from(f.signedState.split(".")[0], "base64url").toString());
    assert.equal(payload.initiatingSession.sessionId, "session-one");
    assert.ok(!JSON.stringify(payload).includes(hash("cookie-one")) && !JSON.stringify(payload).includes("password-hash"));
    const response = await f.callback();
    assert.ok(response.headers.get("location").endsWith(`?${provider}=connected`));
    assert.ok(response.headers.get("set-cookie").includes("fima_user_session="));
    assert.equal(f.state().links.length, 1); assert.equal(f.state().sessions.length, 2);
    assert.equal(f.locks.filter((l) => l.sql.includes("FROM users ")).length, 2);
    assert.equal(f.locks.filter((l) => l.sql.includes("FROM user_sessions ")).length, 2);
  });
  test(`${provider}: another session for the same account cannot complete initiating session state`, async (t) => {
    const f = await fixture(t, provider); f.addSameAccountSession(); f.proceed.resolve();
    rejected(await f.callback("cookie-two"), provider); assert.equal(f.exchangeCalls(), 0); assert.equal(f.writes.length, 0);
  });
  test(`${provider}: revoked session before callback fails before provider exchange`, async (t) => {
    const f = await fixture(t, provider); f.revoke(); f.proceed.resolve();
    rejected(await f.callback(), provider); assert.equal(f.exchangeCalls(), 0);
  });
  test(`${provider}: older unbound account-link state fails closed`, async (t) => {
    const f = await fixture(t, provider, { oldState: true }); f.proceed.resolve();
    rejected(await f.callback(), provider); assert.equal(f.exchangeCalls(), 0);
  });
  test(`${provider}: password change invalidates state even while original session row still exists`, async (t) => {
    const f = await fixture(t, provider); f.passwordChangeOnly(); f.proceed.resolve();
    rejected(await f.callback(), provider); assert.equal(f.exchangeCalls(), 0); assert.equal(f.state().sessions.length, 1);
  });
  test(`${provider}: password change during exchange rejects a retained original session row`, async (t) => {
    const f = await fixture(t, provider); const pending = f.callback(); await f.reached.promise;
    f.passwordChangeOnly(); f.proceed.resolve(); rejected(await pending, provider);
    assert.equal(f.state().links.length, 0); assert.ok(!f.writes.includes("session-create"));
  });
  for (const mutation of ["reset", "revoke", "expire", "replace"]) {
    test(`${provider}: ${mutation} during awaited provider exchange cannot link or resurrect session`, async (t) => {
      const f = await fixture(t, provider); const pending = f.callback(); await f.reached.promise;
      await f[mutation](); f.proceed.resolve(); rejected(await pending, provider);
      assert.equal(f.state().links.length, 0); assert.ok(!f.writes.includes("session-create"));
      assert.ok(f.locks.some((l) => l.sql.includes("FROM users ")));
    });
  }
  test(`${provider}: logged-out provider identity login is unaffected by old-session reset`, async (t) => {
    const f = await fixture(t, provider, { loggedOut: true }); const pending = f.callback(); await f.reached.promise;
    assert.equal(await f.reset(), true); f.proceed.resolve(); const response = await pending;
    assert.ok(response.headers.get("location").endsWith(`?${provider}=connected`));
    assert.equal(f.state().sessions.length, 1);
  });
}
test("Discord: reset after committed link during referral await cannot issue a replacement session", async (t) => {
  const f = await fixture(t, "discord", { pauseReferral: true }); f.proceed.resolve();
  const pending = f.callback(); await f.referralReached.promise; assert.equal(f.state().links.length, 1);
  assert.equal(await f.reset(), true); f.referralProceed.resolve(); rejected(await pending, "discord");
  assert.equal(f.state().sessions.length, 0); assert.ok(!f.writes.includes("session-create"));
});
for (const loggedOut of [false, true]) {
  for (const mutation of ["unlink", "rebind", "changeDiscordIdentity"]) {
    test(`Discord: ${mutation} after provider resolution rejects ${loggedOut ? "login" : "link"} session issuance`, async (t) => {
      const f = await fixture(t, "discord", { pauseReferral: true, loggedOut }); f.proceed.resolve();
      const pending = f.callback(); await f.referralReached.promise;
      f[mutation](); f.referralProceed.resolve(); rejected(await pending, "discord");
      assert.ok(!f.writes.includes("session-create"));
      assert.ok(f.locks.some((lock) => lock.sql.includes("FROM users ")));
    });
  }
}
for (const mutation of ["unlink", "rebind"]) {
  test(`Google: ${mutation} before locked session issuance rejects provider proof`, async (t) => {
    const f = await fixture(t, "google", { loggedOut: true }); f[mutation]();
    let cookies = 0;
    await assert.rejects(f.api.issueUserSession({ cookie() { cookies += 1; } }, "user-one", null,
      { provider: "google", subject: "google-subject" }), /oauth_provider_identity_changed/);
    assert.equal(cookies, 0); assert.ok(!f.writes.includes("session-create"));
  });
}
