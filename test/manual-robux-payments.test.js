import assert from "node:assert/strict";
import test from "node:test";
import {
  createManualRobuxOrder,
  MANUAL_ROBUX_PRICES,
  MANUAL_ROBUX_PRICING_VERSION,
  manualRobuxQuote,
  reviewManualRobuxOrder
} from "../src/manualRobuxPayments.js";

function clone(value) {
  return structuredClone(value);
}

function paymentDb({ license = null, failLicenseCreate = false } = {}) {
  const state = { submissions: [], licenses: license ? [clone(license)] : [], audits: [] };
  const db = {
    paymentSubmission: {
      async findUnique({ where }) {
        const entry = state.submissions.find((item) => Object.entries(where).every(([key, value]) => item[key] === value));
        return entry ? clone({ ...entry, user: entry.user || null, license: state.licenses.find((item) => item.id === entry.licenseId) || null }) : null;
      },
      async findFirst({ where }) {
        const entry = state.submissions.find((item) => Object.entries(where).every(([key, value]) => item[key] === value));
        return entry ? clone(entry) : null;
      },
      async findMany({ where }) {
        return clone(state.submissions.filter((item) => item.userId === where.userId && item.type === where.type));
      },
      async create({ data }) {
        if (state.submissions.some((item) => item.idempotencyKeyHash === data.idempotencyKeyHash || item.pendingKey === data.pendingKey)) {
          const error = new Error("unique");
          error.code = "P2002";
          throw error;
        }
        const created = {
          id: `submission-${state.submissions.length + 1}`,
          status: "pending",
          notes: null,
          reviewedBy: null,
          reviewedAt: null,
          licenseId: null,
          createdAt: new Date("2026-07-18T00:00:00.000Z"),
          ...data,
          user: null,
          license: null
        };
        state.submissions.push(created);
        return clone(created);
      },
      async updateMany({ where, data }) {
        const entry = state.submissions.find((item) => item.id === where.id && item.status === where.status);
        if (!entry) return { count: 0 };
        Object.assign(entry, data);
        return { count: 1 };
      },
      async update({ where, data }) {
        const entry = state.submissions.find((item) => item.id === where.id);
        Object.assign(entry, data);
        return clone(entry);
      }
    },
    license: {
      async findUnique() {
        return null;
      },
      async findFirst({ where }) {
        const active = state.licenses.filter((item) => item.customerEmail === where.customerEmail && item.status === "active");
        if (where.OR) return clone(active.find((item) => item.lifetime || item.expiresAt == null) || null);
        const timed = active.filter((item) => !item.lifetime).sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt));
        return clone(timed[0] || null);
      },
      async create({ data }) {
        if (failLicenseCreate) throw new Error("license_create_failed");
        const created = { id: `license-${state.licenses.length + 1}`, createdAt: new Date(), ...data };
        state.licenses.push(created);
        return clone(created);
      },
      async update({ where, data }) {
        const entry = state.licenses.find((item) => item.id === where.id);
        Object.assign(entry, data);
        return clone(entry);
      }
    },
    auditLog: {
      async create({ data }) {
        state.audits.push(clone(data));
        return clone(data);
      }
    },
    async $transaction(callback) {
      const before = clone(state);
      try {
        return await callback(db);
      } catch (error) {
        state.submissions.splice(0, state.submissions.length, ...before.submissions);
        state.licenses.splice(0, state.licenses.length, ...before.licenses);
        state.audits.splice(0, state.audits.length, ...before.audits);
        throw error;
      }
    }
  };
  return { db, state };
}

const user = Object.freeze({
  id: "user-1",
  email: "BUYER@EXAMPLE.COM",
  discordUserId: "discord-real",
  discordUsername: "real-discord",
  robloxUserId: "roblox-real",
  robloxUsername: "Real_Roblox"
});

test("manual Robux quotes are server-owned and versioned", () => {
  assert.deepEqual(MANUAL_ROBUX_PRICES, {
    "3days": { premiumPlus: 150, standard: 215 },
    monthly: { premiumPlus: 750, standard: 1080 },
    lifetime: { premiumPlus: 4500, standard: 6430 }
  });
  assert.deepEqual(manualRobuxQuote("monthly", false), {
    plan: "monthly",
    premiumPlus: false,
    robuxAmount: 1080,
    pricingVersion: MANUAL_ROBUX_PRICING_VERSION
  });
  assert.throws(() => manualRobuxQuote("1day", true), { code: "trial_program_replaced_by_activity_rewards" });
});

