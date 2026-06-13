import test from "node:test";
import assert from "node:assert/strict";
import { buildTrialNotes, getTrialPromoConfig, isPromoTrialLicense, isTrialLicense } from "../src/trialPromo.js";

test("trial promo defaults safely to normal one day trial", () => {
  const config = getTrialPromoConfig({}, new Date("2026-06-13T12:00:00.000Z"));

  assert.equal(config.active, false);
  assert.equal(config.currentTrialDays, 1);
  assert.equal(config.ms, 24 * 60 * 60 * 1000);
});

test("trial promo uses configured seven day window only while active", () => {
  const env = {
    NORMAL_TRIAL_DAYS: "1",
    TRIAL_PROMO_ENABLED: "true",
    TRIAL_PROMO_DAYS: "7",
    TRIAL_PROMO_END_AT: "2026-06-20T12:00:00.000Z"
  };

  const active = getTrialPromoConfig(env, new Date("2026-06-13T12:00:00.000Z"));
  const expired = getTrialPromoConfig(env, new Date("2026-06-21T12:00:00.000Z"));

  assert.equal(active.active, true);
  assert.equal(active.currentTrialDays, 7);
  assert.equal(expired.active, false);
  assert.equal(expired.currentTrialDays, 1);
});

test("trial promo notes preserve audit source and remain trial licenses", () => {
  const promo = getTrialPromoConfig({
    TRIAL_PROMO_ENABLED: "true",
    TRIAL_PROMO_DAYS: "7",
    TRIAL_PROMO_END_AT: "2026-06-20T12:00:00.000Z"
  }, new Date("2026-06-13T12:00:00.000Z"));
  const notes = buildTrialNotes({
    user: { id: "user_1", discordUserId: "discord_1", robloxUserId: null },
    promoConfig: promo
  });

  assert.match(notes, /trial_promo_7d_beta/);
  assert.match(notes, /beta_7_day_promo/);
  assert.equal(isPromoTrialLicense({ notes }), true);
  assert.equal(isTrialLicense({ notes }), true);
});
