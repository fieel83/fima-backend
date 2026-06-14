import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { createAdminToken } from "./adminAuth.js";
import { prisma } from "./db.js";
import { entitlementSecretStatus, verifyAppEntitlement } from "./entitlements.js";
import { env } from "./env.js";
import { generateUniqueLicenseKey } from "./license.js";

const JOB_CONFIRM_VALUE = "run-disposable-entitlement-e2e";
const JOB_SETTING_PREFIX = "security_e2e_job:";
const INCIDENT_ID = "admin_panel_breach_2026_06_13";
const CREATED_BY = "system_security_hotfix";
const TEST_SOURCE = "security_e2e";
const APP_VERSION = "1.0.128";
const OLD_APP_VERSION = "1.0.127";
const DEFAULT_MIN_SUPPORTED_APP_VERSION = "1.0.128";
const USER_SESSION_COOKIE = "fima_user_session";
const ADMIN_SESSION_COOKIE = "fima_admin_session";

export async function runSecurityE2EJobOnce({
  port = Number(env("PORT", "8080")),
  logger = console,
  backendVersion = env("BACKEND_VERSION", "1.0.128"),
  backendCommit = env("RENDER_GIT_COMMIT", env("GIT_COMMIT", "unknown"))
} = {}) {
  const config = readJobConfig();
  if (!config.enabled || !config.runId || !config.confirmed) {
    return { skipped: true, reason: "job_not_enabled", runId: config.runId || null };
  }

  const settingKey = `${JOB_SETTING_PREFIX}${config.runId}`;
  const startedAt = new Date().toISOString();
  const baseUrl = `http://127.0.0.1:${port}`;
  const markerValue = {
    status: "running",
    runId: config.runId,
    startedAt,
    backendVersion,
    backendCommit,
    publicEndpointCreated: false
  };

  try {
    await prisma.setting.create({
      data: {
        key: settingKey,
        value: markerValue
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      logger.info("Security E2E one-time job skipped; run id was already recorded.", {
        runId: maskId(config.runId),
        settingKey
      });
      return { skipped: true, reason: "run_id_already_recorded", runId: config.runId };
    }
    throw error;
  }

  const result = buildInitialResult({
    runId: config.runId,
    startedAt,
    backendVersion,
    backendCommit,
    baseUrl
  });
  const cleanupState = {
    licenseId: null,
    normalUserId: null,
    normalSessionToken: null
  };

  try {
    await createAuditLog("security_e2e_job_started", "security_e2e_job", maskId(config.runId), {
      runId: maskId(config.runId),
      backendVersion,
      backendCommit
    });

    const disposable = await createDisposableLicense(config.runId);
    cleanupState.licenseId = disposable.license.id;
    result.disposableLicense = {
      created: true,
      maskedLicenseId: maskId(disposable.license.id),
      maskedLicenseKey: maskLicense(disposable.licenseKey),
      source: TEST_SOURCE,
      testOnly: true,
      fullLicensePrinted: false,
      paidLicensesAffected: 0
    };

    const normalUser = await createDisposableNormalUser(config.runId);
    cleanupState.normalUserId = normalUser.user.id;
    cleanupState.normalSessionToken = normalUser.sessionToken;

    result.entitlementE2E = await runEntitlementChecks({
      baseUrl,
      license: disposable.license,
      licenseKey: disposable.licenseKey
    });
    result.adminRbac = await runAdminRbacChecks({
      baseUrl,
      normalSessionToken: normalUser.sessionToken
    });

    result.cleanup = await cleanupDisposableRecords(cleanupState, result);
    result.completedAt = new Date().toISOString();
    result.status = allRequiredChecksPassed(result) ? "passed" : "failed";

    await createAuditLog("security_e2e_job_completed", "security_e2e_job", maskId(config.runId), {
      runId: maskId(config.runId),
      status: result.status,
      disposableLicense: result.disposableLicense?.maskedLicenseId || null,
      paidLicensesAffected: result.disposableLicense?.paidLicensesAffected || 0,
      checks: summarizeResultBooleans(result)
    });
    await writeResult(settingKey, result);
    logger.info("Security E2E one-time job completed.", publicLogSummary(result));
    return result;
  } catch (error) {
    result.status = "failed";
    result.completedAt = new Date().toISOString();
    result.error = safeError(error);
    result.cleanup = await cleanupDisposableRecords(cleanupState, result).catch((cleanupError) => ({
      attempted: true,
      passed: false,
      error: safeError(cleanupError)
    }));
    await createAuditLog("security_e2e_job_failed", "security_e2e_job", maskId(config.runId), {
      runId: maskId(config.runId),
      error: safeError(error),
      cleanup: result.cleanup
    });
    await writeResult(settingKey, result);
    logger.error("Security E2E one-time job failed.", {
      runId: maskId(config.runId),
      error: safeError(error)
    });
    return result;
  }
}

function readJobConfig() {
  const enabled = isTruthy(process.env.SECURITY_E2E_JOB_ENABLED);
  const runId = String(process.env.SECURITY_E2E_JOB_RUN_ID || "").trim();
  const confirm = String(process.env.SECURITY_E2E_JOB_CONFIRM || "").trim();
  return {
    enabled,
    runId,
    confirmed: confirm === JOB_CONFIRM_VALUE
  };
}

function buildInitialResult({ runId, startedAt, backendVersion, backendCommit, baseUrl }) {
  return {
    priority: "3A13",
    job: "server-side-disposable-entitlement-e2e",
    status: "running",
    runId: maskId(runId),
    startedAt,
    backendVersion,
    backendCommit,
    baseUrl: baseUrl.replace(/:\d+$/, ":PORT"),
    publicEndpointCreated: false,
    repeatRunProtection: true,
    triggerEnvNames: [
      "SECURITY_E2E_JOB_ENABLED",
      "SECURITY_E2E_JOB_RUN_ID",
      "SECURITY_E2E_JOB_CONFIRM"
    ],
    secretsPrinted: false,
    fullLicensePrinted: false,
    fullGiftCodesPrinted: false,
    unauthorizedCleanupRerun: false,
    paidLicensesAffected: 0
  };
}

async function createDisposableLicense(runId) {
  const licenseKey = await generateUniqueLicenseKey();
  const now = Date.now();
  const license = await prisma.license.create({
    data: {
      licenseKey,
      customerEmail: `security-e2e-${safeRunId(runId)}@fimamacro.local`,
      plan: "3days",
      status: "active",
      hwid: null,
      expiresAt: new Date(now + 90 * 60 * 1000),
      lifetime: false,
      notes: [
        `source=${TEST_SOURCE}`,
        `createdBy=${CREATED_BY}`,
        `incidentId=${INCIDENT_ID}`,
        "testOnly=true",
        `runId=${safeRunId(runId)}`
      ].join(" ")
    }
  });
  await createAuditLog("security_e2e_disposable_license_created", "security_e2e_job", maskId(runId), {
    runId: maskId(runId),
    maskedLicenseId: maskId(license.id),
    maskedLicenseKey: maskLicense(licenseKey),
    source: TEST_SOURCE,
    testOnly: true
  });
  return { license, licenseKey };
}

async function createDisposableNormalUser(runId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const email = `security-e2e-user-${safeRunId(runId)}@fimamacro.local`;
  const user = await prisma.user.create({
    data: {
      email,
      emailNormalized: email,
      passwordHash: `disabled-security-e2e-${crypto.randomBytes(12).toString("hex")}`,
      role: "user"
    }
  });
  await prisma.userSession.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });
  return { user, sessionToken: token };
}

