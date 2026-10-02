import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { createDesktopLoginRequest, desktopPkceChallenge } from "../src/desktopLogin.js";
import { createDesktopLoginHandlers } from "../src/desktopLoginRoutes.js";

const clone = (value) => structuredClone(value);
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

function matches(row, where) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      if (expected.in) return expected.in.includes(row[key]);
      if (expected.gt) return new Date(row[key]) > expected.gt;
      if (expected.lte) return new Date(row[key]) <= expected.lte;
    }
    return row[key] === expected;
  });
}

// A deterministic transaction/rollback adapter runs the REAL route module.
// Its account-lock queue lets tests control reset versus issuance ordering.
function database(record) {
  let state = {
    requests: [clone(record)],
    user: { id: "user-a", passwordHash: "password-v1", email: "user@example.test" },
    sessions: ["browser-v1"],
    bindings: []
  };
  let queue = Promise.resolve();
  function models(getState) {
    return {
      desktopLoginRequest: {
        async findUnique({ where }) {
          return clone(getState().requests.find((row) => matches(row, where)) || null);
        },
        async updateMany({ where, data }) {
          const rows = getState().requests.filter((row) => matches(row, where));
          rows.forEach((row) => Object.assign(row, clone(data)));
          return { count: rows.length };
        }
      },
      user: { async findUnique({ where }) {
        const current = getState().user;
        return current?.id === where.id ? clone(current) : null;
      } }
    };
  }
  const db = {
    ...models(() => state),
    get state() { return state; },
    async $transaction(callback) {
      const previous = queue;
      const release = deferred();
      queue = release.promise;
      await previous;
      const draft = clone(state);
      const tx = {
        ...models(() => draft), draft, locked: false,
        async $queryRaw(strings, id) {
          assert.match(strings.join("?"), /^SELECT id FROM users WHERE id = \? FOR UPDATE$/);
          assert.equal(id, "user-a");
          tx.locked = true;
          return draft.user ? [{ id }] : [];
        }
      };
      try {
        const result = await callback(tx);
        state = draft;
        return result;
      } finally { release.resolve(); }
    },
    async reset() {
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${"user-a"} FOR UPDATE`;
        tx.draft.user.passwordHash = "password-v2";
        tx.draft.sessions = [];
        for (const request of tx.draft.requests) {
          if (request.userId === "user-a" && ["pending", "approved"].includes(request.status)) {
            request.status = "cancelled";
          }
        }
      });
    }
  };
  return db;
}

function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; }
  };
}

function fixture(options = {}) {
  const hwid = "DESKTOP-RESET-TEST";
  const verifier = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(32).toString("base64url");
  const hashDeviceId = (value) => value ? crypto.createHash("sha256").update(value).digest("hex") : null;
  const generated = createDesktopLoginRequest({
    pkceChallenge: desktopPkceChallenge(verifier), deviceIdHash: hashDeviceId(hwid), state, appVersion: "0.2.0"
  });
  const record = {
    id: "request-a", userId: options.pending ? null : "user-a",
    ...generated.record, status: options.pending ? "pending" : "approved"
  };
  const db = database(record);
  let issued = 0;
  const deps = {
    prisma: db, normalizeHwid: (value) => String(value || "").trim() || null,
    hashDeviceId, frontendUrl: () => "https://example.test",
    assertInitiatingSession: async ({ req, db: tx, userId }) => {
      assert.equal(tx.locked, true, "authority check must follow account lock");
      if (!tx.draft.sessions.includes(req.browserSession) || tx.draft.user.id !== userId) throw Error("revoked");
      return { userId };
    },
    resolveEntitlementForUser: async ({ user, db: tx }) => {
      assert.equal(tx.locked, true, "issuance must be serialized with password reset");
      issued += 1;
      tx.draft.bindings.push(user.id);
      if (options.resolve) return options.resolve({ user, db: tx });
      return { entitlementToken: "server-signed-test-token", accountId: user.id };
    },
    onConsumed: options.onConsumed || (async () => {})
  };
  const handlers = createDesktopLoginHandlers(deps);
  const approval = () => ({ user: { id: "user-a" }, browserSession: "browser-v1", body: { userCode: generated.userCode } });
  const polling = () => ({ body: { hwid, deviceCode: generated.deviceCode, pkceVerifier: verifier, state } });
  const poll = async (request = polling()) => { const res = response(); await handlers.poll(request, res); return res; };
  const approve = async (request = approval()) => { const res = response(); await handlers.approve(request, res); return res; };
  return { db, deps, handlers, record, generated, poll, approve, approval, polling, get issued() { return issued; } };
}

test("factory fails closed without authoritative session callback or transaction persistence", () => {
  const subject = fixture();
  assert.throws(() => createDesktopLoginHandlers({ ...subject.deps, assertInitiatingSession: undefined }), /assertInitiatingSession/);
  assert.throws(() => createDesktopLoginHandlers({ ...subject.deps, prisma: { desktopLoginRequest: {} } }), /transactional/);
});

test("valid cookie-bound approval and device-proof consumption preserve account-only desktop behavior", async () => {
  const subject = fixture({ pending: true });
  const pending = await subject.poll();
  assert.equal(pending.statusCode, 202);
  assert.equal((await subject.approve()).body.status, "approved");
  const result = await subject.poll();
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.accountId, "user-a");
  assert.equal(result.body.status, "consumed");
  assert.equal(result.headers["cache-control"], "no-store");
  assert.deepEqual(subject.db.state.bindings, ["user-a"]);
});

test("stale requireUser snapshot cannot approve a pending request after reset", async () => {
  const subject = fixture({ pending: true });
  const staleBrowserRequest = subject.approval();
  await subject.db.reset();
  const result = await subject.approve(staleBrowserRequest);
  assert.equal(result.statusCode, 403);
  assert.equal(result.body.error, "desktop_login_authorization_expired");
  assert.equal(subject.db.state.requests[0].status, "pending");
  assert.equal(subject.issued, 0);
});

test("approved request cancelled by reset cannot redeem old device proof", async () => {
  const subject = fixture();
  await subject.db.reset();
  assert.equal((await subject.poll()).statusCode, 410);
  assert.equal(subject.issued, 0);
});

test("parallel poll requests issue exactly one token under account serialization", async () => {
  const subject = fixture();
  const results = await Promise.all([subject.poll(), subject.poll()]);
  assert.deepEqual(results.map((res) => res.statusCode).sort(), [200, 410]);
  assert.equal(subject.issued, 1);
  assert.equal(subject.db.state.requests[0].status, "consumed");
});

test("reset wins while poll waits for account lock and stale approved snapshot is reread", async () => {
  const subject = fixture();
  const locked = deferred();
  const release = deferred();
  const blocker = subject.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${"user-a"} FOR UPDATE`;
    locked.resolve(); await release.promise;
    tx.draft.user.passwordHash = "password-v2";
    tx.draft.sessions = [];
    tx.draft.requests[0].status = "cancelled";
  });
  await locked.promise;
  const pendingPoll = subject.poll();
  await new Promise((done) => setImmediate(done));
  release.resolve(); await blocker;
  assert.equal((await pendingPoll).statusCode, 410);
  assert.equal(subject.issued, 0);
});

