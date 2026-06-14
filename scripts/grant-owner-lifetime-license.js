#!/usr/bin/env node
import { prisma } from "../src/db.js";
import { generateUniqueLicenseKey } from "../src/license.js";
import { getPlan } from "../src/plans.js";

const OWNER_ROBLOX_USERNAME = "fieelcomplex";
const OWNER_ROBLOX_ID = "549482728";
const CONFIRM_VALUE = "grant-fieelcomplex-lifetime";
const INCIDENT_ID = "owner_lifetime_access_2026_06_14";

main()
  .catch((error) => {
    console.error(JSON.stringify({
      success: false,
      error: error.code || "owner_lifetime_grant_failed",
      message: error.message,
      valuesPrinted: false,
      fullKeyPrinted: false
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });

async function main() {
  const dryRun = process.argv.includes("--dry-run") || process.env.OWNER_LIFETIME_GRANT_CONFIRM !== CONFIRM_VALUE;
  const plan = getPlan("lifetime");
  if (!plan) throw publicError("missing_lifetime_plan", "Lifetime plan is not configured.");

  const owner = await prisma.user.findFirst({
    where: {
      OR: [
        { robloxUsername: { equals: OWNER_ROBLOX_USERNAME, mode: "insensitive" } },
        { robloxUserId: OWNER_ROBLOX_ID }
      ]
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!owner) {
    return printResult({
      success: false,
      blocked: true,
      reason: "owner_account_not_found",
      ownerRobloxUsername: OWNER_ROBLOX_USERNAME,
      ownerRobloxIdMasked: maskId(OWNER_ROBLOX_ID),
      dryRun,
      created: false,
      alreadyExisted: false
    });
  }

  const existing = await prisma.license.findFirst({
    where: {
      customerEmail: owner.email,
      plan: "lifetime",
      lifetime: true,
      status: "active",
      OR: [
        { notes: { contains: "owner_internal_lifetime", mode: "insensitive" } },
        { notes: { contains: OWNER_ROBLOX_ID, mode: "insensitive" } }
      ]
    },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    return printResult({
      success: true,
      dryRun,
      created: false,
      alreadyExisted: true,
      ownerAccountMatched: true,
      ownerUserIdMasked: maskId(owner.id),
      ownerRobloxUsername: owner.robloxUsername || OWNER_ROBLOX_USERNAME,
      ownerRobloxIdMasked: maskId(owner.robloxUserId || OWNER_ROBLOX_ID),
      licenseIdMasked: maskId(existing.id),
      licenseKeyMasked: maskCode(existing.licenseKey),
      fullKeyPrinted: false,
      paidLicensesAffected: 0
    });
  }

  if (dryRun) {
    return printResult({
      success: true,
      dryRun: true,
      created: false,
      alreadyExisted: false,
      wouldCreate: true,
      confirmEnvRequired: "OWNER_LIFETIME_GRANT_CONFIRM",
      confirmValueNameOnly: "grant-fieelcomplex-lifetime",
      ownerAccountMatched: true,
      ownerUserIdMasked: maskId(owner.id),
      ownerRobloxUsername: owner.robloxUsername || OWNER_ROBLOX_USERNAME,
      ownerRobloxIdMasked: maskId(owner.robloxUserId || OWNER_ROBLOX_ID),
      paidLicensesAffected: 0
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const licenseKey = await generateUniqueLicenseKey(tx);
    const license = await tx.license.create({
      data: {
        licenseKey,
        customerEmail: owner.email,
        plan: plan.id,
        status: "active",
        hwid: null,
        expiresAt: null,
        lifetime: true,
        notes: [
          "owner_internal_lifetime",
          `source=owner_grant`,
          `createdBy=system_security_hotfix`,
          `incidentId=${INCIDENT_ID}`,
          `ownerRoblox=${OWNER_ROBLOX_USERNAME}`,
          `ownerRobloxId=${OWNER_ROBLOX_ID}`
        ].join(" ")
      }
    });
    await tx.auditLog.create({
      data: {
        action: "owner_lifetime_license_granted",
        targetType: "license",
        targetId: license.id,
        metadata: {
          source: "owner_grant",
          createdBy: "system_security_hotfix",
          incidentId: INCIDENT_ID,
          userId: owner.id,
          robloxUsername: OWNER_ROBLOX_USERNAME,
          robloxIdMasked: maskId(OWNER_ROBLOX_ID)
        }
      }
    }).catch(() => null);
    return license;
  });

  return printResult({
    success: true,
    dryRun: false,
    created: true,
    alreadyExisted: false,
    ownerAccountMatched: true,
    ownerUserIdMasked: maskId(owner.id),
    ownerRobloxUsername: owner.robloxUsername || OWNER_ROBLOX_USERNAME,
    ownerRobloxIdMasked: maskId(owner.robloxUserId || OWNER_ROBLOX_ID),
    licenseIdMasked: maskId(created.id),
    licenseKeyMasked: maskCode(created.licenseKey),
    fullKeyPrinted: false,
    paidLicensesAffected: 0
  });
}

function printResult(result) {
  console.log(JSON.stringify({
    createdAt: new Date().toISOString(),
    script: "grant-owner-lifetime-license",
    valuesPrinted: false,
    ...result
  }, null, 2));
}

function maskCode(value) {
  const text = String(value || "").trim();
  const last = text.replace(/[^A-Za-z0-9]/g, "").slice(-4);
  return last ? `FIMA-****-****-${last}` : "FIMA-****";
}

function maskId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function publicError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