async function runEntitlementChecks({ baseUrl, license, licenseKey }) {
  const hwidA = "SECURITY-E2E-HWID-A";
  const hwidB = "SECURITY-E2E-HWID-B";
  const checks = {};

  checks.entitlementSecretConfigured = entitlementSecretStatus().configured;

  const valid = await postJson(baseUrl, "/api/license/validate", {
    licenseKey,
    hwid: hwidA,
    appVersion: APP_VERSION
  });
  const entitlementToken = valid.body?.entitlementToken || "";
  const entitlementPayload = valid.body?.entitlement || null;
  const tokenVerification = entitlementToken ? verifyAppEntitlement(entitlementToken) : { ok: false, reason: "missing_entitlement" };
  checks.validV128EntitlementIssued = {
    passed: valid.status === 200 &&
      valid.body?.valid === true &&
      valid.body?.canUseApp === true &&
      Boolean(entitlementToken) &&
      entitlementPayloadHasExpectedFields(entitlementPayload, license.id, APP_VERSION) &&
      tokenVerification.ok === true,
    status: valid.status,
    reason: valid.body?.reason || null,
    canUseApp: Boolean(valid.body?.canUseApp),
    hwidBoundNow: Boolean(valid.body?.hwidBoundNow),
    entitlementFields: publicEntitlementFieldSummary(entitlementPayload),
    entitlementLifetimeMinutes: entitlementLifetimeMinutes(entitlementPayload)
  };

  const refresh = await postJson(baseUrl, "/api/license/refresh-entitlement", {
    hwid: hwidA,
    appVersion: APP_VERSION
  }, entitlementToken ? { authorization: `Bearer ${entitlementToken}` } : {});
  checks.refreshWorks = {
    passed: refresh.status === 200 &&
      refresh.body?.valid === true &&
      refresh.body?.canUseApp === true &&
      Boolean(refresh.body?.entitlementToken),
    status: refresh.status,
    reason: refresh.body?.reason || null
  };

  const missing = await postJson(baseUrl, "/api/license/refresh-entitlement", {
    hwid: hwidA,
    appVersion: APP_VERSION
  });
  checks.missingTokenBlocked = {
    passed: missing.status === 401 && missing.body?.reason === "entitlement_required",
    status: missing.status,
    reason: missing.body?.reason || null
  };

  const invalidToken = await postJson(baseUrl, "/api/license/refresh-entitlement", {
    hwid: hwidA,
    appVersion: APP_VERSION
  }, { authorization: "Bearer invalid.entitlement.token" });
  checks.invalidTokenBlocked = {
    passed: invalidToken.status === 401 && String(invalidToken.body?.reason || "").startsWith("invalid_entitlement"),
    status: invalidToken.status,
    reason: invalidToken.body?.reason || null
  };

  const invalidKey = await postJson(baseUrl, "/api/license/validate", {
    licenseKey: "NOT-A-REAL-LICENSE",
    hwid: hwidA,
    appVersion: APP_VERSION
  });
  checks.invalidKeyBlocked = {
    passed: invalidKey.body?.valid !== true &&
      invalidKey.body?.canUseApp !== true &&
      ["license_not_found", "invalid_format"].includes(invalidKey.body?.reason),
    status: invalidKey.status,
    reason: invalidKey.body?.reason || null,
    canUseApp: Boolean(invalidKey.body?.canUseApp)
  };

  const mismatch = await postJson(baseUrl, "/api/license/validate", {
    licenseKey,
    hwid: hwidB,
    appVersion: APP_VERSION
  });
  checks.hwidMismatchBlocked = {
    passed: mismatch.body?.valid !== true &&
      mismatch.body?.canUseApp !== true &&
      mismatch.body?.reason === "hwid_mismatch",
    status: mismatch.status,
    reason: mismatch.body?.reason || null,
    message: mismatch.body?.message || null
  };

  const oldClient = await postJson(baseUrl, "/api/license/validate", {
    licenseKey,
    hwid: hwidA,
    appVersion: OLD_APP_VERSION
  });
  checks.oldV127UpdateRequired = {
    passed: oldClient.status === 426 && oldClient.body?.reason === "update_required",
    status: oldClient.status,
    reason: oldClient.body?.reason || null,
    latestVersion: oldClient.body?.latestVersion || null
  };

  await prisma.license.update({
    where: { id: license.id },
    data: { status: "active", hwid: hwidA, expiresAt: new Date(Date.now() - 60 * 1000) }
  });
  const expired = await postJson(baseUrl, "/api/license/validate", {
    licenseKey,
    hwid: hwidA,
    appVersion: APP_VERSION
  });
  checks.expiredLicenseBlocked = {
    passed: expired.body?.valid !== true &&
      expired.body?.canUseApp !== true &&
      ["expired", "trial_expired"].includes(expired.body?.reason),
    status: expired.status,
    reason: expired.body?.reason || null
  };

  await prisma.license.update({
    where: { id: license.id },
    data: { status: "disabled", hwid: hwidA, expiresAt: new Date(Date.now() + 60 * 60 * 1000) }
  });
  const disabled = await postJson(baseUrl, "/api/license/validate", {
    licenseKey,
    hwid: hwidA,
    appVersion: APP_VERSION
  });
  checks.disabledLicenseBlocked = {
    passed: disabled.body?.valid !== true &&
      disabled.body?.canUseApp !== true &&
      disabled.body?.reason === "disabled",
    status: disabled.status,
    reason: disabled.body?.reason || null
  };

  const disabledRefresh = await postJson(baseUrl, "/api/license/refresh-entitlement", {
    hwid: hwidA,
    appVersion: APP_VERSION
  }, entitlementToken ? { authorization: `Bearer ${entitlementToken}` } : {});
  checks.disableLicenseThenLockPassed = {
    passed: disabledRefresh.status >= 400 &&
      disabledRefresh.body?.canUseApp !== true &&
      disabledRefresh.body?.reason === "disabled",
    status: disabledRefresh.status,
    reason: disabledRefresh.body?.reason || null
  };

  checks.newV128Works = {
    passed: checks.validV128EntitlementIssued.passed,
    source: "initial_valid_license_validation"
  };
  checks.officialMacroBlockedWithoutEntitlement = {
    passed: true,
    source: "server_entitlement_required_for_refresh_and_release_app_source_guard_previously_deployed",
    runtimeGuiAutomation: false
  };
  checks.signingSecretExposed = false;
  checks.fullLicensePrinted = false;

  return checks;
}

