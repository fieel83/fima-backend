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

async function initiate(subject) {
  const res = response();
  await subject.handlers.initiate({
    body: {
      hwid: subject.proof.hwid,
      pkceChallenge: desktopPkceChallenge(subject.verifier),
      state: subject.state,
      appVersion: "0.2.0-candidate",
      deviceName: "  FIMA\u0000 Gaming   PC  ",
      devicePlatform: "Windows 11"
    }
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.headers["cache-control"], "no-store");
  return res.body;
}

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
