import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import crypto from "node:crypto";

// Execute the current server implementations without starting services or contacting customers.
const source = readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
function extract(start, end) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first + start.length);
  assert.ok(first >= 0 && last > first, `Missing boundary: ${start}`);
  return source.slice(first, last);
}
const helpers = extract("async function createDiscordPasswordResetForUser(", "async function sendPasswordResetEmail(");
const disconnect = extract('app.post(["/auth/discord/disconnect",', 'app.post(["/auth/roblox/disconnect",');
const future = () => new Date(Date.now() + 600_000);
const token = (id, userId = "account-a", overrides = {}) => ({ id, userId, tokenHash: id, expiresAt: future(), usedAt: null, ...overrides });
const account = { id: "account-a", passwordHash: "old-hash", discordUserId: "1511058472748454019" };
const copy = value => structuredClone(value);

function fixture({ tokens = [token("reset-a")], failAt = null, currentUser = account, desktop = [],
  links = [{ userId: "account-a", provider: "discord", providerSubject: account.discordUserId }], dmImpl = async () => ({ sent: true, provider: "discord" }) } = {}) {
  let state = copy({ users: [currentUser, { id: "account-b", passwordHash: "other-hash" }], tokens,
    sessions: [{ id: "session-a", userId: "account-a" }, { id: "session-b", userId: "account-b" }],
    links, desktop });
  let tail = Promise.resolve();
  const events = [];
  const dmCalls = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) =>
    value && typeof value === "object" && "gt" in value ? row[key] > value.gt :
      value && typeof value === "object" && "in" in value ? value.in.includes(row[key]) : row[key] === value);
  const prisma = {
    async $transaction(callback) {
      const previous = tail;
      let release;
      tail = new Promise(resolve => { release = resolve; });
      await previous;
      const draft = copy(state);
      let locked = false;
      const checkLock = () => assert.equal(locked, true, "Account row lock must precede writes");
      const tx = {
        async $queryRaw(parts, id) {
          assert.match(parts.join("?"), /SELECT id FROM users WHERE id = \? FOR UPDATE/);
          assert.equal(id, "account-a");
          events.push("row-lock"); locked = true;
          return [{ id }];
        },
        passwordResetToken: {
          async updateMany({ where, data }) {
            checkLock(); events.push("token-update");
            let count = 0;
            for (const row of draft.tokens) if (matches(row, where)) { Object.assign(row, copy(data)); count++; }
            if (failAt === "siblings" && !where.id) throw new Error("siblings_failed");
            return { count };
          },
          async create({ data }) {
            checkLock(); events.push("token-create");
            if (failAt === "create") throw new Error("create_failed");
            const row = { id: `issued-${draft.tokens.length}`, usedAt: null, ...copy(data) };
            draft.tokens.push(row); return copy(row);
          }
        },
        user: {
          async findUnique({ where }) { return copy(draft.users.find(row => matches(row, where)) || null); },
          async update({ where, data }) {
            checkLock(); events.push("password-update");
            if (failAt === "password") throw new Error("password_failed");
            const row = draft.users.find(entry => matches(entry, where)); assert.ok(row);
            Object.assign(row, copy(data)); return copy(row);
          }
        },
        userSession: {
          async deleteMany({ where }) {
            checkLock(); events.push("session-revoke");
            if (failAt === "sessions") throw new Error("sessions_failed");
            const old = draft.sessions.length;
            draft.sessions = draft.sessions.filter(row => !matches(row, where));
            return { count: old - draft.sessions.length };
          }
        },
        desktopLoginRequest: {
          async updateMany({ where, data }) {
            checkLock(); events.push("desktop-cancel");
            let count = 0;
            for (const row of draft.desktop) if (matches(row, where)) { Object.assign(row, copy(data)); count++; }
            if (failAt === "desktop") throw new Error("desktop_failed");
            return { count };
          }
        },
        oAuthLink: {
          async findUnique({ where }) {
            checkLock(); return copy(draft.links.find(row => matches(row, where.provider_providerSubject)) || null);
          },
          async findFirst({ where }) {
            checkLock(); return copy(draft.links.find(row => matches(row, where)) || null);
          },
          async deleteMany({ where }) {
            checkLock(); events.push("identity-delete");
            const old = draft.links.length;
            draft.links = draft.links.filter(row => !matches(row, where));
            if (failAt === "proofs") throw new Error("proofs_failed");
            return { count: old - draft.links.length };
          }
        }
      };
      try { const result = await callback(tx); state = draft; return result; }
      finally { release(); }
    }
  };
  const context = { prisma, crypto, frontendUrl: () => "https://fimamacro.com",
    hashToken: raw => crypto.createHash("sha256").update(raw).digest("hex"),
    sendPasswordResetDm: async (...args) => { dmCalls.push(args); return dmImpl(...args); },
    createAuditLog: async () => {}, maskDiscordId: () => "masked" };
  const api = runInNewContext(`${helpers}\n({ createDiscordPasswordResetForUser, createPasswordResetTokenForUser, consumePasswordReset });`, context);
  return { api, prisma, events, dmCalls, state: () => copy(state) };
}

