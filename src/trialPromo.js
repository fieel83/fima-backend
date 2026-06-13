const DAY_MS = 24 * 60 * 60 * 1000;
export const TRIAL_PROMO_CAMPAIGN = "beta_7_day_promo";
export const TRIAL_PROMO_SOURCE = "trial_promo_7d_beta";

function boolEnv(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function intEnv(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDate(value) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

export function getTrialPromoConfig(envSource = process.env, now = new Date()) {
  const normalDays = intEnv(envSource.NORMAL_TRIAL_DAYS, 1);
  const promoDays = intEnv(envSource.TRIAL_PROMO_DAYS, 7);
  const endAt = parseDate(envSource.TRIAL_PROMO_END_AT);
  const enabled = boolEnv(envSource.TRIAL_PROMO_ENABLED);
  const active = Boolean(enabled && endAt && endAt > now);

  return {
    enabled,
    active,
    campaign: TRIAL_PROMO_CAMPAIGN,
    source: TRIAL_PROMO_SOURCE,
    normalDays,
    promoDays,
    currentTrialDays: active ? promoDays : normalDays,
    endAt,
    endAtIso: endAt ? endAt.toISOString() : null,
    ms: (active ? promoDays : normalDays) * DAY_MS
  };
}

export function isPromoTrialLicense(license) {
  const notes = String(license?.notes || "").toLowerCase();
  return notes.includes(TRIAL_PROMO_SOURCE) || notes.includes(TRIAL_PROMO_CAMPAIGN);
}

export function isTrialLicense(license) {
  const notes = String(license?.notes || "").toLowerCase();
  return notes.includes("monthly_trial") || notes.includes(TRIAL_PROMO_SOURCE) || notes.includes(TRIAL_PROMO_CAMPAIGN);
}

export function buildTrialNotes({ user, promoConfig }) {
  const source = promoConfig.active ? promoConfig.source : "monthly_trial";
  const campaign = promoConfig.active ? ` campaign:${promoConfig.campaign}` : "";
  return `${source}${campaign} user:${user.id} discord:${user.discordUserId} roblox:${user.robloxUserId || "optional"}`;
}
