import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appSource = fs.readFileSync(new URL("../public/assets/js/app.js", import.meta.url), "utf8");
const keyGuideSource = fs.readFileSync(new URL("../public/how-to-get-key.html", import.meta.url), "utf8");
const localizedKeyGuidePages = ["index.html", "download.html", "pricing.html"];
const expectedAppRevision = "20260723-locale-3";
const verifiedLocales = [["en", "tr"], ["tr", "de"], ["de", "fr"], ["fr", "bs"], ["bs", null]];
const requiredKeyGuideFields = [
  "metaTitle",
  "close",
  "eyebrow",
  "title",
  "description",
  "choosePlan",
  "openProducts",
  "downloadApp",
  "quickChecklist",
  "check1Title",
  "check1Body",
  "check2Title",
  "check2Body",
  "check3Title",
  "check3Body",
  "check4Title",
  "check4Body",
  "stepsTitle",
  "stepsIntro",
  "step1Title",
  "step1Body",
  "step2Title",
  "step2Body",
  "step3Title",
  "step3Body",
  "step4Title",
  "step4Body",
  "securityLabel",
  "securityText",
  "readSecurity",
  "troubleTitle",
  "troubleIntro",
  "trouble1Title",
  "trouble1Body",
  "trouble2Title",
  "trouble2Body",
  "trouble3Title",
  "trouble3Body",
  "footerText",
  "keyHelp",
  "successPage",
  "trust",
  "security",
  "officialDownload"
];
const pageSources = localizedKeyGuidePages.map((file) => [
  file,
  fs.readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8")
]);

const localeBlock = (locale, nextLocale) => {
  const start = appSource.indexOf(`    ${locale}: {`);
  const end = nextLocale
    ? appSource.indexOf(`    ${nextLocale}: {`, start + 1)
    : appSource.indexOf("\n  };", start + 1);
  assert.ok(start >= 0 && end > start, `${locale} locale block must exist`);
  return appSource.slice(start, end);
};

const keyGuideBlock = (locale, nextLocale) => {
  const block = localeBlock(locale, nextLocale);
  const guide = block.match(/\bkeyGuide:\s*\{([\s\S]*?)\n\s*\},/u)?.[1];
  assert.ok(guide, `${locale}.keyGuide must exist`);
  return guide;
};

const keyGuideValue = (block, field) => {
  const match = block.match(new RegExp(`\\b${field}:\\s*"((?:\\\\.|[^"\\\\])*)"`, "u"));
  return match?.[1] || "";
};

test("language selector only exposes locales with complete verified copy", () => {
  const options = appSource.match(/const languageOptions = \[([\s\S]*?)\n  \];/u)?.[1] || "";
  const localeCodes = [...options.matchAll(/\["([a-z]{2})",\s*"[A-Z]{2}"\]/gu)].map((match) => match[1]);
  assert.deepEqual(localeCodes, ["en", "tr", "de", "fr", "bs"]);
});

test("verified locales contain account and key-guide navigation labels", () => {
  for (const [locale, nextLocale] of verifiedLocales) {
    const block = localeBlock(locale, nextLocale);
    for (const key of ["keyGuide", "login", "register", "products"]) {
      assert.match(block, new RegExp(`\\b${key}:\\s*"[^"]+"`, "u"), `${locale}.${key} must be translated`);
    }
  }
});

test("verified locales contain complete showcase, tour and upcoming copy", () => {
  const tourViews = ["home", "macros", "shop", "updates", "benefits", "tutorials", "feedback", "settings"];
  const englishBlock = localeBlock("en", "tr");

  for (const [locale, nextLocale] of verifiedLocales) {
    const block = localeBlock(locale, nextLocale);
    for (const section of ["showcase", "tour", "upcoming"]) {
      assert.match(block, new RegExp(`\\b${section}:\\s*\\{`, "u"), `${locale}.${section} must exist`);
    }
    for (const view of tourViews) {
      assert.match(block, new RegExp(`\\b${view}:\\s*\\{\\s*label:\\s*"[^"]+"`, "u"), `${locale}.tour.views.${view} must exist`);
    }
    if (locale !== "en") {
      const englishTourTitle = englishBlock.match(/tour:\s*\{[\s\S]*?\btitle:\s*"([^"]+)"/u)?.[1];
      const localizedTourTitle = block.match(/tour:\s*\{[\s\S]*?\btitle:\s*"([^"]+)"/u)?.[1];
      assert.notEqual(localizedTourTitle, englishTourTitle, `${locale}.tour.title must not use English fallback copy`);
    }
  }
});

