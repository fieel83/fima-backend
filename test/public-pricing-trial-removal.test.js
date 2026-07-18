import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PLANS, publicCheckoutPlanIds } from "../src/plans.js";

const readSource = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("public checkout exposes exactly the three paid products", () => {
  assert.deepEqual(publicCheckoutPlanIds(), ["3days", "monthly", "lifetime"]);
  assert.equal(PLANS["1day"].publicCheckout, false);
  assert.equal(PLANS["1day"].trial, true);
});

test("public marketing has no universal trial plan, claim CTA or promo hook", async () => {
  const [appSource, stylesSource] = await Promise.all([
    readSource("public/assets/js/app.js"),
    readSource("public/assets/css/styles.css")
  ]);

  assert.doesNotMatch(appSource, /\bid\s*:\s*["']1day["']/i);
  assert.doesNotMatch(appSource, /FIMA-TRIAL|dashboard\/redeem#monthly-trial|claim free trial/i);
  assert.doesNotMatch(appSource, /trial-promo|renderHomeTrialPromoBanner|hydrateTrialPromo/i);
  assert.doesNotMatch(stylesSource, /trial-promo/i);

  const publicPlanIds = [...appSource.matchAll(/\{\s*id:\s*"([^"]+)"\s*,\s*basePrice:/g)].map((match) => match[1]);
  assert.deepEqual(publicPlanIds.slice(0, 3), ["3days", "monthly", "lifetime"]);
});

test("new trial claims fail closed while Activity Rewards and legacy readability remain", async () => {
  const [serverSource, accountSource, successSource] = await Promise.all([
    readSource("src/server.js"),
    readSource("public/assets/js/account.js"),
    readSource("public/assets/js/success.js")
  ]);

  assert.match(serverSource, /app\.post\(\["\/trial\/monthly\/claim", "\/api\/trial\/monthly\/claim"\][\s\S]*?res\.status\(410\)[\s\S]*?trial_program_replaced_by_activity_rewards/);
  assert.match(accountSource, /Text & voice leaderboard rewards/);
  assert.match(accountSource, /Top 3 text users and Top 3 voice users/);
  assert.match(accountSource, /rank: 1, days: 15[\s\S]*rank: 2, days: 10[\s\S]*rank: 3, days: 7/);
  assert.match(accountSource, /Text, voice and booster rewards are separate and stack/);
  assert.match(accountSource, /Every verified active server boost adds 3 more days for that month/);
  assert.match(accountSource, /Legacy trial[\s\S]*Read-only until expiry/);
  assert.doesNotMatch(accountSource, /showLegacyTrialClaimModal/);
  assert.doesNotMatch(accountSource, /\btrialClaimed\b|\btrialReadyTitle\b|\btrialReadyText\b|\btrialAlreadyActive\b|\btrialCooldownActive\b/);
  assert.doesNotMatch(accountSource, /Claim Free Trial/i);
  assert.doesNotMatch(serverSource, /wait(?:ing)?\s+(?:for\s+)?(?:another\s+)?(?:universal\s+)?trial/i);
  assert.doesNotMatch(serverSource, /reclaim(?:ing)?\s+(?:the\s+)?(?:universal\s+)?trial/i);
  assert.match(successSource, /"1day": "Legacy Trial"/);
});

test("admin and environment configuration cannot issue a legacy one-day trial", async () => {
  const [adminSource, serverSource, manualRobuxSource, envExample] = await Promise.all([
    readSource("src/adminHtml.js"),
    readSource("src/server.js"),
    readSource("src/manualRobuxPayments.js"),
    readSource(".env.example")
  ]);

  assert.doesNotMatch(adminSource, /<option value="1day">Free Trial<\/option>/i);
  assert.match(adminSource, /<option value="1day">Legacy Trial \(history only\)<\/option>/i);
  assert.doesNotMatch(envExample, /^TRIAL_PROMO_/m);
  assert.doesNotMatch(envExample, /^NORMAL_TRIAL_DAYS=/m);

  assert.match(serverSource, /app\.post\("\/admin\/api\/licenses\/manual"[\s\S]*?if \(isLegacyTrialPlan\(plan\)\) return rejectLegacyTrialIssuance\(res\)/);
  assert.match(serverSource, /app\.post\(\["\/admin\/api\/licenses\/:id\/extend"[\s\S]*?if \(isLegacyTrialPlan\(plan\)\) return rejectLegacyTrialIssuance\(res\)/);
  assert.match(serverSource, /app\.post\(\["\/admin\/api\/gift-codes\/create"[\s\S]*?if \(isLegacyTrialPlan\(giftPlan\)\) return rejectLegacyTrialIssuance\(res\)/);
  assert.match(serverSource, /app\.post\(\["\/admin\/api\/gift-codes\/create-test"[\s\S]*?if \(isLegacyTrialPlan\(plan\)\) return rejectLegacyTrialIssuance\(res\)/);
  assert.match(serverSource, /app\.post\(\["\/admin\/api\/direct-packages\/send"[\s\S]*?if \(isLegacyTrialPlan\(giftPlan\)\) return rejectLegacyTrialIssuance\(res\)/);
  assert.match(serverSource, /createManualRobuxOrder\(req\.user, req\.body \|\| \{\}/);
  assert.match(manualRobuxSource, /function normalizePlan\(planId\)[\s\S]*?isLegacyTrialPlan\(plan\) \|\| !isPublicCheckoutPlan\(plan\.id\)[\s\S]*?programStatus: LEGACY_TRIAL_PROGRAM_STATUS/);
  assert.doesNotMatch(serverSource, /async function fetchDiscordGuildMemberships[\s\S]{0,900}?isLegacyTrialPlan\(plan\)/);
  assert.match(serverSource, /function rejectLegacyTrialIssuance\(res\)[\s\S]*?trial_program_replaced_by_activity_rewards[\s\S]*?LEGACY_TRIAL_PROGRAM_STATUS/);
});
