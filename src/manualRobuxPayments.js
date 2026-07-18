import crypto from "node:crypto";
import { prisma } from "./db.js";
import { buildLicenseData, generateUniqueLicenseKey } from "./license.js";
import { getPlan, getPlanExpiry, isPublicCheckoutPlan } from "./plans.js";
import { isLegacyTrialPlan, LEGACY_TRIAL_PROGRAM_STATUS } from "./trialPromo.js";

export const MANUAL_ROBUX_PRICING_VERSION = "2026-07-18-v1";
export const MANUAL_ROBUX_PRICES = Object.freeze({
  "3days": Object.freeze({ premiumPlus: 150, standard: 215 }),
  monthly: Object.freeze({ premiumPlus: 750, standard: 1080 }),
  lifetime: Object.freeze({ premiumPlus: 4500, standard: 6430 })
});

const SUBMISSION_TYPE = "robux_manual";
const ROBLOX_USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;

function paymentError(code, statusCode = 400, extra = {}) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function normalizeProofUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.length > 2048) throw paymentError("invalid_proof_url");
  try {
    const parsed = new URL(raw);
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("unsupported_protocol");
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    throw paymentError("invalid_proof_url");
  }
}

function normalizePlan(planId) {
  const plan = getPlan(planId);
  if (!plan) throw paymentError("invalid_plan");
  if (isLegacyTrialPlan(plan) || !isPublicCheckoutPlan(plan.id)) {
    throw paymentError("trial_program_replaced_by_activity_rewards", 400, {
      programStatus: LEGACY_TRIAL_PROGRAM_STATUS
    });
  }
  if (!MANUAL_ROBUX_PRICES[plan.id]) throw paymentError("robux_price_unavailable", 409);
  return plan;
}

export function manualRobuxQuote(planId, premiumPlus) {
  const plan = normalizePlan(planId);
  if (typeof premiumPlus !== "boolean") throw paymentError("premium_plus_required");
  return {
    plan: plan.id,
    premiumPlus,
    robuxAmount: MANUAL_ROBUX_PRICES[plan.id][premiumPlus ? "premiumPlus" : "standard"],
    pricingVersion: MANUAL_ROBUX_PRICING_VERSION
  };
}

export async function createManualRobuxOrder(user, body = {}, options = {}) {
  const db = options.db || prisma;
  if (!user?.id || !user?.email) throw paymentError("account_required", 401);

  const quote = manualRobuxQuote(body.plan, body.premiumPlus);
  const robloxUsername = String(body.robloxUsername || user.robloxUsername || "").trim();
  if (!ROBLOX_USERNAME_PATTERN.test(robloxUsername)) throw paymentError("invalid_roblox_username");

  const idempotencyKey = String(options.idempotencyKey || body.idempotencyKey || "").trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) throw paymentError("invalid_idempotency_key");

  const idempotencyKeyHash = sha256(`${SUBMISSION_TYPE}:${user.id}:${idempotencyKey}`);
  const pendingKey = sha256(`${SUBMISSION_TYPE}:pending:${user.id}`);
  const include = { user: true, license: true };

  const replay = await db.paymentSubmission.findUnique({ where: { idempotencyKeyHash }, include });
  if (replay) return { submission: replay, replayed: true };

  const pending = await db.paymentSubmission.findUnique({ where: { pendingKey }, include });
  if (pending) {
    throw paymentError("pending_submission_exists", 409, { submissionId: pending.id });
  }

  try {
    const submission = await db.$transaction(async (tx) => {
      const created = await tx.paymentSubmission.create({
        data: {
          userId: user.id,
          type: SUBMISSION_TYPE,
          plan: quote.plan,
          customerEmail: String(user.email).trim().toLowerCase(),
          discordUserId: String(user.discordUserId || "").trim() || null,
          discordUsername: String(user.discordUsername || "").trim().slice(0, 80) || null,
          robloxUserId: String(user.robloxUserId || "").trim().slice(0, 80) || null,
          robloxUsername,
          premiumPlus: quote.premiumPlus,
          robuxAmount: quote.robuxAmount,
          pricingVersion: quote.pricingVersion,
          idempotencyKeyHash,
          pendingKey,
          proofUrl: normalizeProofUrl(body.proofUrl),
          proofText: String(body.proofText || "").trim().slice(0, 3000) || null
        },
        include
      });
      await tx.auditLog.create({
        data: {
          action: "manual_robux_submitted",
          targetType: "payment_submission",
          targetId: created.id,
          metadata: {
            userId: user.id,
            plan: quote.plan,
            pricingVersion: quote.pricingVersion,
            robuxAmount: quote.robuxAmount,
            discordLinked: Boolean(created.discordUserId),
            robloxUsername
          }
        }
      });
      return created;
    }, { isolationLevel: "Serializable" });
    return { submission, replayed: false };
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const idempotent = await db.paymentSubmission.findUnique({ where: { idempotencyKeyHash }, include });
    if (idempotent) return { submission: idempotent, replayed: true };
    const conflictingPending = await db.paymentSubmission.findUnique({ where: { pendingKey }, include });
    throw paymentError("pending_submission_exists", 409, { submissionId: conflictingPending?.id || null });
  }
}

