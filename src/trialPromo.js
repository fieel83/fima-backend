export const TRIAL_PROMO_CAMPAIGN = "beta_7_day_promo";
export const TRIAL_PROMO_SOURCE = "trial_promo_7d_beta";
export const LEGACY_TRIAL_PROGRAM_STATUS = "replaced_by_activity_rewards";

export function isLegacyTrialPlan(plan) {
  if (!plan || typeof plan !== "object") return false;
  const id = String(plan.id || plan.plan || "").trim().toLowerCase();
  return id === "1day" || Number(plan.durationDays) === 1;
}

export function isPromoTrialLicense(license) {
  const notes = String(license?.notes || "").toLowerCase();
  return notes.includes(TRIAL_PROMO_SOURCE) || notes.includes(TRIAL_PROMO_CAMPAIGN);
}

export function isTrialLicense(license) {
  const notes = String(license?.notes || "").toLowerCase();
  return isLegacyTrialPlan(license)
    || notes.includes("monthly_trial")
    || notes.includes(TRIAL_PROMO_SOURCE)
    || notes.includes(TRIAL_PROMO_CAMPAIGN);
}
