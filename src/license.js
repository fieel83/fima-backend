import crypto from "node:crypto";
import { prisma } from "./db.js";
import { getPlanExpiry } from "./plans.js";

const LICENSE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeLicenseKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^FIMA/, "")
    .match(/.{1,4}/g)
    ?.join("-")
    .replace(/^/, "FIMA-") || "";
}

export function normalizeHwid(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

function randomGroup(length = 4) {
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += LICENSE_ALPHABET[crypto.randomInt(0, LICENSE_ALPHABET.length)];
  }
  return out;
}

export function generateCandidateLicenseKey() {
  return `FIMA-${randomGroup()}-${randomGroup()}-${randomGroup()}-${randomGroup()}`;
}

export async function generateUniqueLicenseKey(tx = prisma) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const licenseKey = generateCandidateLicenseKey();
    const existing = await tx.license.findUnique({ where: { licenseKey } });
    if (!existing) return licenseKey;
  }
  throw new Error("Could not generate a unique license key");
}

export function licensePayload(license) {
  return {
    licenseKey: license.licenseKey,
    plan: license.plan,
    expiresAt: license.expiresAt ? license.expiresAt.toISOString() : null,
    lifetime: license.lifetime,
    customerEmail: license.customerEmail
  };
}

export function buildLicenseData({ licenseKey, email, plan, stripeSessionId = null, stripePaymentIntentId = null }) {
  return {
    licenseKey,
    customerEmail: email,
    plan: plan.id,
    status: "active",
    hwid: null,
    expiresAt: getPlanExpiry(plan),
    lifetime: plan.lifetime,
    stripeSessionId,
    stripePaymentIntentId
  };
}
