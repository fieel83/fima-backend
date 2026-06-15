import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { generateUniqueLicenseKey, normalizeHwid, normalizeLicenseKey } from "./license.js";
import { getPlan } from "./plans.js";

const JOB_CONFIRM_VALUE = "bind-owner-existing-key";
const LEGACY_JOB_CONFIRM_VALUE = "grant-fieelcomplex-lifetime";
const JOB_SETTING_PREFIX = "owner_lifetime_grant_job:";
const OWNER_ROBLOX_USERNAME = "fieelcomplex";
const OWNER_ROBLOX_ID = "549482728";
const INCIDENT_ID = "owner_lifetime_access_2026_06_15";
const CREATED_BY = "system_security_hotfix";

export async function runOwnerLifetimeGrantJobOnce({
  logger = console,
  backendVersion = env("BACKEND_VERSION", "1.0.128"),
  backendCommit = env("RENDER_GIT_COMMIT", env("GIT_COMMIT", "unknown"))
} = {}) {
  const config = readJobConfig();
  if (!config.enabled || !config.runId || !config.confirmed) {
    return { skipped: true, reason: "job_not_enabled", runId: config.runId ? maskId(config.runId) : null };
  }

  const settingKey = `${JOB_SETTING_PREFIX}${config.runId}`;
  const startedAt = new Date().toISOString();
  const result = {
    job: "owner-lifetime-grant",
    status: "running",
    runId: maskId(config.runId),
    startedAt,
    backendVersion,
    backendCommit,
    ownerRobloxUsername: OWNER_ROBLOX_USERNAME,
    ownerRobloxIdMasked: maskId(OWNER_ROBLOX_ID),
    ownerEmailHintProvided: Boolean(config.ownerEmailNormalized),
    existingOwnerKeyProvided: Boolean(config.ownerLicenseKey),
    ownerHwidProvided: Boolean(config.ownerHwid),
    publicEndpointCreated: false,
    repeatRunProtection: true,
    secretsPrinted: false,
    fullLicensePrinted: false,
    paidLicensesAffected: 0
  };

  try {
    await prisma.setting.create({
      data: {
        key: settingKey,
        value: result
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      logger.info("Owner lifetime grant skipped; run id was already recorded.", {
        runId: maskId(config.runId)
      });
      return { skipped: true, reason: "run_id_already_recorded", runId: maskId(config.runId) };
    }
    throw error;
  }

  try {
    await createAuditLog("owner_lifetime_grant_job_started", "owner_lifetime_grant_job", maskId(config.runId), {
      runId: maskId(config.runId),
      backendVersion,
      backendCommit,
      ownerRobloxUsername: OWNER_ROBLOX_USERNAME,
      ownerRobloxIdMasked: maskId(OWNER_ROBLOX_ID),
      ownerEmailHintProvided: Boolean(config.ownerEmailNormalized),
      existingOwnerKeyProvided: Boolean(config.ownerLicenseKey),
      ownerHwidProvided: Boolean(config.ownerHwid)
    });

    const owner = await findOwnerAccount(config);
    if (!owner) {
      result.status = "blocked";
      result.completedAt = new Date().toISOString();
      result.blockedReason = "owner_account_not_found";
      result.ownerAccountMatched = false;
      await writeResult(settingKey, result);
      await createAuditLog("owner_lifetime_grant_job_blocked", "owner_lifetime_grant_job", maskId(config.runId), {
        reason: result.blockedReason,
        ownerRobloxUsername: OWNER_ROBLOX_USERNAME,
        ownerRobloxIdMasked: maskId(OWNER_ROBLOX_ID),
        ownerEmailHintProvided: Boolean(config.ownerEmailNormalized)
      });
      logger.warn("Owner lifetime grant blocked.", {
        reason: result.blockedReason,
        ownerRobloxUsername: OWNER_ROBLOX_USERNAME,
        ownerRobloxIdMasked: maskId(OWNER_ROBLOX_ID),
        ownerEmailHintProvided: Boolean(config.ownerEmailNormalized)
      });
      return result;
    }

    result.ownerAccountMatched = true;
    result.ownerUserIdMasked = maskId(owner.id);
    result.ownerMatchSource = owner.__ownerMatchSource || "unknown";

    const existing = await findExistingOwnerLicense(owner.email, config.ownerLicenseKey);
    if (existing && !config.ownerLicenseKey) {
      result.status = "passed";
      result.completedAt = new Date().toISOString();
      result.created = false;
      result.alreadyExisted = true;
      result.visibleInMyProducts = true;
      result.licenseIdMasked = maskId(existing.id);
      result.licenseKeyMasked = maskLicense(existing.licenseKey);
      await writeResult(settingKey, result);
      await createAuditLog("owner_lifetime_grant_job_completed", "owner_lifetime_grant_job", maskId(config.runId), {
        runId: maskId(config.runId),
        status: result.status,
        created: false,
        alreadyExisted: true,
        licenseIdMasked: result.licenseIdMasked
      });
      logger.info("Owner lifetime grant completed.", publicLogSummary(result));
      return result;
    }

    const { license: created, created: licenseCreated, alreadyExisted } = await upsertOwnerLifetimeLicense(owner, config, result.ownerMatchSource);
    result.status = "passed";
    result.completedAt = new Date().toISOString();
    result.created = licenseCreated;
    result.alreadyExisted = alreadyExisted;
    result.visibleInMyProducts = true;
    result.ownerHwidBound = Boolean(normalizeHwid(created.hwid));
    result.adminAccessAttached = true;
    result.licenseIdMasked = maskId(created.id);
    result.licenseKeyMasked = maskLicense(created.licenseKey);
    await writeResult(settingKey, result);
    await createAuditLog("owner_lifetime_grant_job_completed", "owner_lifetime_grant_job", maskId(config.runId), {
      runId: maskId(config.runId),
      status: result.status,
      created: licenseCreated,
      alreadyExisted,
      licenseIdMasked: result.licenseIdMasked,
      ownerHwidBound: result.ownerHwidBound,
      paidLicensesAffected: 0
    });
    logger.info("Owner lifetime grant completed.", publicLogSummary(result));
    return result;
  } catch (error) {
    result.status = "failed";
    result.completedAt = new Date().toISOString();
    result.error = safeError(error);
    await writeResult(settingKey, result).catch(() => {});
    await createAuditLog("owner_lifetime_grant_job_failed", "owner_lifetime_grant_job", maskId(config.runId), {
      runId: maskId(config.runId),
      error: safeError(error)
    });
    logger.error("Owner lifetime grant failed.", { runId: maskId(config.runId), error: safeError(error) });
    return result;
  }
}

function readJobConfig() {
  const enabled = isTruthy(process.env.OWNER_LIFETIME_GRANT_ENABLED);
  const runId = String(process.env.OWNER_LIFETIME_GRANT_RUN_ID || "").trim();
  const confirm = String(process.env.OWNER_LIFETIME_GRANT_CONFIRM || "").trim();
  const ownerEmailNormalized = normalizeEmail(process.env.OWNER_LIFETIME_GRANT_EMAIL);
  const ownerLicenseKey = normalizeLicenseKey(process.env.OWNER_LIFETIME_LICENSE_KEY);
  const ownerHwid = normalizeHwid(process.env.OWNER_LIFETIME_OWNER_HWID);
  return {
    enabled,
    runId,
    confirmed: confirm === JOB_CONFIRM_VALUE || confirm === LEGACY_JOB_CONFIRM_VALUE,
    ownerEmailNormalized,
    ownerLicenseKey,
    ownerHwid
  };
}

async function findOwnerAccount(config = {}) {
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

  if (!config.ownerEmailNormalized) return null;
  const byEmail = await prisma.user.findFirst({
    where: {
      OR: [
        { emailNormalized: config.ownerEmailNormalized },
        { email: { equals: config.ownerEmailNormalized, mode: "insensitive" } }
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

function findExistingOwnerLicense(email, ownerLicenseKey = "") {
  return prisma.license.findFirst({
    where: {
      plan: "lifetime",
      lifetime: true,
      status: "active",
      OR: [
        ownerLicenseKey ? { licenseKey: ownerLicenseKey } : undefined,
        {
          customerEmail: email,
          OR: [
            { notes: { contains: "owner_internal_lifetime", mode: "insensitive" } },
            { notes: { contains: `ownerRoblox=${OWNER_ROBLOX_USERNAME}`, mode: "insensitive" } },
            { notes: { contains: `ownerRobloxId=${OWNER_ROBLOX_ID}`, mode: "insensitive" } }
          ]
        }
      ].filter(Boolean)
    },
    orderBy: { createdAt: "desc" }
  });
}

async function createOwnerLifetimeLicense(owner, runId, matchSource = "unknown") {
  const plan = getPlan("lifetime");
  if (!plan) throw publicError("missing_lifetime_plan", "Lifetime plan is not configured.");

  return prisma.$transaction(async (tx) => {
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
          "source=owner_grant",
          `createdBy=${CREATED_BY}`,
          `incidentId=${INCIDENT_ID}`,
          `runId=${safeRunId(runId)}`,
          `ownerMatch=${safeRunId(matchSource)}`,
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
          createdBy: CREATED_BY,
          incidentId: INCIDENT_ID,
          runId: maskId(runId),
          userIdMasked: maskId(owner.id),
          ownerMatchSource: matchSource,
          robloxUsername: OWNER_ROBLOX_USERNAME,
          robloxIdMasked: maskId(OWNER_ROBLOX_ID),
          licenseKeyPrinted: false
        }
      }
    }).catch(() => null);

    return license;
  });
}

async function upsertOwnerLifetimeLicense(owner, config, matchSource = "unknown") {
  if (!config.ownerLicenseKey) {
    const license = await createOwnerLifetimeLicense(owner, config.runId, matchSource);
    return { license, created: true, alreadyExisted: false };
  }

  const plan = getPlan("lifetime");
  if (!plan) throw publicError("missing_lifetime_plan", "Lifetime plan is not configured.");

  return prisma.$transaction(async (tx) => {
    const existingByKey = await tx.license.findUnique({ where: { licenseKey: config.ownerLicenseKey } });
    const notes = ownerLicenseNotes(config.runId, matchSource, "owner_existing_key_bind");
    const data = {
      customerEmail: owner.email,
      plan: plan.id,
      status: "active",
      hwid: config.ownerHwid || existingByKey?.hwid || null,
      expiresAt: null,
      lifetime: true,
      notes: mergeNotes(existingByKey?.notes, notes)
    };

    const license = existingByKey
      ? await tx.license.update({ where: { id: existingByKey.id }, data })
      : await tx.license.create({
          data: {
            ...data,
            licenseKey: config.ownerLicenseKey,
            stripeSessionId: null,
            stripePaymentIntentId: null
          }
        });

    await tx.auditLog.create({
      data: {
        action: existingByKey ? "owner_lifetime_license_attached" : "owner_lifetime_license_created_from_existing_key",
        targetType: "license",
        targetId: license.id,
        metadata: {
          source: "owner_existing_key_bind",
          createdBy: CREATED_BY,
          incidentId: INCIDENT_ID,
          runId: maskId(config.runId),
          userIdMasked: maskId(owner.id),
          ownerMatchSource: matchSource,
          robloxUsername: OWNER_ROBLOX_USERNAME,
          robloxIdMasked: maskId(OWNER_ROBLOX_ID),
          ownerHwidBound: Boolean(normalizeHwid(license.hwid)),
          licenseKeyMasked: maskLicense(license.licenseKey),
          licenseKeyPrinted: false
        }
      }
    }).catch(() => null);

    return { license, created: !existingByKey, alreadyExisted: Boolean(existingByKey) };
  });
}

function ownerLicenseNotes(runId, matchSource, source = "owner_grant") {
  return [
    "owner_internal_lifetime",
    `source=${source}`,
    `createdBy=${CREATED_BY}`,
    `incidentId=${INCIDENT_ID}`,
    `runId=${safeRunId(runId)}`,
    `ownerMatch=${safeRunId(matchSource)}`,
    `ownerRoblox=${OWNER_ROBLOX_USERNAME}`,
    `ownerRobloxId=${OWNER_ROBLOX_ID}`,
    "adminAccess=owner_only"
  ].join(" ");
}

function mergeNotes(existing, addition) {
  const current = String(existing || "").trim();
  if (!current) return addition;
  if (current.includes("owner_internal_lifetime")) return current;
  return `${current} ${addition}`.trim();
}

function writeResult(settingKey, result) {
  return prisma.setting.update({
    where: { key: settingKey },
    data: { value: result }
  });
}

async function createAuditLog(action, targetType = null, targetId = null, metadata = null) {
  await prisma.auditLog.create({
    data: { action, targetType, targetId, metadata }
  }).catch(() => {});
}

function publicLogSummary(result) {
  return {
    runId: result.runId,
    status: result.status,
    created: Boolean(result.created),
    alreadyExisted: Boolean(result.alreadyExisted),
    ownerAccountMatched: Boolean(result.ownerAccountMatched),
    visibleInMyProducts: Boolean(result.visibleInMyProducts),
    paidLicensesAffected: 0,
    fullLicensePrinted: false,
    secretsPrinted: false
  };
}

function safeError(error) {
  return {
    message: maskSensitiveText(String(error?.message || "unknown_error")).slice(0, 240),
    code: error?.code || null
  };
}

function isTruthy(value) {
  return ["1", "true", "yes", "on", "enabled"].includes(String(value || "").trim().toLowerCase());
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

function maskId(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length <= 8) return "***";
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function maskLicense(value) {
  const compact = String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!compact) return null;
  return `FIMA-****-****-****-${compact.slice(-4)}`;
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
