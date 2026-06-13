import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const incidentId = "admin_panel_breach_2026_06_13";
const revokedReason = "unauthorized_admin_panel_access";
const revokedBy = "system_security_hotfix";
const defaultBackupPath = "artifacts/hotfix-v1.0.127/db-backup-before-trial-reset/trial-license-export.json";
const defaultReportPath = "artifacts/security-v1.0.128/phase-5-unauthorized-gift-license-cleanup.json";

const args = new Set(process.argv.slice(2));
const confirm = args.has("--confirm");
const apiBase = valueArg("--api-base") || process.env.API_BASE_URL || "https://api.fimamacro.com";
const backupPath = valueArg("--backup") || defaultBackupPath;
const reportPath = valueArg("--report") || defaultReportPath;
const adminKey = String(process.env.FIMA_ADMIN_API_KEY || process.env.ADMIN_API_KEY || "").trim();

main().catch((error) => {
  console.error("Security cleanup failed", { message: error.message, code: error.code || null });
  process.exitCode = 1;
});

async function main() {
  const backup = readJson(backupPath);
  const records = backup.records || {};
  const giftCodes = records.giftCodes || [];
  const giftRedemptions = records.giftRedemptions || [];
  const licenses = records.licenses || [];
  const licenseById = new Map(licenses.map((license) => [license.id, license]));

  const suspiciousGiftCodes = giftCodes.filter(isSuspiciousAdminGift);
  const suspiciousGiftIds = new Set(suspiciousGiftCodes.map((gift) => gift.id));
  const suspiciousRedemptions = giftRedemptions.filter((redemption) =>
    suspiciousGiftIds.has(redemption.giftCodeId) && redemption.result === "success" && redemption.licenseId);
  const unauthorizedLicenses = suspiciousRedemptions
    .map((redemption) => licenseById.get(redemption.licenseId))
    .filter(Boolean);

  const paidLicenseCandidates = unauthorizedLicenses.filter((license) =>
    Boolean(license.stripeSessionId || license.stripePaymentIntentId || String(license.notes || "").includes("gift_code_purchase")));
  const purchasedGiftCandidates = suspiciousGiftCodes.filter((gift) =>
    Boolean(gift.stripeSessionId || gift.stripePaymentIntentId || gift.buyerUserId || gift.buyerEmail));

  const safeToMutate = paidLicenseCandidates.length === 0 && purchasedGiftCandidates.length === 0;
  const report = {
    createdAt: new Date().toISOString(),
    incidentId,
    backupPath: path.resolve(backupPath),
    backupChecksumSha256: sha256File(backupPath),
    confirmRequested: confirm,
    mutationRun: false,
    safeToMutate,
    suspiciousGiftCodesFound: suspiciousGiftCodes.length,
    suspiciousGiftCodesAlreadyRevoked: suspiciousGiftCodes.filter((gift) => gift.status === "revoked").length,
    suspiciousGiftCodesToRevoke: suspiciousGiftCodes.filter((gift) => gift.status !== "revoked").length,
    suspiciousRedeemedCodesFound: suspiciousRedemptions.length,
    unauthorizedLicensesCandidateCount: unauthorizedLicenses.length,
    paidCustomerGiftsAffected: purchasedGiftCandidates.length,
    paidLicensesAffected: paidLicenseCandidates.length,
    candidateGifts: suspiciousGiftCodes.map((gift) => ({
      id: gift.id,
      maskedCode: gift.maskedCode || maskCodeId(gift.id),
      plan: gift.plan,
      status: gift.status,
      usedCount: gift.usedCount,
      maxUses: gift.maxUses,
      createdAt: gift.createdAt
    })),
    candidateLicenses: unauthorizedLicenses.map((license) => ({
      id: license.id,
      maskedLicenseKey: maskLicense(license.licenseKey),
      plan: license.plan,
      status: license.status,
      lifetime: Boolean(license.lifetime),
      createdAt: license.createdAt
    })),
    actions: [],
    manualCommand: "set FIMA_ADMIN_API_KEY in the shell, verify ADMIN_PANEL_ENABLED/ADMIN_MUTATIONS_ENABLED/GIFT revoke envs on Render, then run: node scripts/security-cleanup-unauthorized-gifts.js --confirm"
  };

  if (!safeToMutate) {
    report.blockedBy = "Suspicious candidate set intersects paid/customer-linked gift or license data. Manual review required.";
    writeJson(reportPath, report);
    console.log(JSON.stringify(redactReportForConsole(report), null, 2));
    return;
  }

  if (!confirm) {
    report.blockedBy = "Dry run only. Add --confirm and FIMA_ADMIN_API_KEY after owner approval.";
    writeJson(reportPath, report);
    console.log(JSON.stringify(redactReportForConsole(report), null, 2));
    return;
  }

  if (!adminKey) {
    report.blockedBy = "FIMA_ADMIN_API_KEY or ADMIN_API_KEY is required for confirmed cleanup.";
    writeJson(reportPath, report);
    console.log(JSON.stringify(redactReportForConsole(report), null, 2));
    process.exitCode = 2;
    return;
  }

  for (const gift of suspiciousGiftCodes.filter((item) => item.status !== "revoked")) {
    const result = await adminPost(`/api/admin/gift-codes/${encodeURIComponent(gift.id)}/revoke`, {});
    report.actions.push({ type: "gift_revoke", id: gift.id, status: result.status, ok: result.ok });
  }

  for (const license of unauthorizedLicenses.filter((item) => item.status !== "disabled" && item.status !== "revoked" && item.status !== "banned")) {
    const statusResult = await adminPost(`/api/admin/licenses/${encodeURIComponent(license.id)}/status`, { status: "disabled" });
    report.actions.push({ type: "license_disable", id: license.id, status: statusResult.status, ok: statusResult.ok });

    const noteLine = `[${new Date().toISOString()}] ${revokedReason} revokedBy:${revokedBy} incidentId:${incidentId}`;
    const existingNotes = String(license.notes || "");
    const notes = [existingNotes, noteLine].filter(Boolean).join("\n").slice(0, 5000);
    const noteResult = await adminPost(`/api/admin/licenses/${encodeURIComponent(license.id)}/notes`, { notes });
    report.actions.push({ type: "license_note", id: license.id, status: noteResult.status, ok: noteResult.ok });
  }

  report.mutationRun = true;
  report.suspiciousGiftCodesRevoked = report.actions.filter((action) => action.type === "gift_revoke" && action.ok).length;
  report.unauthorizedLicensesDisabled = report.actions.filter((action) => action.type === "license_disable" && action.ok).length;
  report.revokedReason = revokedReason;
  report.revokedBy = revokedBy;
  report.revokedAt = new Date().toISOString();
  writeJson(reportPath, report);
  console.log(JSON.stringify(redactReportForConsole(report), null, 2));
}

