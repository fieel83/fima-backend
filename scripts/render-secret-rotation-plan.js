#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ARTIFACT_DIR = "artifacts/security-v1.0.130";

const PLAN = {
  autoRotatableLowRisk: [
    {
      key: "ADMIN_SESSION_VERSION",
      action: "Generate a new opaque version marker and force old admin sessions to re-authenticate.",
      requiresKeyRing: false
    },
    {
      key: "ADMIN_SESSION_REVOKED_BEFORE",
      action: "Set to current UTC ISO timestamp to invalidate older admin sessions.",
      requiresKeyRing: false
    }
  ],
  keyRingRequiredBeforeRotation: [
    "JWT_SECRET",
    "COOKIE_SECRET",
    "SESSION_SECRET",
    "AUTH_SECRET",
    "ENTITLEMENT_SIGNING_SECRET",
    "DOWNLOAD_SIGNING_SECRET",
    "UPDATE_MANIFEST_SIGNING_SECRET"
  ],
  providerManualRotation: [
    "STRIPE_SECRET_KEY",
    "STRIPE_TEST_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_AGENT_API_KEY",
    "STRIPE_AGENT_TEST_API_KEY",
    "DISCORD_BOT_TOKEN",
    "DISCORD_CLIENT_SECRET",
    "ROBLOX_CLIENT_SECRET",
    "SMTP_PASS",
    "GITHUB_TOKEN",
    "RENDER_API_KEY",
    "OPENAI_API_KEY"
  ],
  neverAutoRotate: [
    "DATABASE_URL",
    "APP_ENCRYPTION_KEY",
    "Stripe price/product IDs unless intentionally changing products"
  ],
  commandExamples: {
    audit: "node .\\scripts\\render-env-audit.js",
    plan: "node .\\scripts\\render-secret-rotation-plan.js",
    dryRunSafe: "node .\\scripts\\render-rotate-safe-secrets.js --keys ADMIN_SESSION_REVOKED_BEFORE",
    confirmedSafe: "node .\\scripts\\render-rotate-safe-secrets.js --keys ADMIN_SESSION_REVOKED_BEFORE --confirm",
    rollback: "Restore the previous env values from Render dashboard/provider records, then redeploy."
  },
  graceWindowRequirement: "Implement current+previous key verification and key IDs before rotating auth/session/entitlement/download/update signing secrets."
};

const result = {
  createdAt: new Date().toISOString(),
  script: "render-secret-rotation-plan",
  dryRun: true,
  valuesPrinted: false,
  actualRotationRun: false,
  ...PLAN
};

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
fs.writeFileSync(path.join(ARTIFACT_DIR, "render-secret-rotation-plan-latest.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
