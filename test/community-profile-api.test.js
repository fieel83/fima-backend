import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const serverSource = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const dashboardSource = fs.readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");
const accountSource = fs.readFileSync(new URL("../public/assets/js/account.js", import.meta.url), "utf8");
const schemaSource = fs.readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");

test("community profile API exposes separate language, region, nationality and timezone fields", () => {
  assert.match(serverSource, /app\.get\("\/api\/me\/community-profile", requireUser/);
  assert.match(serverSource, /app\.patch\("\/api\/me\/profile\/preferences", requireUser/);
  assert.match(serverSource, /normalizeCommunityProfilePreferences\(req\.body/);
  assert.match(schemaSource, /preferredLanguage\s+String\?/);
  assert.match(schemaSource, /countryRegion\s+String\?/);
  assert.match(schemaSource, /nationality\s+String\?/);
  assert.match(schemaSource, /nationalityVisible\s+Boolean/);
  assert.match(schemaSource, /timezone\s+String\?/);
});

test("Turkish community access is derived only from preferred language", () => {
  const profileBuilder = serverSource.match(
    /async function buildCommunityProfile\([\s\S]*?\n}\n/
  )?.[0] || "";
  assert.match(profileBuilder, /communityAccessForLanguage\(user\?\.preferredLanguage\)/);
  assert.doesNotMatch(profileBuilder, /communityAccessForLanguage\([^)]*(?:country|nationality)/i);
  assert.doesNotMatch(profileBuilder, /turkishCategoryAccess\s*:\s*Boolean\([^)]*(?:country|nationality)/i);
});

test("dashboard renders Discord-first identity and exact language choices", () => {
  assert.match(dashboardSource, /Discord is the primary identity connection/i);
  assert.match(dashboardSource, /id="communityProfileSettings"/);
  assert.match(accountSource, /name="preferredLanguage"/);
  assert.match(accountSource, />Türkçe<\/option>/);
  assert.match(accountSource, />English<\/option>/);
  assert.match(accountSource, /Connected Discord servers/);
  assert.match(accountSource, /based only on your preferred language/i);
  assert.match(accountSource, /data-community-profile-form/);
  assert.match(accountSource, /\/api\/me\/profile\/preferences/);
});
