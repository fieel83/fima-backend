import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appSource = fs.readFileSync(new URL("../public/assets/js/app.js", import.meta.url), "utf8");
const localizedKeyGuidePages = ["index.html", "download.html", "pricing.html"];
const expectedAppRevision = "20260723-locale-2";
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

test("language selector only exposes locales with complete verified copy", () => {
  const options = appSource.match(/const languageOptions = \[([\s\S]*?)\n  \];/u)?.[1] || "";
  const localeCodes = [...options.matchAll(/\["([a-z]{2})",\s*"[A-Z]{2}"\]/gu)].map((match) => match[1]);
  assert.deepEqual(localeCodes, ["en", "tr", "de", "fr", "bs"]);
});

test("verified locales contain account and key-guide navigation labels", () => {
  const locales = [["en", "tr"], ["tr", "de"], ["de", "fr"], ["fr", "bs"], ["bs", null]];
  for (const [locale, nextLocale] of locales) {
    const block = localeBlock(locale, nextLocale);
    for (const key of ["keyGuide", "login", "register", "products"]) {
      assert.match(block, new RegExp(`\\b${key}:\\s*"[^"]+"`, "u"), `${locale}.${key} must be translated`);
    }
  }
});

test("verified locales contain complete showcase, tour and upcoming copy", () => {
  const locales = [["en", "tr"], ["tr", "de"], ["de", "fr"], ["fr", "bs"], ["bs", null]];
  const tourViews = ["home", "macros", "shop", "updates", "benefits", "tutorials", "feedback", "settings"];
  const englishBlock = localeBlock("en", "tr");

  for (const [locale, nextLocale] of locales) {
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

test("locale source contains no common UTF-8 mojibake markers", () => {
  assert.doesNotMatch(appSource, /Ã|Å|Â|�/u);
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