export async function listManualRobuxOrders(userId, options = {}) {
  const db = options.db || prisma;
  if (!userId) throw paymentError("account_required", 401);
  return db.paymentSubmission.findMany({
    where: { userId, type: SUBMISSION_TYPE },
    include: { license: true },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(Number(options.take) || 20, 1), 50)
  });
}

export async function getManualRobuxOrder(userId, submissionId, options = {}) {
  const db = options.db || prisma;
  if (!userId) throw paymentError("account_required", 401);
  const submission = await db.paymentSubmission.findFirst({
    where: { id: String(submissionId || ""), userId, type: SUBMISSION_TYPE },
    include: { license: true }
  });
  if (!submission) throw paymentError("submission_not_found", 404);
  return submission;
}

async function findActiveLicense(tx, customerEmail) {
  const lifetime = await tx.license.findFirst({
    where: {
      customerEmail,
      status: "active",
      OR: [{ lifetime: true }, { expiresAt: null }]
    },
    orderBy: { createdAt: "desc" }
  });
  if (lifetime) return lifetime;
  return tx.license.findFirst({
    where: { customerEmail, status: "active", lifetime: false },
    orderBy: { expiresAt: "desc" }
  });
}

async function fulfillManualRobuxLicense(tx, submission, now) {
  const plan = normalizePlan(submission.plan);
  const customerEmail = String(submission.customerEmail || submission.user?.email || "").trim().toLowerCase();
  if (!customerEmail) throw paymentError("submission_account_missing", 409);

  const existing = await findActiveLicense(tx, customerEmail);
  if (existing && (existing.lifetime || existing.expiresAt == null)) {
    return { license: existing, action: "lifetime_unchanged" };
  }

  if (existing) {
    if (plan.lifetime) {
      const license = await tx.license.update({
        where: { id: existing.id },
        data: { plan: plan.id, lifetime: true, expiresAt: null, status: "active" }
      });
      return { license, action: "upgraded_to_lifetime" };
    }
    const currentExpiry = existing.expiresAt instanceof Date ? existing.expiresAt : new Date(existing.expiresAt || 0);
    const baseDate = currentExpiry > now ? currentExpiry : now;
    const license = await tx.license.update({
      where: { id: existing.id },
      data: { plan: plan.id, expiresAt: getPlanExpiry(plan, baseDate), lifetime: false, status: "active" }
    });
    return { license, action: "extended" };
  }

  const license = await tx.license.create({
    data: {
      ...buildLicenseData({
        licenseKey: await generateUniqueLicenseKey(tx),
        email: customerEmail,
        plan,
        notes: `Manual Robux order ${submission.id}`
      }),
      expiresAt: getPlanExpiry(plan, now)
    }
  });
  return { license, action: "created" };
}

export async function reviewManualRobuxOrder(submissionId, decision, options = {}) {
  const db = options.db || prisma;
  const status = decision === "approved" ? "approved" : decision === "rejected" ? "rejected" : null;
  if (!status) throw paymentError("invalid_review_decision");
  const reviewedBy = String(options.reviewedBy || "admin").trim().slice(0, 120) || "admin";
  const reviewNotes = String(options.notes || "").trim().slice(0, 1000) || null;
  const now = options.now instanceof Date ? options.now : new Date();

  return db.$transaction(async (tx) => {
    const submission = await tx.paymentSubmission.findUnique({
      where: { id: String(submissionId || "") },
      include: { user: true, license: true }
    });
    if (!submission || submission.type !== SUBMISSION_TYPE) throw paymentError("submission_not_found", 404);
    if (submission.status !== "pending") {
      throw paymentError("submission_already_reviewed", 409, { currentStatus: submission.status });
    }

    const claimed = await tx.paymentSubmission.updateMany({
      where: { id: submission.id, status: "pending" },
      data: {
        status,
        pendingKey: null,
        reviewedBy,
        reviewedAt: now,
        ...(reviewNotes ? { notes: reviewNotes } : {})
      }
    });
    if (claimed.count !== 1) throw paymentError("submission_already_reviewed", 409);

    const fulfillment = status === "approved"
      ? await fulfillManualRobuxLicense(tx, submission, now)
      : { license: null, action: "rejected" };

    if (fulfillment.license) {
      await tx.paymentSubmission.update({
        where: { id: submission.id },
        data: { licenseId: fulfillment.license.id }
      });
    }

    await tx.auditLog.create({
      data: {
        action: `manual_robux_${status}`,
        targetType: "payment_submission",
        targetId: submission.id,
        metadata: {
          plan: submission.plan,
          reviewer: reviewedBy,
          licenseId: fulfillment.license?.id || null,
          fulfillmentAction: fulfillment.action
        }
      }
    });

    const updated = await tx.paymentSubmission.findUnique({
      where: { id: submission.id },
      include: { user: true, license: true }
    });
    return { submission: updated, fulfillment };
  }, { isolationLevel: "Serializable" });
}
