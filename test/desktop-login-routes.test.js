import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { desktopPkceChallenge, isStrictAccountOnlyEntitlementPayload } from "../src/desktopLogin.js";
import { createDesktopLoginHandlers } from "../src/desktopLoginRoutes.js";

function matches(record, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    const actual = record[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      if (Array.isArray(expected.in)) return expected.in.includes(actual);
      if (expected.gt) return new Date(actual).getTime() > new Date(expected.gt).getTime();
      if (expected.lte) return new Date(actual).getTime() <= new Date(expected.lte).getTime();
    }
    return actual === expected;
  });
}

function fakePrisma() {
  const records = [];
  const users = new Map([["user-a", { id: "user-a", email: "member@example.com", discordUserId: null, passwordHash: "password-v1" }]]);
  let queue = Promise.resolve();
  const clone = (value) => structuredClone(value);
  const prisma = {
    records,
    users,
    desktopLoginRequest: {
      async create({ data }) {
        const record = {
          id: `desktop-${records.length + 1}`,
          userId: null,
          approvedAt: null,
          consumedAt: null,
          cancelledAt: null,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        records.push(record);
        return clone(record);
      },
      async findUnique({ where }) {
        return clone(records.find((record) => matches(record, where)) || null);
      },
      async updateMany({ where, data }) {
        const selected = records.filter((record) => matches(record, where));
        for (const record of selected) Object.assign(record, data, { updatedAt: new Date() });
        return { count: selected.length };
      }
    },
    user: {
      async findUnique({ where }) {
        return clone(users.get(where.id) || null);
      }
    }
  };
  prisma.$transaction = async (callback) => {
    const previous = queue;
    let release;
    queue = new Promise((resolve) => { release = resolve; });
    await previous;
    const savedRecords = clone(records);
    const savedUsers = clone(users);
    const tx = {
      desktopLoginRequest: prisma.desktopLoginRequest,
      user: prisma.user,
      locked: false,
      async $queryRaw(strings, userId) {
        assert.equal(strings.join("?"), "SELECT id FROM users WHERE id = ? FOR UPDATE");
        assert.equal(userId, "user-a");
        tx.locked = true;
        return users.has(userId) ? [{ id: userId }] : [];
      }
    };
    try { return await callback(tx); }
    catch (error) {
      records.splice(0, records.length, ...savedRecords);
      users.clear();
      for (const [id, user] of savedUsers) users.set(id, user);
      throw error;
    } finally { release(); }
  };
  return prisma;
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    }
  };
}

function fixture() {
  const prisma = fakePrisma();
  const hwid = "FIMA-TEST-DEVICE-01";
  const verifier = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(24).toString("base64url");
  const entitlement = {
    userId: "user-a",
    accountId: "user-a",
    licenseId: null,
    plan: null,
    licenseStatus: "account_only",
    allowedFeatures: [],
    capabilities: [],
    ownerAdminAccess: false,
    isOwner: false,
    isAdmin: false,
    adminTools: false
  };
  const handlers = createDesktopLoginHandlers({
    prisma,
    normalizeHwid: (value) => String(value || "").trim().toUpperCase() || null,
    hashDeviceId: (value) => value ? crypto.createHash("sha256").update(value).digest("hex") : null,
    frontendUrl: () => "https://fimamacro.com/",
    assertInitiatingSession: async ({ req, db, userId }) => {
      assert.equal(db.locked, true, "browser authority must be checked under the account lock");
      const user = await db.user.findUnique({ where: { id: userId } });
      if (req.browserSession !== "browser-v1" || user?.passwordHash !== "password-v1") return false;
      return { userId };
    },
    resolveEntitlementForUser: async ({ user, db }) => {
      assert.equal(db.locked, true, "entitlement resolver must share the consumption transaction");
      assert.equal(user.id, "user-a");
      return {
      valid: true,
      validLicense: false,
      reason: "account_only",
      accountConnected: true,
      entitlementToken: "signed-account-token",
      entitlement
      };
    }
  });
  const proof = { hwid, pkceVerifier: verifier, state };
  return { prisma, handlers, proof, verifier, state, entitlement };
}

