import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const appSource = fs.readFileSync(new URL("../public/assets/js/app.js", import.meta.url), "utf8");
const localizedKeyGuidePages = ["index.html", "download.html", "pricing.html"];
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
    assert.match(source, /assets\/js\/app\.js\?v=20260723-locale-1/u);
  }
});