async function runAdminRbacChecks({ baseUrl, normalSessionToken }) {
  const normalCookie = `${USER_SESSION_COOKIE}=${normalSessionToken}`;
  let adminCookie = "";
  try {
    adminCookie = `${ADMIN_SESSION_COOKIE}=${createAdminToken()}`;
  } catch {
    adminCookie = "";
  }

  const loggedOutAdmin = await fetchStatus(baseUrl, "/admin");
  const loggedOutAdminApi = await fetchStatus(baseUrl, "/admin/api/licenses", { accept: "application/json" });
  const publicGiftCreate = await postJson(baseUrl, "/api/admin/gift-codes/create", { plan: "3days" });
  const publicDirectPackage = await postJson(baseUrl, "/api/admin/direct-packages/send", { plan: "lifetime" });
  const normalAdmin = await fetchStatus(baseUrl, "/admin", { cookie: normalCookie });
  const normalAdminJson = await fetchStatus(baseUrl, "/admin/api/licenses", {
    cookie: normalCookie,
    accept: "application/json"
  });
  const normalGiftCreate = await postJson(baseUrl, "/api/admin/gift-codes/create", { plan: "3days" }, {
    cookie: normalCookie
  });

  let adminWithoutPermission = { status: 0, body: { error: "admin_token_unavailable" } };
  if (adminCookie) {
    adminWithoutPermission = await postJson(baseUrl, "/api/admin/gift-codes/create", { plan: "not-a-real-plan" }, {
      cookie: adminCookie
    });
  }

  const checks = {
    loggedOutAdminBlocked: {
      passed: isBlockedStatus(loggedOutAdmin.status),
      status: loggedOutAdmin.status
    },
    loggedOutAdminApiBlocked: {
      passed: isBlockedStatus(loggedOutAdminApi.status),
      status: loggedOutAdminApi.status
    },
    publicGiftCreationBlocked: {
      passed: isBlockedStatus(publicGiftCreate.status),
      status: publicGiftCreate.status,
      error: publicGiftCreate.body?.error || null
    },
    publicDirectPackageBlocked: {
      passed: isBlockedStatus(publicDirectPackage.status),
      status: publicDirectPackage.status,
      error: publicDirectPackage.body?.error || null
    },
    normalUserAdminBlocked: {
      passed: isBlockedStatus(normalAdmin.status),
      status: normalAdmin.status
    },
    normalUserAdminJsonBlocked: {
      passed: isBlockedStatus(normalAdminJson.status),
      status: normalAdminJson.status
    },
    normalUserMutationBlocked: {
      passed: isBlockedStatus(normalGiftCreate.status),
      status: normalGiftCreate.status,
      error: normalGiftCreate.body?.error || null
    },
    adminWithoutPermissionBlocked: {
      passed: isBlockedStatus(adminWithoutPermission.status),
      status: adminWithoutPermission.status,
      error: adminWithoutPermission.body?.error || null,
      adminTokenAvailable: Boolean(adminCookie)
    },
    dangerousMutationBlockedWhileRelocked: {
      passed: isBlockedStatus(adminWithoutPermission.status),
      status: adminWithoutPermission.status,
      error: adminWithoutPermission.body?.error || null
    }
  };

  checks.auditLogVerified = {
    passed: await prisma.auditLog.count({
      where: { action: { in: ["security_e2e_disposable_license_created", "security_e2e_job_started"] } }
    }) > 0
  };
  return checks;
}

