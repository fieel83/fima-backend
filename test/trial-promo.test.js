import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_TRIAL_PROGRAM_STATUS,
  isLegacyTrialPlan,
  isPromoTrialLicense,
  isTrialLicense
} from "../src/trialPromo.js";

test("legacy trial program is permanently classified as replaced", () => {
  assert.equal(LEGACY_TRIAL_PROGRAM_STATUS, "replaced_by_activity_rewards");
  assert.equal(isLegacyTrialPlan({ id: "1day", durationDays: 1 }), true);
  assert.equal(isLegacyTrialPlan({ id: "gift_1d", durationDays: 1 }), true);
  assert.equal(isLegacyTrialPlan({ id: "3days", durationDays: 3 }), false);
  assert.equal(isLegacyTrialPlan(null), false);
});

test("historical one-day records remain recognizable without enabling issuance", () => {
  assert.equal(isTrialLicense({ plan: "1day", durationDays: 1, notes: "" }), true);
  assert.equal(isTrialLicense({ plan: "monthly", notes: "monthly_trial user:user_1" }), true);
  assert.equal(isTrialLicense({ plan: "monthly", notes: "paid_order" }), false);
});

test("historical seven-day promo audit markers remain readable", () => {
  const notes = "trial_promo_7d_beta campaign:beta_7_day_promo user:user_1";
  assert.equal(isPromoTrialLicense({ notes }), true);
  assert.equal(isTrialLicense({ notes }), true);
});
