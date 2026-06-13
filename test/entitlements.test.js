import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedFeaturesForPlan,
  entitlementSecretStatus,
  hashDeviceId,
  issueAppEntitlement,
  verifyAppEntitlement
} from "../src/entitlements.js";

test("entitlement secret status requires a real server-side secret", () => {
  assert.equal(entitlementSecretStatus({ ENTITLEMENT_SIGNING_SECRET: "" }).configured, false);
  assert.equal(entitlementSecretStatus({ ENTITLEMENT_SIGNING_SECRET: "short" }).configured, false);
  assert.equal(entitlementSecretStatus({ ENTITLEMENT_SIGNING_SECRET: "x".repeat(40) }).configured, true);
});

test("issue and verify app entitlement with device hash and plan features", () => {
  const previousSecret = process.env.ENTITLEMENT_SIGNING_SECRET;
  const previousSession = process.env.ADMIN_SESSION_VERSION;
  process.env.ENTITLEMENT_SIGNING_SECRET = "local-test-entitlement-secret-32-bytes-minimum";
  process.env.ADMIN_SESSION_VERSION = "test-session-v1";

  try {
    const entitlement = issueAppEntitlement({
      license: { id: "lic_123", plan: "lifetime", status: "active" },
      user: { id: "user_123" },
      hwid: "ABC12-DEF34-GHI56",
      appVersion: "1.0.128",
      minSupportedAppVersion: "1.0.128"
    });

    assert.equal(typeof entitlement.token, "string");
    assert.equal(entitlement.payload.tokenType, "app_entitlement");
    assert.equal(entitlement.payload.licenseId, "lic_123");
    assert.equal(entitlement.payload.hwidHash, hashDeviceId("ABC12DEF34GHI56"));
    assert.equal(entitlement.payload.allowedFeatures.includes("official_macros"), true);
    assert.equal(entitlement.payload.allowedFeatures.includes("lifetime_access"), true);

    const verified = verifyAppEntitlement(entitlement.token);
    assert.equal(verified.ok, true);
    assert.equal(verified.payload.licenseId, "lic_123");
  } finally {
    process.env.ENTITLEMENT_SIGNING_SECRET = previousSecret;
    process.env.ADMIN_SESSION_VERSION = previousSession;
  }
});

test("entitlement session version invalidates old tokens", () => {
  const previousSecret = process.env.ENTITLEMENT_SIGNING_SECRET;
  const previousSession = process.env.ADMIN_SESSION_VERSION;
  process.env.ENTITLEMENT_SIGNING_SECRET = "local-test-entitlement-secret-32-bytes-minimum";
  process.env.ADMIN_SESSION_VERSION = "test-session-v1";

  try {
    const entitlement = issueAppEntitlement({
      license: { id: "lic_456", plan: "monthly", status: "active" },
      hwid: "HWID-A"
    });
    process.env.ADMIN_SESSION_VERSION = "test-session-v2";
    const verified = verifyAppEntitlement(entitlement.token);
    assert.equal(verified.ok, false);
    assert.equal(verified.reason, "entitlement_session_revoked");
  } finally {
    process.env.ENTITLEMENT_SIGNING_SECRET = previousSecret;
    process.env.ADMIN_SESSION_VERSION = previousSession;
  }
});

test("allowed features stay plan-scoped", () => {
  assert.deepEqual(allowedFeaturesForPlan(""), []);
  assert.equal(allowedFeaturesForPlan("monthly").includes("subscription_access"), true);
  assert.equal(allowedFeaturesForPlan("1day").includes("trial_access"), true);
});