test("actual consume accepts once, invalidates siblings and revokes only account sessions", async () => {
  const f = fixture({ tokens: [token("reset-a"), token("sibling"), token("other", "account-b")] });
  assert.equal(await f.api.consumePasswordReset(token("reset-a"), "new-hash"), true);
  const state = f.state();
  assert.equal(state.users[0].passwordHash, "new-hash");
  assert.ok(state.tokens[0].usedAt); assert.ok(state.tokens[1].usedAt);
  assert.equal(state.tokens[2].usedAt, null);
  assert.deepEqual(state.sessions.map(row => row.id), ["session-b"]);
  assert.equal(await f.api.consumePasswordReset(token("reset-a"), "replay-hash"), false);
  assert.equal(f.state().users[0].passwordHash, "new-hash");
});

test("concurrent stale reads of one reset produce one success", async () => {
  const f = fixture();
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => f.api.consumePasswordReset(token("reset-a"), `hash-${i}`)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(f.events.filter(event => event === "password-update").length, 1);
});

function revocationFixture(failAt = null) {
  return fixture({ failAt, desktop: [
    ...["pending", "approved", "exchanged", "cancelled", "expired"].map(status => ({ id: `a-${status}`, userId: account.id, status })),
    ...["pending", "approved"].map(status => ({ id: `b-${status}`, userId: "account-b", status }))
  ], links: [
    { userId: account.id, provider: "discord", providerSubject: account.discordUserId },
    { userId: account.id, provider: "google", providerSubject: "google-a" },
    { userId: account.id, provider: "roblox", providerSubject: "123" },
    { userId: account.id, provider: "roblox_profile_verify", providerSubject: "proof-a" },
    { userId: "account-b", provider: "roblox_profile_verify", providerSubject: "proof-b" }
  ] });
}

test("password reset cancels only own pending/approved desktop flows and deletes only own pending Roblox proofs", async () => {
  const f = revocationFixture();
  const before = f.state();
  assert.equal(await f.api.consumePasswordReset(token("reset-a"), "new-hash"), true);
  const after = f.state();
  for (const row of after.desktop) {
    if (row.id === "a-pending" || row.id === "a-approved") {
      assert.equal(row.status, "cancelled"); assert.ok(row.cancelledAt instanceof Date);
    } else assert.deepEqual(row, before.desktop.find(old => old.id === row.id));
  }
  assert.deepEqual(after.links, before.links.filter(row => row.providerSubject !== "proof-a"));
  assert.deepEqual(f.events.slice(-3), ["session-revoke", "desktop-cancel", "identity-delete"]);
});

for (const failure of ["desktop", "proofs"]) {
  test(`password reset rolls back token/password/session/desktop/proof mutations on ${failure} failure`, async () => {
    const f = revocationFixture(failure); const before = f.state();
    await assert.rejects(f.api.consumePasswordReset(token("reset-a"), "new-hash"), /failed/);
    assert.deepEqual(f.state(), before);
  });
}

test("concurrent sibling tokens cannot both reset the password", async () => {
  const f = fixture({ tokens: [token("reset-a"), token("sibling")] });
  const results = await Promise.all([f.api.consumePasswordReset(token("reset-a"), "a"), f.api.consumePasswordReset(token("sibling"), "b")]);
  assert.equal(results.filter(Boolean).length, 1);
});

for (const [name, overrides] of [["expired", { expiresAt: new Date(0) }], ["already used", { usedAt: new Date() }], ["wrong account", { userId: "account-b" }]]) {
  test(`actual consume rejects ${name} without password or session changes`, async () => {
    const f = fixture({ tokens: [token("reset-a", "account-a", overrides)] });
    const before = f.state();
    assert.equal(await f.api.consumePasswordReset(token("reset-a"), "invalid-hash"), false);
    assert.deepEqual(f.state(), before);
  });
}

