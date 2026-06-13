import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const apiBase = String(process.env.FIMA_API_BASE_URL || process.env.API_BASE_URL || "https://fimamacro.com").replace(/\/+$/, "");
const adminKey = String(process.env.FIMA_ADMIN_API_KEY || process.env.ADMIN_API_KEY || "").trim();
const outputDir = path.resolve("artifacts/hotfix-v1.0.127/db-backup-before-trial-reset");
const exportPath = path.join(outputDir, "trial-license-export.json");
const summaryPath = path.join(outputDir, "backup-summary.json");
const tableListPath = path.join(outputDir, "schema-table-list.json");

if (!adminKey) {
  console.error("FIMA_ADMIN_API_KEY is required in the process environment. The key was not printed.");
  process.exit(2);
}

const response = await fetch(`${apiBase}/api/admin/backup/export-trial-license-data`, {
  method: "POST",
  headers: {
    "accept": "application/json",
    "x-admin-api-key": adminKey
  }
});

if (!response.ok) {
  const body = await response.text().catch(() => "");
  console.error(`Backup export failed with HTTP ${response.status}. Response body length: ${body.length}.`);
  process.exit(1);
}

const backup = await response.json();
const { checksumSha256, records, ...core } = backup;
const computedEndpointChecksum = crypto.createHash("sha256").update(JSON.stringify({ ...core, records })).digest("hex");
if (!checksumSha256 || computedEndpointChecksum !== checksumSha256) {
  console.error("Backup export checksum did not match the endpoint checksum.");
  process.exit(1);
}

await fs.mkdir(outputDir, { recursive: true });
const serialized = JSON.stringify(backup, null, 2);
await fs.writeFile(exportPath, serialized);

const fileChecksumSha256 = crypto.createHash("sha256").update(serialized).digest("hex");
const tableList = {
  createdAt: new Date().toISOString(),
  exportPath,
  includedCollections: backup.includedCollections || [],
  recordCounts: backup.recordCounts || {},
  totalRecords: backup.totalRecords || 0
};
await fs.writeFile(tableListPath, JSON.stringify(tableList, null, 2));

const summary = {
  createdAt: new Date().toISOString(),
  backend: backup.backend || null,
  exportType: backup.exportType || "targeted_trial_license_backup",
  backupPath: exportPath,
  tableListPath,
  includedCollections: backup.includedCollections || [],
  recordCounts: backup.recordCounts || {},
  totalRecords: backup.totalRecords || 0,
  endpointChecksumSha256: checksumSha256,
  endpointChecksumVerified: true,
  fileChecksumSha256,
  secretsIncluded: Boolean(backup.secretsIncluded),
  paidLicensesIncludedForSafety: backup.paidLicensesIncludedForSafety === true,
  paidLicensesWillBeModified: false,
  restoreNotes: backup.restoreNotes || []
};
await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

console.log(JSON.stringify({
  success: true,
  backupPath: exportPath,
  summaryPath,
  tableListPath,
  totalRecords: summary.totalRecords,
  endpointChecksumVerified: true,
  fileChecksumSha256
}, null, 2));
