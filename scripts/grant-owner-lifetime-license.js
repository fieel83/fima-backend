#!/usr/bin/env node
import { prisma } from "../src/db.js";
import { generateUniqueLicenseKey, normalizeHwid, normalizeLicenseKey } from "../src/license.js";
import { getPlan } from "../src/plans.js";

const OWNER_ROBLOX_USERNAME = "fieelcomplex";
const OWNER_ROBLOX_ID = "549482728";
const CONFIRM_VALUE = "bind-owner-existing-key";
const LEGACY_CONFIRM_VALUE = "grant-fieelcomplex-lifetime";
const INCIDENT_ID = "owner_lifetime_access_2026_06_14";

main()
  .catch((error) => {
    console.error(JSON.stringify({
      success: false,
      error: error.code || "owner_lifetime_grant_failed",
      message: maskSensitiveText(error.message),
      valuesPrinted: false,
      fullKeyPrinted: false
    }, null, 2));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });

async function main() {
  const confirmValue = String(process.env.OWNER_LIFETIME_GRANT_CONFIRM || "").trim();
  const dryRun = process.argv.includes("--dry-run") || ![CONFIRM_VALUE, LEGACY_CONFIRM_VALUE].includes(confirmValue);
  const ownerEmailNormalized = normalizeEmail(process.env.OWNER_LIFETIME_GRANT_EMAIL);
  const ownerLicenseKey = normalizeLicenseKey(process.env.OWNER_LIFETIME_LICENSE_KEY);
  const ownerHwid = normalizeHwid(process.env.OWNER_LIFETIME_OWNER_HWID);
  const plan = getPlan("lifetime");
  if (!plan) throw publicError("missing_lifetime_plan", "Lifetime plan is not configured.");

  const owner = await findOwnerAccount(ownerEmailNormalized);

  if (!owner) {
    return printResult({
      success: false,
      blocked: true,
      reason: "owner_account_not_found",
      ownerRobloxUsername: OWNER_ROBLOX_USERNAME,
      ownerRobloxIdMasked: maskId(OWNER_ROBLOX_ID),
      ownerEmailHintProvided: Boolean(ownerEmailNormalized),
      dryRun,
      created: false,
      alreadyExisted: false
    });
  }

  const existing = await prisma.license.findFirst({
    where: {
      plan: "lifetime",
      lifetime: true,
      OR: [
        ownerLicenseKey ? { licenseKey: ownerLicenseKey } : undefined,
        {
          AND: [
            { customerEmail: owner.email },
            { status: "active" },
            {
              OR: [
                { notes: { contains: "owner_internal_lifetime", mode: "insensitive" } },
                { notes: { contains: OWNER_ROBLOX_ID, mode: "insensitive" } }
              ]
            }
          ]
        }
      ]
        .filter(Boolean)
    },
    orderBy: { updatedAt: "desc" }
  });

  if (existing && !ownerLicenseKey && !ownerHwid) {
    return printResult({
      success: true,
      dryRun,
      created: false,
      alreadyExisted: true,
      ownerAccountMatched: true,
      ownerMatchSource: owner.__ownerMatchSource || "unknown",
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
      confirmValueNameOnly: "bind-owner-existing-key",
      ownerAccountMatched: true,
      ownerMatchSource: owner.__ownerMatchSource || "unknown",
      ownerUserIdMasked: maskId(owner.id),
      ownerRobloxUsername: owner.robloxUsername || OWNER_ROBLOX_USERNAME,
      ownerRobloxIdMasked: maskId(owner.robloxUserId || OWNER_ROBLOX_ID),
      existingOwnerKeyProvided: Boolean(ownerLicenseKey),
      ownerHwidProvided: Boolean(ownerHwid),
      paidLicensesAffected: 0
    });
  }

  const created = await prisma.$transaction(async (tx) => {
    const licenseKey = ownerLicenseKey || await generateUniqueLicenseKey(tx);
    const notes = [
      "owner_internal_lifetime",
      ownerLicenseKey ? "source=owner_existing_key_bind" : "source=owner_grant",
      `createdBy=system_security_hotfix`,
      `incidentId=${INCIDENT_ID}`,
      `ownerMatch=${safeRunId(owner.__ownerMatchSource || "unknown")}`,
      `ownerRoblox=${OWNER_ROBLOX_USERNAME}`,
      `ownerRobloxId=${OWNER_ROBLOX_ID}`,
      "adminAccess=owner_only"
    ].join(" ");
    const license = existing
      ? await tx.license.update({
        where: { id: existing.id },
        data: {
          customerEmail: owner.email,
          plan: plan.id,
          status: "active",
          hwid: ownerHwid || existing.hwid || null,
          expiresAt: null,
          lifetime: true,
          notes: mergeNotes(existing.notes, notes)
        }
      })
      : await tx.license.create({
        data: {
          licenseKey,
        customerEmail: owner.email,
        plan: plan.id,
        status: "active",
          hwid: ownerHwid || null,
        expiresAt: null,
        lifetime: true,
          notes
        }
      });
    await tx.auditLog.create({
      data: {
        action: existing ? "owner_lifetime_license_attached" : "owner_lifetime_license_granted",
        targetType: "license",
        targetId: license.id,
        metadata: {
          source: ownerLicenseKey ? "owner_existing_key_bind" : "owner_grant",
          createdBy: "system_security_hotfix",
          incidentId: INCIDENT_ID,
          userIdMasked: maskId(owner.id),
          ownerMatchSource: owner.__ownerMatchSource || "unknown",
          robloxUsername: OWNER_ROBLOX_USERNAME,
          robloxIdMasked: maskId(OWNER_ROBLOX_ID),
          licenseKeyMasked: maskCode(license.licenseKey),
          ownerHwidBound: Boolean(normalizeHwid(license.hwid)),
          fullKeyPrinted: false
        }
      }
    }).catch(() => null);
    return license;
  });

  return printResult({
    success: true,
    dryRun: false,
    created: !existing,
    alreadyExisted: Boolean(existing),
    ownerAccountMatched: true,
    ownerMatchSource: owner.__ownerMatchSource || "unknown",
    ownerUserIdMasked: maskId(owner.id),
    ownerRobloxUsername: owner.robloxUsername || OWNER_ROBLOX_USERNAME,
    ownerRobloxIdMasked: maskId(owner.robloxUserId || OWNER_ROBLOX_ID),
    licenseIdMasked: maskId(created.id),
    licenseKeyMasked: maskCode(created.licenseKey),
    existingOwnerKeyProvided: Boolean(ownerLicenseKey),
    ownerHwidBound: Boolean(normalizeHwid(created.hwid)),
    fullKeyPrinted: false,
    paidLicensesAffected: 0
  });
}