for (const failure of ["password", "siblings", "sessions"]) {
  test(`actual consume rolls back claim and password on ${failure} failure`, async () => {
    const f = fixture({ tokens: [token("reset-a"), token("sibling")], failAt: failure });
    const before = f.state();
    await assert.rejects(f.api.consumePasswordReset(token("reset-a"), "new-hash"), /failed/);
    assert.deepEqual(f.state(), before);
  });
}

test("actual issuance uses opaque 256-bit token and serializes replacement", async () => {
  const f = fixture();
  const issued = await Promise.all([f.api.createPasswordResetTokenForUser(account), f.api.createPasswordResetTokenForUser(account)]);
  for (const item of issued) {
    assert.match(item.token, /^[a-f0-9]{64}$/);
    assert.equal(item.resetUrl, `https://fimamacro.com/reset-password?token=${item.token}`);
  }
  assert.notEqual(issued[0].token, issued[1].token);
  const active = f.state().tokens.filter(row => !row.usedAt);
  assert.equal(active.length, 1);
  assert.equal(active[0].tokenHash, crypto.createHash("sha256").update(issued[1].token).digest("hex"));
  assert.equal(JSON.stringify(f.state()).includes(issued[1].token), false);
});

test("failed replacement issuance preserves previous usable reset", async () => {
  const f = fixture({ failAt: "create" }); const before = f.state();
  await assert.rejects(f.api.createPasswordResetTokenForUser(account), /create_failed/);
  assert.deepEqual(f.state(), before);
});

function disconnectFixture(options = {}) {
  const f = fixture(options); let handler; let roleCalls = 0; let auditCalls = 0;
  runInNewContext(disconnect, {
    app: { post(_paths, _auth, fn) { handler = fn; } }, requireUser() {}, prisma: f.prisma,
    verifyPassword: async password => password === "correct-password",
    findActiveMonthlyTrial: async () => ({ id: "trial" }),
    removeDiscordRole: async () => { roleCalls++; },
    createAuditLog: async () => { auditCalls++; }, publicUser: user => ({ id: user.id }),
    buildIntegrationSummary: async () => ({}), buildMonthlyTrialSummary: async () => ({}),
    publicError: () => ({}), console: { warn() {}, error() {} }
  });
  return { ...f, roleCalls: () => roleCalls, auditCalls: () => auditCalls,
    async call(password) {
      let status = 200; let body;
      const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
      await handler({ user: copy(account), body: { password } }, res);
      return { status, body };
    }
  };
}

for (const password of [undefined, "incorrect-password"]) {
  test(`actual Discord disconnect denies ${password ? "incorrect" : "missing"} password before mutation`, async () => {
    const f = disconnectFixture(); const before = f.state(); const result = await f.call(password);
    assert.equal(result.status, 403); assert.equal(result.body.error, "password_confirmation_required");
    assert.deepEqual(f.state(), before); assert.equal(f.roleCalls(), 0); assert.equal(f.auditCalls(), 0);
  });
}

test("actual Discord disconnect rejects password changed during confirmation", async () => {
  const f = disconnectFixture({ currentUser: { ...account, passwordHash: "changed-hash" } });
  const before = f.state(); const result = await f.call("correct-password");
  assert.equal(result.status, 409); assert.deepEqual(f.state(), before); assert.equal(f.roleCalls(), 0);
});

test("actual Discord disconnect rejects linked identity changed during confirmation", async () => {
  const f = disconnectFixture({ currentUser: { ...account, discordUserId: "1511058472748454020" } });
  const before = f.state(); const result = await f.call("correct-password");
  assert.equal(result.status, 409); assert.deepEqual(f.state(), before); assert.equal(f.roleCalls(), 0);
});

test("actual Discord disconnect valid password removes identity before trial role cleanup", async () => {
  const f = disconnectFixture({ tokens: [token("reset-a"), token("sibling"), token("other", "account-b")] });
  const result = await f.call("correct-password");
  assert.equal(result.status, 200); assert.equal(result.body.success, true);
  assert.equal(f.state().users[0].discordUserId, null); assert.equal(f.state().links.length, 0);
  assert.equal(f.roleCalls(), 1); assert.equal(f.auditCalls(), 1);
  assert.ok(f.state().tokens[0].usedAt); assert.ok(f.state().tokens[1].usedAt);
  assert.equal(f.state().tokens[2].usedAt, null);
  assert.equal(await f.api.consumePasswordReset(token("reset-a"), "old-discord-reset"), false);
});

test("Discord recovery rejects a stale issuance after actual unlink commits", async () => {
  const f = disconnectFixture();
  assert.equal((await f.call("correct-password")).status, 200);
  const before = f.state();
  await assert.rejects(f.api.createDiscordPasswordResetForUser(copy(account)), /discord_recovery_identity_changed/);
  assert.deepEqual(f.state(), before); assert.equal(f.dmCalls.length, 0);
});

