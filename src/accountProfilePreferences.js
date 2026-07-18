export const COMMUNITY_PROFILE_LANGUAGES = Object.freeze([
  Object.freeze({ id: "tr", label: "Türkçe" }),
  Object.freeze({ id: "en", label: "English" })
]);

export const COMMUNITY_LANGUAGE_ONBOARDING_CHOICES = Object.freeze([
  ...COMMUNITY_PROFILE_LANGUAGES,
  Object.freeze({ id: "later", label: "Decide Later" })
]);

const PROFILE_TEXT_LIMIT = 80;

function normalizeText(value, maxLength = PROFILE_TEXT_LIMIT) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : "";
}

export function normalizePreferredLanguage(value, { allowLater = false } = {}) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const choices = allowLater ? COMMUNITY_LANGUAGE_ONBOARDING_CHOICES : COMMUNITY_PROFILE_LANGUAGES;
  return choices.some((choice) => choice.id === normalized) ? normalized : null;
}

export function isValidTimezone(value) {
  const timezone = normalizeText(value);
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function communityAccessForLanguage(value) {
  const preferredLanguage = normalizePreferredLanguage(value);
  return {
    preferredLanguage,
    turkishCategoryAccess: preferredLanguage === "tr"
  };
}

export function normalizeCommunityProfilePreferences(input = {}) {
  const preferredLanguage = normalizePreferredLanguage(input.preferredLanguage);
  const countryRegion = normalizeText(input.countryRegion);
  const nationality = normalizeText(input.nationality);
  const timezone = normalizeText(input.timezone);
  const errors = [];

  if (!preferredLanguage) errors.push("invalid_preferred_language");
  if (!countryRegion) errors.push("country_region_required");
  if (String(input.countryRegion ?? "").trim().length > PROFILE_TEXT_LIMIT) errors.push("country_region_too_long");
  if (String(input.nationality ?? "").trim().length > PROFILE_TEXT_LIMIT) errors.push("nationality_too_long");
  if (!isValidTimezone(timezone)) errors.push("invalid_timezone");

  return {
    ok: errors.length === 0,
    errors,
    value: {
      preferredLanguage,
      countryRegion,
      nationality: nationality || null,
      nationalityVisible: Boolean(nationality && input.nationalityVisible === true),
      timezone,
      ...communityAccessForLanguage(preferredLanguage)
    }
  };
}

export function normalizeLanguageOnboardingChoice(value) {
  return normalizePreferredLanguage(value, { allowLater: true });
}