async function findOwnerAccount(ownerEmailNormalized) {
  const byRoblox = await prisma.user.findFirst({
    where: {
      OR: [
        { robloxUsername: { equals: OWNER_ROBLOX_USERNAME, mode: "insensitive" } },
        { robloxUserId: OWNER_ROBLOX_ID }
      ]
    },
    orderBy: { updatedAt: "desc" }
  });
  if (byRoblox) return withOwnerMatchSource(byRoblox, "roblox");

  if (!ownerEmailNormalized) return null;
  const byEmail = await prisma.user.findFirst({
    where: {
      OR: [
        { emailNormalized: ownerEmailNormalized },
        { email: { equals: ownerEmailNormalized, mode: "insensitive" } }
      ]
    },
    orderBy: { updatedAt: "desc" }
  });
  return byEmail ? withOwnerMatchSource(byEmail, "email_hint") : null;
}

function withOwnerMatchSource(owner, source) {
  return Object.defineProperty(owner, "__ownerMatchSource", {
    value: source,
    enumerable: false
  });
}

function mergeNotes(existing, addition) {
  const current = String(existing || "").trim();
  if (current.includes("owner_internal_lifetime")) return current;
  return [current, addition].filter(Boolean).join(" ").slice(0, 500);
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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function safeRunId(value) {
  return String(value || "run")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "run";
}

function maskSensitiveText(value) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[masked-email]")
    .replace(/FIMA[-_\s]?[A-Z0-9]{4,}(?:[-_\s]?[A-Z0-9]{4,}){2,}/gi, "FIMA-****");
}

function publicError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