test("reset cannot interleave between exact consume and entitlement binding writes", async () => {
  const entered = deferred(); const release = deferred();
  const subject = fixture({ resolve: async ({ db: tx }) => {
    assert.equal(tx.draft.requests[0].status, "consumed");
    entered.resolve(); await release.promise;
    assert.equal(tx.draft.user.passwordHash, "password-v1");
    return { entitlementToken: "server-signed-test-token" };
  } });
  const poll = subject.poll(); await entered.promise;
  let resetFinished = false;
  const reset = subject.db.reset().then(() => { resetFinished = true; });
  await new Promise((done) => setImmediate(done));
  assert.equal(resetFinished, false);
  release.resolve();
  const result = await poll; await reset;
  assert.equal(result.statusCode, 410);
  assert.equal(result.body.entitlementToken, undefined);
  assert.equal(subject.issued, 1);
  assert.equal(subject.db.state.user.passwordHash, "password-v2");
});

test("post-commit reset before response suppresses the already-created token", async () => {
  let subject;
  subject = fixture({ onConsumed: async () => { await subject.db.reset(); } });
  const result = await subject.poll();
  assert.equal(result.statusCode, 410);
  assert.equal(result.body.entitlementToken, undefined);
});

test("resolver errors roll back consumption and binding, return no secret or token", async () => {
  const subject = fixture({ resolve: async () => { throw Error("provider-private-secret"); } });
  const failed = await subject.poll();
  assert.equal(failed.statusCode, 503);
  assert.equal(failed.body.error, "desktop_login_unavailable");
  assert.equal(JSON.stringify(failed.body).includes("provider-private-secret"), false);
  assert.equal(subject.db.state.requests[0].status, "approved");
  assert.deepEqual(subject.db.state.bindings, []);
});