test("key guide page loads one current localized app script and exposes every verified locale", () => {
  assert.equal(
    (keyGuideSource.match(/assets\/js\/app\.js\?v=/gu) || []).length,
    1,
    "key guide must load app.js exactly once"
  );
  assert.match(keyGuideSource, new RegExp(`assets/js/app\\.js\\?v=${expectedAppRevision}`, "u"));
  const options = [...keyGuideSource.matchAll(/<option value="([a-z]{2})">[A-Z]{2}<\/option>/gu)]
    .map((match) => match[1]);
  assert.deepEqual(options, verifiedLocales.map(([locale]) => locale));
  assert.match(keyGuideSource, /<title data-i18n="keyGuide\.metaTitle">/u);
  assert.match(keyGuideSource, /data-i18n-aria-label="keyGuide\.close"/u);
  assert.match(
    keyGuideSource,
    /<aside class="key-checklist"[^>]*data-i18n-aria-label="keyGuide\.quickChecklist"/u
  );
  assert.match(appSource, /\$\$\("\[data-i18n-aria-label\]"\)[\s\S]*?setAttribute\("aria-label", value\)/u);
});

test("every verified locale has complete key guide copy without English fallback", () => {
  const englishGuide = keyGuideBlock("en", "tr");
  for (const [locale, nextLocale] of verifiedLocales) {
    const guide = keyGuideBlock(locale, nextLocale);
    for (const field of requiredKeyGuideFields) {
      const value = keyGuideValue(guide, field);
      assert.ok(value, `${locale}.keyGuide.${field} must contain translated copy`);
      if (locale !== "en") {
        assert.notEqual(
          value,
          keyGuideValue(englishGuide, field),
          `${locale}.keyGuide.${field} must not fall back to English`
        );
      }
    }
  }
});

test("localized key guide titles and content differ from English", () => {
  const englishGuide = keyGuideBlock("en", "tr");
  for (const [locale, nextLocale] of verifiedLocales.slice(1)) {
    const guide = keyGuideBlock(locale, nextLocale);
    for (const field of ["metaTitle", "title", "description", "stepsTitle", "troubleTitle"]) {
      assert.notEqual(
        keyGuideValue(guide, field),
        keyGuideValue(englishGuide, field),
        `${locale}.keyGuide.${field} must be localized`
      );
    }
  }
});

test("locale source contains no common UTF-8 mojibake markers", () => {
  assert.doesNotMatch(appSource, /(?:Ã|Ä|Å|Â)[\u0080-\u00BF]|â[\u0080-\u00BF]{1,2}|ï¿½|\uFFFD/u);
});

test("public account navigation uses localized copy instead of fixed English labels", () => {
  assert.match(appSource, /login\.textContent = getCopy\(\)\.nav\.login/u);
  assert.match(appSource, /register\.textContent = getCopy\(\)\.nav\.register/u);
  assert.match(appSource, /href="\/dashboard\/products">\$\{getCopy\(\)\.nav\.products\}/u);
  assert.doesNotMatch(appSource, /login\.textContent = "Login"|register\.textContent = "Register"/u);
});

test("key guide links and the localized script revision are present on affected pages", () => {
  for (const [file, source] of pageSources) {
    const keyGuideLinks = source.match(/<a[^>]+href="\/how-to-get-key"[^>]*>/gu) || [];
    assert.ok(keyGuideLinks.length >= 2, `${file} must keep both key-guide links`);
    for (const link of keyGuideLinks) {
      assert.match(link, /data-i18n="nav\.keyGuide"/u, `${file} key-guide links must be localized`);
    }
    assert.match(source, new RegExp(`assets/js/app\\.js\\?v=${expectedAppRevision}`, "u"));
  }
});

test("all public HTML entry points use the same localized app revision", () => {
  const publicRoot = fileURLToPath(new URL("../public/", import.meta.url));
  const htmlFiles = fs.readdirSync(publicRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => path.join(entry.parentPath || publicRoot, entry.name));
  const appConsumers = htmlFiles.filter((file) => fs.readFileSync(file, "utf8").includes("assets/js/app.js?v="));

  assert.ok(appConsumers.length >= 12, "expected all localized public pages to consume app.js");
  for (const file of appConsumers) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, new RegExp(`assets/js/app\\.js\\?v=${expectedAppRevision}`, "u"), `${file} must use the current revision`);
    assert.equal((source.match(/assets\/js\/app\.js\?v=/gu) || []).length, 1, `${file} must load app.js once`);
  }
});