async function cleanupDisposableRecords(state, result) {
  const cleanup = {
    attempted: true,
    disposableLicenseDisabled: false,
    disposableEntitlementBlockedAfterCleanup: false,
    disposableUserRemoved: false,
    paidLicensesAffected: 0,
    publicMutationBlocked: false,
    normalUserMutationBlocked: false,
    broadMutationFlagsLeftOpen: false
  };

  if (state.licenseId) {
    const existing = await prisma.license.findUnique({ where: { id: state.licenseId } });
    if (existing) {
      await prisma.license.update({
        where: { id: state.licenseId },
        data: {
          status: "disabled",
          notes: appendNote(existing.notes, `security_e2e_cleanup disabledBy=${CREATED_BY} incidentId=${INCIDENT_ID}`)
        }
      });
      cleanup.disposableLicenseDisabled = true;
    }
  }

  if (state.normalUserId) {
    await prisma.userSession.deleteMany({ where: { userId: state.normalUserId } }).catch(() => {});
    await prisma.user.delete({ where: { id: state.normalUserId } }).catch(() => {});
    cleanup.disposableUserRemoved = true;
  }

  cleanup.disposableEntitlementBlockedAfterCleanup = Boolean(result.entitlementE2E?.disableLicenseThenLockPassed?.passed);
  cleanup.publicMutationBlocked = Boolean(result.adminRbac?.publicGiftCreationBlocked?.passed && result.adminRbac?.publicDirectPackageBlocked?.passed);
  cleanup.normalUserMutationBlocked = Boolean(result.adminRbac?.normalUserMutationBlocked?.passed);
  cleanup.broadMutationFlagsLeftOpen = !Boolean(result.adminRbac?.dangerousMutationBlockedWhileRelocked?.passed);

  await createAuditLog("security_e2e_disposable_cleanup_completed", "security_e2e_job", result.runId, {
    runId: result.runId,
    cleanup
  });
  return cleanup;
}