test("submission ignores client price and identity overrides and replays safely", async () => {
  const { db, state } = paymentDb();
  const body = {
    plan: "3days",
    premiumPlus: true,
    robuxAmount: 1,
    robloxUsername: "Order_User",
    discordUserId: "attacker-controlled",
    discordUsername: "attacker-controlled"
  };
  const first = await createManualRobuxOrder(user, body, { db, idempotencyKey: "order-key-0001" });
  const replay = await createManualRobuxOrder(user, body, { db, idempotencyKey: "order-key-0001" });

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.submission.id, first.submission.id);
  assert.equal(state.submissions.length, 1);
  assert.equal(state.submissions[0].robuxAmount, 150);
  assert.equal(state.submissions[0].discordUserId, "discord-real");
  assert.equal(state.submissions[0].discordUsername, "real-discord");
  assert.equal(state.submissions[0].customerEmail, "buyer@example.com");
  assert.equal(state.audits.length, 1);
});

test("an account cannot create concurrent pending Robux orders", async () => {
  const { db } = paymentDb();
  await createManualRobuxOrder(user, { plan: "3days", premiumPlus: false }, { db, idempotencyKey: "order-key-0001" });
  await assert.rejects(
    createManualRobuxOrder(user, { plan: "monthly", premiumPlus: true }, { db, idempotencyKey: "order-key-0002" }),
    { code: "pending_submission_exists", statusCode: 409 }
  );
});

test("approval atomically creates and links one license", async () => {
  const { db, state } = paymentDb();
  const created = await createManualRobuxOrder(user, { plan: "monthly", premiumPlus: true }, { db, idempotencyKey: "order-key-0001" });
  const reviewed = await reviewManualRobuxOrder(created.submission.id, "approved", {
    db,
    now: new Date("2026-07-18T12:00:00.000Z"),
    reviewedBy: "admin-test"
  });

  assert.equal(reviewed.fulfillment.action, "created");
  assert.equal(state.submissions[0].status, "approved");
  assert.equal(state.submissions[0].pendingKey, null);
  assert.equal(state.submissions[0].licenseId, state.licenses[0].id);
  assert.equal(state.licenses[0].expiresAt.toISOString(), "2026-08-17T12:00:00.000Z");
  await assert.rejects(reviewManualRobuxOrder(created.submission.id, "approved", { db }), {
    code: "submission_already_reviewed",
    statusCode: 409
  });
  assert.equal(state.licenses.length, 1);
});

test("approval extends a timed license from its future expiry and preserves lifetime", async () => {
  const timed = paymentDb({
    license: {
      id: "license-timed",
      licenseKey: "FIMA-AAAA-BBBB-CCCC-DDDD",
      customerEmail: "buyer@example.com",
      status: "active",
      plan: "monthly",
      lifetime: false,
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    }
  });
  const order = await createManualRobuxOrder(user, { plan: "3days", premiumPlus: true }, { db: timed.db, idempotencyKey: "order-key-0001" });
  const result = await reviewManualRobuxOrder(order.submission.id, "approved", {
    db: timed.db,
    now: new Date("2026-07-18T12:00:00.000Z")
  });
  assert.equal(result.fulfillment.action, "extended");
  assert.equal(timed.state.licenses[0].expiresAt.toISOString(), "2026-08-04T00:00:00.000Z");

  const lifetime = paymentDb({
    license: {
      id: "license-life",
      licenseKey: "FIMA-EEEE-FFFF-GGGG-HHHH",
      customerEmail: "buyer@example.com",
      status: "active",
      plan: "lifetime",
      lifetime: true,
      expiresAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    }
  });
  const lifetimeOrder = await createManualRobuxOrder(user, { plan: "monthly", premiumPlus: false }, { db: lifetime.db, idempotencyKey: "order-key-0001" });
  const lifetimeResult = await reviewManualRobuxOrder(lifetimeOrder.submission.id, "approved", { db: lifetime.db });
  assert.equal(lifetimeResult.fulfillment.action, "lifetime_unchanged");
  assert.equal(lifetime.state.licenses[0].expiresAt, null);
});

test("fulfillment failure rolls the pending claim back", async () => {
  const { db, state } = paymentDb({ failLicenseCreate: true });
  const order = await createManualRobuxOrder(user, { plan: "lifetime", premiumPlus: true }, { db, idempotencyKey: "order-key-0001" });
  const pendingKey = state.submissions[0].pendingKey;
  await assert.rejects(reviewManualRobuxOrder(order.submission.id, "approved", { db }), /license_create_failed/u);
  assert.equal(state.submissions[0].status, "pending");
  assert.equal(state.submissions[0].pendingKey, pendingKey);
  assert.equal(state.submissions[0].licenseId, null);
  assert.equal(state.licenses.length, 0);
});
