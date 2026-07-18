#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const API_BASE = "https://api.render.com/v1";
const ARTIFACT_DIR = "artifacts/security-v1.0.130";
const SAFE_DAILY_ALLOWLIST = new Set([
  "ADMIN_SESSION_VERSION",
  "ADMIN_SESSION_REVOKED_BEFORE",
  "ADMIN_DAILY_ROTATION_MARKER"
]);
const KEYRING_REQUIRED = new Set([
  "JWT_SECRET",
  "COOKIE_SECRET",
  "SESSION_SECRET",
  "AUTH_SECRET",
  "ENTITLEMENT_SIGNING_SECRET",
  "DOWNLOAD_SIGNING_SECRET",
  "UPDATE_MANIFEST_SIGNING_SECRET"
]);
const PROVIDER_MANUAL = new Set([
  "STRIPE_SECRET_KEY",
  "STRIPE_TEST_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_3DAYS",
  "STRIPE_PRICE_MONTHLY",
  "STRIPE_PRICE_LIFETIME",
  "STRIPE_GIFT_PRICE_3DAYS",
  "STRIPE_GIFT_PRICE_MONTHLY",
  "STRIPE_GIFT_PRICE_LIFETIME",
  "STRIPE_DIRECT_GIFT_PRICE_3DAYS",
  "STRIPE_DIRECT_GIFT_PRICE_MONTHLY",
  "STRIPE_DIRECT_GIFT_PRICE_LIFETIME",
  "STRIPE_TEST_PRICE_3DAYS",
  "STRIPE_TEST_PRICE_MONTHLY",
  "STRIPE_TEST_PRICE_LIFETIME",
  "STRIPE_TEST_GIFT_PRICE_3DAYS",
  "STRIPE_TEST_GIFT_PRICE_MONTHLY",
  "STRIPE_TEST_GIFT_PRICE_LIFETIME",
  "STRIPE_TEST_DIRECT_GIFT_PRICE_3DAYS",
  "STRIPE_TEST_DIRECT_GIFT_PRICE_MONTHLY",
  "STRIPE_TEST_DIRECT_GIFT_PRICE_LIFETIME",
  "STRIPE_AGENT_API_KEY",
  "STRIPE_AGENT_TEST_API_KEY",
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_SECRET",
  "ROBLOX_CLIENT_SECRET",
  "SMTP_PASS",
  "GITHUB_TOKEN",
  "RENDER_API_KEY",
  "OPENAI_API_KEY"
]);
const NEVER_AUTO_ROTATE = new Set([
  "DATABASE_URL",
  "APP_ENCRYPTION_KEY"
]);

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error.code || "daily_safe_rotation_failed",
    message: error.message,
    valuesPrinted: false
  }, null, 2));
  process.exitCode = 1;
});

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const requestedKeys = options.keys.length ? options.keys : ["ADMIN_SESSION_REVOKED_BEFORE", "ADMIN_DAILY_ROTATION_MARKER"];
  const refusedKeys = requestedKeys.filter((key) => !SAFE_DAILY_ALLOWLIST.has(key));
  const base = {
    createdAt: new Date().toISOString(),
    script: "render-daily-safe-rotation-job",
    dryRun: !options.confirm,
    confirmRequiredForWrites: true,
    valuesPrinted: false,
    actualRotationRun: false,
    requestedKeys,
    refusedKeys: refusedKeys.map((key) => ({ key, reason: refusalReason(key) })),
    categories: {
      safeDailyAutoRotate: [...SAFE_DAILY_ALLOWLIST],
      keyRingGraceRequired: [...KEYRING_REQUIRED],
      manualProviderSideOnly: [...PROVIDER_MANUAL],
      neverAutoRotate: [...NEVER_AUTO_ROTATE]
    }
  };

  if (refusedKeys.length) {
    const result = { ...base, success: false, blocked: true };
    writeArtifact("render-daily-safe-rotation-job-latest.json", result);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = 2;
    return;
  }

  const missingAccess = ["RENDER_API_KEY", "RENDER_SERVICE_ID"].filter((name) => !String(process.env[name] || "").trim());
  if (missingAccess.length) {
    const result = {
      ...base,
      success: true,
      blocked: !options.confirm,
      renderAccessAvailable: false,
      missingEnvNames: missingAccess,
      plannedChanges: requestedKeys.map((key) => ({ key, oldState: "not_checked", newState: "set" })),
      note: "Dry-run completed without Render access. Set the missing env names locally to run a confirmed rotation.",
      actualRotationRun: false
    };
    writeArtifact("render-daily-safe-rotation-job-latest.json", result);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const apiKey = String(process.env.RENDER_API_KEY || "").trim();
  const serviceId = String(process.env.RENDER_SERVICE_ID || "").trim();
  const planned = Object.fromEntries(requestedKeys.map((key) => [key, nextValue(key)]));
  const backup = {
    createdAt: new Date().toISOString(),
    script: "render-daily-safe-rotation-job",
    serviceIdMasked: maskId(serviceId),
    keys: requestedKeys,
    valueHashesBefore: {},
    valuesPrinted: false
  };
  for (const key of requestedKeys) {
    const current = await fetchOne({ apiKey, serviceId, key });
    backup.valueHashesBefore[key] = current.exists ? sha256(current.value) : null;
  }
  writeArtifact(`render-daily-safe-rotation-backup-${timestamp()}.json`, backup);

  if (!options.confirm) {
    const result = {
      ...base,
      success: true,
      renderAccessAvailable: true,
      serviceIdMasked: maskId(serviceId),
      plannedChanges: requestedKeys.map((key) => ({
        key,
        oldState: backup.valueHashesBefore[key] ? "set" : "missing",
        newState: "set"
      })),
      deployNeeded: true,
      actualRotationRun: false
    };
    writeArtifact("render-daily-safe-rotation-job-latest.json", result);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  for (const [key, value] of Object.entries(planned)) {
    await putOne({ apiKey, serviceId, key, value });
  }
  const deploy = await triggerDeploy({ apiKey, serviceId });
  const result = {
    ...base,
    success: true,
    dryRun: false,
    renderAccessAvailable: true,
    serviceIdMasked: maskId(serviceId),
    changedKeys: requestedKeys,
    deploy,
    actualRotationRun: true
  };
  writeArtifact("render-daily-safe-rotation-job-latest.json", result);
  console.log(JSON.stringify(result, null, 2));
}

function parseArgs(args) {
  const options = { keys: [], confirm: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--confirm") options.confirm = true;
    if (arg === "--keys") {
      options.keys = parseKeyList(args[index + 1]);
      index += 1;
    } else if (arg.startsWith("--keys=")) {
      options.keys = parseKeyList(arg.slice("--keys=".length));
    }
  }
  return options;
}

function parseKeyList(value) {
  return String(value || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

function nextValue(key) {
  if (key === "ADMIN_SESSION_REVOKED_BEFORE") return new Date().toISOString();
  if (key === "ADMIN_SESSION_VERSION") return `admin-session-${timestamp()}-${crypto.randomBytes(8).toString("hex")}`;
  if (key === "ADMIN_DAILY_ROTATION_MARKER") return `daily-rotation-${timestamp()}-${crypto.randomBytes(4).toString("hex")}`;
  throw publicError("not_allowlisted", `${key} is not allowed for daily safe rotation.`);
}

async function fetchOne({ apiKey, serviceId, key }) {
  const response = await fetch(`${API_BASE}/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 404) return { key, exists: false, value: "" };
  if (!response.ok) throw publicError("render_env_fetch_failed", renderError(body, response.status));
  const raw = body.envVar || body;
  return { key, exists: true, value: String(raw.value ?? "") };
}

async function putOne({ apiKey, serviceId, key, value }) {
  if (!SAFE_DAILY_ALLOWLIST.has(key)) throw publicError("not_allowlisted", `${key} is not allowed.`);
  const response = await fetch(`${API_BASE}/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ value })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw publicError("render_env_write_failed", renderError(body, response.status));
}

async function triggerDeploy({ apiKey, serviceId }) {
  const hook = String(process.env.FIMA_RENDER_DEPLOY_HOOK || process.env.RENDER_DEPLOY_HOOK_URL || "").trim();
  if (hook) {
    const response = await fetch(hook, { method: "POST" });
    return { attempted: true, triggered: response.ok, status: response.status, method: "deploy_hook", hookValuePrinted: false };
  }
  const response = await fetch(`${API_BASE}/services/${encodeURIComponent(serviceId)}/deploys`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ clearCache: "do_not_clear" })
  });
  return { attempted: true, triggered: response.ok, status: response.status, method: "render_api_deploy", hookValuePrinted: false };
}

function refusalReason(key) {
  if (KEYRING_REQUIRED.has(key)) return "requires current+previous key-ring/grace support before rotation";
  if (PROVIDER_MANUAL.has(key)) return "provider-side/manual rotation only";
  if (NEVER_AUTO_ROTATE.has(key)) return "never auto-rotate without a tested migration/restore process";
  return "not in the daily safe rotation allowlist";
}

function writeArtifact(name, data) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), `${JSON.stringify(data, null, 2)}\n`);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function maskId(value) {
  const text = String(value || "");
  return text.length > 8 ? `${text.slice(0, 4)}***${text.slice(-4)}` : "***";
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function renderError(body, status) {
  return body?.message || body?.error || `Render API returned ${status}`;
}

function publicError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