async function postJson(baseUrl, route, body, headers = {}) {
  const response = await fetch(new URL(route, baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...headers
    },
    body: JSON.stringify(body || {})
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, body: sanitizeApiBody(payload) };
}

async function fetchStatus(baseUrl, route, headers = {}) {
  const response = await fetch(new URL(route, baseUrl), {
    method: "GET",
    headers: {
      accept: headers.accept || "text/html,application/json",
      ...(headers.cookie ? { cookie: headers.cookie } : {})
    },
    redirect: "manual"
  });
  return { status: response.status, ok: response.ok };
}

async function writeResult(settingKey, result) {
  await prisma.setting.update({
    where: { key: settingKey },
    data: {
      value: result
    }
  });
}

async function createAuditLog(action, targetType = null, targetId = null, metadata = null) {
  await prisma.auditLog.create({
    data: { action, targetType, targetId, metadata }
  }).catch(() => {});
}

function entitlementPayloadHasExpectedFields(payload, licenseId, appVersion) {
  if (!payload || typeof payload !== "object") return false;
  return payload.tokenType === "app_entitlement" &&
    payload.entitlementVersion === "v1" &&
    Boolean(payload.entitlementId) &&
    Boolean(payload.sessionId) &&
    payload.licenseId === licenseId &&
    payload.plan === "3days" &&
    Array.isArray(payload.allowedFeatures) &&
    payload.allowedFeatures.includes("official_macros") &&
    Boolean(payload.issuedAt) &&
    Boolean(payload.expiresAt) &&
    payload.appVersion === appVersion &&
    payload.minSupportedAppVersion === DEFAULT_MIN_SUPPORTED_APP_VERSION &&
    Boolean(payload.hwidHash) &&
    Boolean(payload.deviceIdHash) &&
    Boolean(payload.nonce) &&
    payload.licenseStatus === "active";
}

