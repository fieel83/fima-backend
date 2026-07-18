import test from "node:test";
import assert from "node:assert/strict";
import {
  communityAccessForLanguage,
  normalizeCommunityProfilePreferences,
  normalizeLanguageOnboardingChoice
} from "../src/accountProfilePreferences.js";

test("community profile keeps language, country, nationality and timezone separate", () => {
  const result = normalizeCommunityProfilePreferences({
    preferredLanguage: "tr",
    countryRegion: "Germany",
    nationality: "Turkish",
    nationalityVisible: true,
    timezone: "Europe/Berlin"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    preferredLanguage: "tr",
    countryRegion: "Germany",
    nationality: "Turkish",
    nationalityVisible: true,
    timezone: "Europe/Berlin",
    turkishCategoryAccess: true
  });
});

test("Turkish category access is derived from language and never country", () => {
  assert.equal(communityAccessForLanguage("tr").turkishCategoryAccess, true);
  assert.equal(communityAccessForLanguage("en").turkishCategoryAccess, false);
  const englishInTurkey = normalizeCommunityProfilePreferences({
    preferredLanguage: "en",
    countryRegion: "Türkiye",
    timezone: "Europe/Istanbul"
  });
  assert.equal(englishInTurkey.value.turkishCategoryAccess, false);
});

test("nationality visibility is disabled when nationality is empty", () => {
  const result = normalizeCommunityProfilePreferences({
    preferredLanguage: "en",
    countryRegion: "United Kingdom",
    nationality: "",
    nationalityVisible: true,
    timezone: "Europe/London"
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.nationality, null);
  assert.equal(result.value.nationalityVisible, false);
});

test("invalid profile values return stable validation codes", () => {
  const result = normalizeCommunityProfilePreferences({
    preferredLanguage: "de",
    countryRegion: "",
    timezone: "Mars/Olympus"
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "invalid_preferred_language",
    "country_region_required",
    "invalid_timezone"
  ]);
});

test("one-time onboarding accepts only the exact three choices", () => {
  assert.equal(normalizeLanguageOnboardingChoice("tr"), "tr");
  assert.equal(normalizeLanguageOnboardingChoice("en"), "en");
  assert.equal(normalizeLanguageOnboardingChoice("later"), "later");
  assert.equal(normalizeLanguageOnboardingChoice("de"), null);
});