for (const [name, options] of [
  ["replaced Discord account", { currentUser: { ...account, discordUserId: "1511058472748454020" } }],
  ["password changed", { currentUser: { ...account, passwordHash: "replacement-hash" } }],
  ["provider belongs to other account", { links: [{ userId: "account-b", provider: "discord", providerSubject: account.discordUserId }] }],
  ["different provider on same account", { links: [{ userId: "account-a", provider: "discord", providerSubject: "1511058472748454020" }] }],
  ["missing numeric identity", { currentUser: { ...account, discordUserId: null } }]
]) {
  test(`Discord recovery rejects ${name} before token creation or delivery`, async () => {
    const f = fixture(options); const before = f.state();
    await assert.rejects(f.api.createDiscordPasswordResetForUser(copy(account)), /discord_recovery_identity_changed/);
    assert.deepEqual(f.state(), before); assert.equal(f.dmCalls.length, 0);
  });
}

for (const links of [undefined, []]) {
  test(`Discord recovery validates ${links ? "legacy" : "modern"} binding and delivers an account-bound reset`, async () => {
    const f = fixture({ links });
    const result = await f.api.createDiscordPasswordResetForUser(copy(account));
    assert.equal(result.discordSent, true); assert.equal(f.dmCalls.length, 1);
    assert.equal(f.dmCalls[0][0], account.discordUserId);
    assert.equal(f.dmCalls[0][1], result.token);
    const saved = f.state().tokens.find(row => !row.usedAt);
    assert.equal(saved.userId, account.id);
    assert.equal(saved.tokenHash, crypto.createHash("sha256").update(result.token).digest("hex"));
  });
}

for (const mode of ["throw", "unsent"]) {
  test(`Discord recovery invalidates its exact challenge when DM ${mode}`, async () => {
    const f = fixture({ tokens: [token("other", "account-b")], dmImpl: async () => {
      if (mode === "throw") throw new Error("dm_unavailable");
      return { sent: false, provider: "discord" };
    } });
    await assert.rejects(f.api.createDiscordPasswordResetForUser(copy(account)), /dm_unavailable|discord_reset_delivery_failed/);
    assert.equal(f.dmCalls.length, 1);
    const state = f.state();
    const issued = state.tokens.find(row => row.userId === account.id);
    assert.ok(issued.usedAt); assert.equal(state.tokens[0].usedAt, null);
    assert.equal(await f.api.consumePasswordReset(issued, "not-usable"), false);
  });
}

test("Discord recovery failed DM cleanup cannot invalidate a newer reset request", async () => {
  let f; let newer;
  f = fixture({ dmImpl: async () => {
    newer = await f.api.createPasswordResetTokenForUser(copy(account));
    throw new Error("late_dm_failure");
  } });
  await assert.rejects(f.api.createDiscordPasswordResetForUser(copy(account)), /late_dm_failure/);
  const active = f.state().tokens.filter(row => !row.usedAt);
  assert.equal(active.length, 1);
  assert.equal(active[0].tokenHash, crypto.createHash("sha256").update(newer.token).digest("hex"));
});

const google = extract("async function loginOrLinkGoogleAccount(", "async function getRobloxOidcDiscovery(");
for (const [email, verified] of [["other@example.com", false], ["PRIMARY@example.com", true]]) {
  test(`actual linked Google login ${verified ? "verifies matching" : "does not certify unrelated"} account email`, async () => {
    const user = { id: "account-a", email: "primary@example.com", emailVerifiedAt: null };
    let written;
    const tx = {
      oAuthLink: { async findUnique() { return { userId: user.id, user: copy(user) }; } },
      user: { async update({ where, data }) { assert.equal(where.id, user.id); written = data; return { ...user, ...data }; } }
    };
    const fn = runInNewContext(`${google}\nloginOrLinkGoogleAccount;`, {
      prisma: { $transaction: async callback => callback(tx) },
      normalizeAccountEmail: value => value.trim().toLowerCase(), isValidEmail: value => value.includes("@")
    });
    const result = await fn({ subject: "verified-google-subject", email, name: "Fixture" });
    assert.equal(result.created, false);
    if (verified) { assert.ok(written.emailVerifiedAt); assert.ok(result.user.emailVerifiedAt); }
    else { assert.deepEqual(Object.keys(written), []); assert.equal(result.user.emailVerifiedAt, null); }
  });
}