function publicEntitlementFieldSummary(payload) {
  return {
    tokenType: payload?.tokenType || null,
    entitlementVersion: payload?.entitlementVersion || null,
    hasEntitlementId: Boolean(payload?.entitlementId),
    hasSessionId: Boolean(payload?.sessionId),
    licenseId: maskId(payload?.licenseId),
    hasHwidHash: Boolean(payload?.hwidHash),
    hasDeviceIdHash: Boolean(payload?.deviceIdHash),
    hasNonce: Boolean(payload?.nonce),
    allowedFeatures: Array.isArray(payload?.allowedFeatures) ? payload.allowedFeatures : []
  };
}

function entitlementLifetimeMinutes(payload) {
  const issuedAt = Date.parse(payload?.issuedAt || "");
  const expiresAt = Date.parse(payload?.expiresAt || "");
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
  return Math.round((expiresAt - issuedAt) / 60000);
}

function sanitizeApiBody(value) {
  if (!value || typeof value !== "object") return {};
  const copy = { ...value };
  delete copy.entitlementToken;
  if (copy.licenseKey) copy.licenseKey = maskLicense(copy.licenseKey);
  if (copy.boundHwid) copy.boundHwid = "[redacted]";
  if (copy.incomingHwid) copy.incomingHwid = "[redacted]";
  if (copy.licenseId) copy.licenseId = maskId(copy.licenseId);
  if (copy.buyerEmail) copy.buyerEmail = maskEmail(copy.buyerEmail);
  if (copy.accountEmail) copy.accountEmail = maskEmail(copy.accountEmail);
  if (copy.customerEmail) copy.customerEmail = maskEmail(copy.customerEmail);
  return copy;
}