async function initiate(subject, responseMode) {
  const res = response();
  await subject.handlers.initiate({
    body: {
      hwid: subject.proof.hwid,
      pkceChallenge: desktopPkceChallenge(subject.verifier),
      state: subject.state,
      ...(responseMode ? { responseMode } : {}),
      appVersion: "0.2.0-candidate",
      deviceName: "  FIMA\u0000 Gaming   PC  ",
      devicePlatform: "Windows 11"
    }
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.headers["cache-control"], "no-store");
  return res.body;
}

async function browserIntent(mode = "loopback") {
  const subject = fixture();
  if (mode === "loopback") {
    const stateBytes = crypto.randomBytes(35);
    stateBytes[0] = 1; stateBytes.writeUInt16BE(49152, 1);
    subject.state = stateBytes.toString("base64url");
    subject.proof.state = subject.state;
  }
  const login = await initiate(subject, mode);
  const uri = new URL(login.verificationUri);
  assert.equal(uri.searchParams.get("state"), subject.state);
  const body = { requestId: uri.searchParams.get("request"), state: subject.state };
  return { subject, login, body };
}

test("browser identity loopback code binds proof and account and is consumed once", async () => {
  const { subject, login, body } = await browserIntent();
  const wrongState = response();
  await subject.handlers.context({ body: { ...body, state: "X".repeat(47) }, user: { id: "user-a" } }, wrongState);
  assert.equal(wrongState.statusCode, 400);
  const approval = response();
  await subject.handlers.approve({ body, user: { id: "user-a" }, browserSession: "browser-v1" }, approval);
  assert.equal(approval.statusCode, 200);
  const callback = new URL(approval.body.callbackUri);
  assert.equal(callback.origin, "http://127.0.0.1:49152");
  const code = callback.searchParams.get("code");
  for (const badProof of [{ state: "X".repeat(47) }, { pkceVerifier: "X".repeat(43) }, { hwid: "OTHER-DEVICE" }]) {
    const rejected = response();
    await subject.handlers.exchange({ body: { ...subject.proof, deviceCode: login.deviceCode, code, ...badProof } }, rejected);
    assert.equal(rejected.statusCode, 400);
    assert.equal(subject.prisma.records[0].status, "approved");
  }
  const wrongAccount = response();
  await subject.handlers.context({ body, user: { id: "user-b" } }, wrongAccount);
  assert.equal(wrongAccount.statusCode, 400);
  const polls = response();
  await subject.handlers.poll({ body: { ...subject.proof, deviceCode: login.deviceCode } }, polls);
  assert.equal(polls.statusCode, 202);
  const results = await Promise.all([1, 2].map(async () => {
    const res = response(); await subject.handlers.exchange({ body: { ...subject.proof, deviceCode: login.deviceCode, code } }, res); return res;
  }));
  assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 410]);
  assert.equal(results.find(r => r.statusCode === 200).body.entitlementToken, "signed-account-token");
  const replay = response();
  await subject.handlers.poll({ body: { ...subject.proof, deviceCode: login.deviceCode } }, replay);
  assert.equal(replay.statusCode, 410);
});

test("expired loopback code recovers through proof-bound poll then identical single-use exchange", async () => {
  const { subject, login, body } = await browserIntent();
  const approval = response();
  await subject.handlers.approve({ body, user: { id: "user-a" }, browserSession: "browser-v1" }, approval);
  const originalCode = new URL(approval.body.callbackUri).searchParams.get("code");
  subject.prisma.records[0].authorizationCodeExpiresAt = new Date(Date.now() - 1000);
  const recovery = response();
  await subject.handlers.poll({ body: { ...subject.proof, deviceCode: login.deviceCode } }, recovery);
  assert.equal(recovery.body.status, "authorization_code");
  assert.notEqual(recovery.body.code, originalCode);
  const stale = response(); await subject.handlers.exchange({ body: { ...subject.proof, deviceCode: login.deviceCode, code: originalCode } }, stale);
  assert.equal(stale.statusCode, 410);
  const accepted = response(); await subject.handlers.exchange({ body: { ...subject.proof, deviceCode: login.deviceCode, code: recovery.body.code } }, accepted);
  assert.equal(accepted.statusCode, 200);
});

