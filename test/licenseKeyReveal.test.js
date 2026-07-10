import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const accountSource = fs.readFileSync(new URL("../public/assets/js/account.js", import.meta.url), "utf8");
const successSource = fs.readFileSync(new URL("../public/assets/js/success.js", import.meta.url), "utf8");

test("license reveal keeps GET metadata-only and moves raw-key repair to CSRF-protected POST", () => {
  const getStart = serverSource.indexOf('app.get("/api/me/license-records/:licenseId/key"');
  const postStart = serverSource.indexOf('app.post("/api/me/license-records/:licenseId/key"');
  assert.ok(getStart >= 0, "safe key-status GET route should exist");
  assert.ok(postStart > getStart, "raw-key reveal route should be a separate POST after status GET");
  const getRoute = serverSource.slice(getStart, postStart);
  const postRoute = serverSource.slice(postStart, serverSource.indexOf('app.post("/api/me/license-records/:licenseId/download"', postStart));
  assert.match(getRoute, /licenseKey:\s*null/);
  assert.doesNotMatch(getRoute, /licenseKey:\s*license\.licenseKey/);
  assert.match(getRoute, /Cache-Control",\s*"no-store, private"/);
  assert.match(postRoute, /Cache-Control",\s*"no-store, private"/);
  assert.match(postRoute, /repairPaidLicenseKey\(license\.id,\s*\{\s*actorType:\s*"user"/s);
  assert.ok(serverSource.indexOf("app.use(requireCsrfForCookieMutations") < postStart, "POST must be behind cookie CSRF middleware");
});

test("paid-license scan pages through all license rows instead of using a fixed cap", () => {
  const scanStart = serverSource.indexOf("async function scanProductionLicenseKeyRepairs()");
  const scanEnd = serverSource.indexOf("async function repairPaidLicenseKey", scanStart);
  const scan = serverSource.slice(scanStart, scanEnd);
  assert.match(scan, /const pageSize = 500/);
  assert.match(scan, /cursor:\s*\{ id: cursorId \}/);
  assert.match(scan, /scanScope:\s*"all_license_records_paginated"/);
  assert.doesNotMatch(scan, /take:\s*2000/);
});

test("account copy retries with a fallback and uses the protected reveal POST", () => {
  assert.match(accountSource, /await navigator\.clipboard\.writeText\(text\);\s*return;\s*}\s*catch/s);
  assert.match(accountSource, /license-records\/\$\{encodeURIComponent\(copyLicenseIdButton\.dataset\.copyLicenseId\)\}\/key`, \{ method: "POST" \}/);
});

test("checkout result never leaves a paid customer with a silent empty-key copy action", () => {
  assert.match(successSource, /licenseRequiresSecureReveal = !activeLicenseKey/);
  assert.match(successSource, /Open My Products to securely reveal and copy your license key/);
  assert.match(successSource, /window\.location\.assign\("\/dashboard\/products"\)/);
  assert.match(successSource, /copyWithFallback/);
});