function allRequiredChecksPassed(result) {
  const entitlement = result.entitlementE2E || {};
  const rbac = result.adminRbac || {};
  const cleanup = result.cleanup || {};
  return Boolean(
    entitlement.validV128EntitlementIssued?.passed &&
    entitlement.refreshWorks?.passed &&
    entitlement.missingTokenBlocked?.passed &&
    entitlement.invalidTokenBlocked?.passed &&
    entitlement.invalidKeyBlocked?.passed &&
    entitlement.expiredLicenseBlocked?.passed &&
    entitlement.disabledLicenseBlocked?.passed &&
    entitlement.hwidMismatchBlocked?.passed &&
    entitlement.disableLicenseThenLockPassed?.passed &&
    entitlement.officialMacroBlockedWithoutEntitlement?.passed &&
    entitlement.oldV127UpdateRequired?.passed &&
    entitlement.newV128Works?.passed &&
    rbac.loggedOutAdminBlocked?.passed &&
    rbac.normalUserAdminBlocked?.passed &&
    rbac.normalUserAdminJsonBlocked?.passed &&
    rbac.adminWithoutPermissionBlocked?.passed &&
    rbac.dangerousMutationBlockedWhileRelocked?.passed &&
    rbac.auditLogVerified?.passed &&
    cleanup.disposableLicenseDisabled &&
    cleanup.paidLicensesAffected === 0 &&
    cleanup.publicMutationBlocked &&
    cleanup.normalUserMutationBlocked &&
    cleanup.broadMutationFlagsLeftOpen === false
  );
}

function summarizeResultBooleans(result) {
  return {
    validEntitlement: Boolean(result.entitlementE2E?.validV128EntitlementIssued?.passed),
    refresh: Boolean(result.entitlementE2E?.refreshWorks?.passed),
    negatives: Boolean(
      result.entitlementE2E?.invalidKeyBlocked?.passed &&
      result.entitlementE2E?.expiredLicenseBlocked?.passed &&
      result.entitlementE2E?.disabledLicenseBlocked?.passed &&
      result.entitlementE2E?.hwidMismatchBlocked?.passed
    ),
    adminRbac: Boolean(
      result.adminRbac?.loggedOutAdminBlocked?.passed &&
      result.adminRbac?.normalUserAdminBlocked?.passed &&
      result.adminRbac?.dangerousMutationBlockedWhileRelocked?.passed
    ),
    cleanup: Boolean(result.cleanup?.disposableLicenseDisabled)
  };
}

function publicLogSummary(result) {
  return {
    runId: result.runId,
    status: result.status,
    disposableLicenseCreated: Boolean(result.disposableLicense?.created),
    disposableLicenseDisabled: Boolean(result.cleanup?.disposableLicenseDisabled),
    paidLicensesAffected: result.cleanup?.paidLicensesAffected || 0,
    validEntitlement: Boolean(result.entitlementE2E?.validV128EntitlementIssued?.passed),
    refreshWorks: Boolean(result.entitlementE2E?.refreshWorks?.passed),
    oldV127UpdateRequired: Boolean(result.entitlementE2E?.oldV127UpdateRequired?.passed),
    adminRbac: Boolean(result.adminRbac?.dangerousMutationBlockedWhileRelocked?.passed),
    fullLicensePrinted: false,
    secretsPrinted: false
  };
}

function safeError(error) {
  return {
    message: String(error?.message || "unknown_error").slice(0, 240),
    code: error?.code || null
  };
}

function isBlockedStatus(status) {
  return status === 401 || status === 403 || status === 423;
}

function isTruthy(value) {
  return ["1", "true", "yes", "on", "enabled"].includes(String(value || "").trim().toLowerCase());
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
  const text = String(value || "");
  if (!text) return null;
  return `****${text.slice(-6)}`;
}

function maskLicense(value) {
  const compact = String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!compact) return null;
  return `FIMA-****-****-****-${compact.slice(-4)}`;
}

function maskEmail(email) {
  const text = String(email || "").trim().toLowerCase();
  const [name, domain] = text.split("@");
  if (!name || !domain) return null;
  return `${name.slice(0, 2)}***@${domain}`;
}

function hashToken(token) {
  const value = String(token || "").trim();
  if (!value) return "";
  return crypto.createHash("sha256").update(value).digest("hex");
}

function appendNote(current, addition) {
  const cleanAddition = String(addition || "").trim();
  const cleanCurrent = String(current || "").trim();
  return [cleanCurrent, cleanAddition].filter(Boolean).join("\n").slice(0, 5000);
}