test("browser deny and expiry stop approval; polling fallback has no redirect URI", async () => {
  for (const action of ["deny", "expire"]) {
    const { subject, body } = await browserIntent();
    if (action === "deny") {
      const denied = response(); await subject.handlers.deny({ body, user: { id: "user-a" } }, denied);
      assert.equal(denied.body.status, "cancelled");
    } else subject.prisma.records[0].expiresAt = new Date(Date.now() - 1000);
    const approval = response();
    await subject.handlers.approve({ body, user: { id: "user-a" }, browserSession: "browser-v1" }, approval);
    assert.equal(approval.statusCode, 400);
  }
  const { subject, body } = await browserIntent("authorization_code");
  const approval = response();
  await subject.handlers.approve({ body, user: { id: "user-a" }, browserSession: "browser-v1" }, approval);
  assert.equal(approval.statusCode, 200); assert.equal(approval.body.callbackUri, undefined);
});

test("desktop-login route lifecycle is pending, approved and consumed exactly once", async () => {
  const subject = fixture();
  const login = await initiate(subject);
  const persisted = JSON.stringify(subject.prisma.records[0]);
  assert.equal(persisted.includes(login.deviceCode), false);
  assert.equal(persisted.includes(login.userCode), false);
  assert.equal(login.verificationUri, "https://fimamacro.com/desktop-login");
  assert.equal(subject.prisma.records[0].deviceName, "FIMA Gaming PC");

  const context = response();
  await subject.handlers.context({ body: { userCode: login.userCode }, user: { id: "user-a" } }, context);
  assert.equal(context.body.status, "pending");
  assert.equal(context.body.canApprove, true);

  const pending = response();
  await subject.handlers.poll({ body: { ...subject.proof, deviceCode: login.deviceCode } }, pending);
  assert.equal(pending.statusCode, 202);
  assert.equal(pending.body.status, "pending");

  const approved = response();
  await subject.handlers.approve({ body: { userCode: login.userCode }, user: { id: "user-a" }, browserSession: "browser-v1" }, approved);
  assert.equal(approved.body.status, "approved");

  const consumed = response();
  await subject.handlers.poll({ body: { ...subject.proof, deviceCode: login.deviceCode } }, consumed);
  assert.equal(consumed.statusCode, 200);
  assert.equal(consumed.body.status, "consumed");
  assert.equal(consumed.body.entitlementToken, "signed-account-token");
  assert.equal(isStrictAccountOnlyEntitlementPayload(consumed.body.entitlement), true);

  const replay = response();
  await subject.handlers.poll({ body: { ...subject.proof, deviceCode: login.deviceCode } }, replay);
  assert.equal(replay.statusCode, 410);
  assert.equal(replay.body.success, false);
});

test("desktop-login rejects invalid proof and cancellation blocks later consumption", async () => {
  const subject = fixture();
  const login = await initiate(subject);

  const invalid = response();
  await subject.handlers.poll({
    body: { ...subject.proof, state: crypto.randomBytes(24).toString("base64url"), deviceCode: login.deviceCode }
  }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(subject.prisma.records[0].status, "pending");

  const cancelled = response();
  await subject.handlers.cancel({ body: { ...subject.proof, deviceCode: login.deviceCode } }, cancelled);
  assert.equal(cancelled.body.status, "cancelled");

  const poll = response();
  await subject.handlers.poll({ body: { ...subject.proof, deviceCode: login.deviceCode } }, poll);
  assert.equal(poll.statusCode, 410);
  assert.equal(poll.body.success, false);
});

test("desktop-login expires server-side and cannot be approved by another account", async () => {
  const subject = fixture();
  const login = await initiate(subject);

  const approved = response();
  await subject.handlers.approve({ body: { userCode: login.userCode }, user: { id: "user-a" }, browserSession: "browser-v1" }, approved);
  assert.equal(approved.body.status, "approved");

  const otherAccount = response();
  await subject.handlers.context({ body: { userCode: login.userCode }, user: { id: "user-b" } }, otherAccount);
  assert.equal(otherAccount.statusCode, 400);

  subject.prisma.records[0].expiresAt = new Date(Date.now() - 1);
  const expired = response();
  await subject.handlers.poll({ body: { ...subject.proof, deviceCode: login.deviceCode } }, expired);
  assert.equal(expired.statusCode, 410);
  assert.equal(expired.body.status, "expired");
  assert.equal(subject.prisma.records[0].status, "expired");
});