test("expiry while awaiting account lock cannot issue token", async () => {
  const subject = fixture();
  const locked = deferred(); const release = deferred();
  const blocker = subject.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${"user-a"} FOR UPDATE`;
    locked.resolve(); await release.promise;
    tx.draft.requests[0].expiresAt = new Date(0);
  });
  await locked.promise;
  const polling = subject.poll(); await new Promise((done) => setImmediate(done));
  release.resolve(); await blocker;
  assert.equal((await polling).statusCode, 410);
  assert.equal(subject.issued, 0);
});

test("expiry during entitlement issue rolls transaction back without returning token", async () => {
  const subject = fixture({ resolve: async () => {
    const expiry = subject.db.state.requests[0].expiresAt.getTime();
    while (Date.now() <= expiry) await new Promise((done) => setTimeout(done, 3));
    return { entitlementToken: "must-not-return" };
  } });
  subject.db.state.requests[0].expiresAt = new Date(Date.now() + 35);
  const result = await subject.poll();
  assert.equal(result.statusCode, 410);
  assert.equal(subject.db.state.requests[0].status, "approved");
  assert.deepEqual(subject.db.state.bindings, []);
});

test("wrong PKCE/state/device and replay never reach entitlement issuance", async () => {
  const subject = fixture();
  for (const change of [ { pkceVerifier: "x".repeat(43) }, { state: "x".repeat(43) }, { hwid: "OTHER-PC" } ]) {
    assert.equal((await subject.poll({ body: { ...subject.polling().body, ...change } })).statusCode, 400);
  }
  assert.equal(subject.issued, 0);
  assert.equal((await subject.poll()).statusCode, 200);
  assert.equal((await subject.poll()).statusCode, 410);
  assert.equal(subject.issued, 1);
});

test("authority callbacks returning nothing, false or a different identity fail closed", async () => {
  for (const authority of [undefined, false, { userId: "user-b" }]) {
    const subject = fixture({ pending: true });
    const handlers = createDesktopLoginHandlers({ ...subject.deps, assertInitiatingSession: async () => authority });
    const res = response(); await handlers.approve(subject.approval(), res);
    assert.equal(res.statusCode, 403);
    assert.equal(subject.db.state.requests[0].status, "pending");
  }
});

test("foreign approved identity cannot be replaced and revoked session cannot reapprove", async () => {
  const subject = fixture();
  subject.db.state.requests[0].userId = "user-b";
  assert.equal((await subject.approve()).statusCode, 400);
  subject.db.state.requests[0].userId = "user-a";
  subject.db.state.sessions = [];
  assert.equal((await subject.approve()).statusCode, 403);
  assert.equal(subject.db.state.requests[0].status, "approved");
});

test("request identity mutation while account lock is awaited is rejected", async () => {
  const subject = fixture();
  const locked = deferred(); const release = deferred();
  const blocker = subject.db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${"user-a"} FOR UPDATE`;
    locked.resolve(); await release.promise;
    tx.draft.requests[0].id = "replacement-request";
  });
  await locked.promise;
  const poll = subject.poll(); await new Promise((done) => setImmediate(done));
  release.resolve(); await blocker;
  assert.equal((await poll).statusCode, 410);
  assert.equal(subject.issued, 0);
});