function isSuspiciousAdminGift(gift) {
  if (!gift?.id) return false;
  if (!gift.createdByAdminId) return false;
  if (gift.stripeSessionId || gift.stripePaymentIntentId) return false;
  if (gift.buyerUserId || gift.buyerEmail) return false;
  if (String(gift.notes || "").includes("gift_code_purchase")) return false;
  return true;
}

async function adminPost(route, body) {
  const response = await fetch(new URL(route, apiBase), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-api-key": adminKey
    },
    body: JSON.stringify(body || {})
  });
  return { ok: response.ok, status: response.status };
}

function valueArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function maskLicense(value) {
  const compact = String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (!compact) return null;
  return `FIMA-****-****-****-${compact.slice(-4)}`;
}

function maskCodeId(value) {
  const text = String(value || "");
  return `gift_${text.slice(-6) || "masked"}`;
}

function redactReportForConsole(report) {
  return {
    createdAt: report.createdAt,
    incidentId: report.incidentId,
    confirmRequested: report.confirmRequested,
    mutationRun: report.mutationRun,
    safeToMutate: report.safeToMutate,
    suspiciousGiftCodesFound: report.suspiciousGiftCodesFound,
    suspiciousGiftCodesAlreadyRevoked: report.suspiciousGiftCodesAlreadyRevoked,
    suspiciousGiftCodesToRevoke: report.suspiciousGiftCodesToRevoke,
    suspiciousRedeemedCodesFound: report.suspiciousRedeemedCodesFound,
    unauthorizedLicensesCandidateCount: report.unauthorizedLicensesCandidateCount,
    paidCustomerGiftsAffected: report.paidCustomerGiftsAffected,
    paidLicensesAffected: report.paidLicensesAffected,
    suspiciousGiftCodesRevoked: report.suspiciousGiftCodesRevoked || 0,
    unauthorizedLicensesDisabled: report.unauthorizedLicensesDisabled || 0,
    blockedBy: report.blockedBy || null,
    reportPath: path.resolve(reportPath)
  };
}
