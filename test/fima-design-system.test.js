import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(testDirectory, "../public");
const readPublic = (file) => fs.readFileSync(path.join(publicDirectory, file), "utf8");
const designSystemSource = readPublic("assets/css/fima-design-system.css");

const accountShells = [
  "login.html",
  "register.html",
  "forgot-password.html",
  "reset-password.html",
  "dashboard.html",
  "my-products.html",
  "store.html",
  "payment-success.html",
  "payment-cancelled.html"
];

const customShells = [
  { file: "desktop-login.html", product: "hub", baseCss: "desktop-login.css" },
  { file: "fima-bot-dashboard.html", product: "bot", baseCss: "fima-bot-dashboard.css" },
  { file: "updating.html", product: "hub", baseCss: "updating.css" },
  { file: "paradise-content-studio.html", product: "bot", baseCss: null },
  { file: "auth/roblox-callback.html", product: "macro", baseCss: null }
];

function stylesheetPosition(source, name) {
  return source.indexOf(name);
}

test("account surfaces share the Hub design tokens after their local shell styles", () => {
  for (const file of accountShells) {
    const source = readPublic(file);
    assert.match(source, /<body\b[^>]*data-fima-product="hub"/, `${file} has no Hub product marker`);
    assert.ok(stylesheetPosition(source, "account.css") >= 0, `${file} has no account stylesheet`);
    assert.ok(
      stylesheetPosition(source, "fima-design-system.css") > stylesheetPosition(source, "account.css"),
      `${file} must load the shared tokens after account.css`
    );
  }
});

test("custom product shells load the shared layer without replacing their functional CSS", () => {
  for (const { file, product, baseCss } of customShells) {
    const source = readPublic(file);
    assert.match(source, new RegExp(`<body\\b[^>]*data-fima-product="${product}"`), `${file} has the wrong product marker`);
    assert.ok(stylesheetPosition(source, "fima-design-system.css") >= 0, `${file} has no shared design layer`);
    if (baseCss) {
      assert.ok(stylesheetPosition(source, baseCss) >= 0, `${file} lost ${baseCss}`);
      assert.ok(
        stylesheetPosition(source, "fima-design-system.css") > stylesheetPosition(source, baseCss),
        `${file} must load the shared tokens after ${baseCss}`
      );
    }
  }
});

test("every public HTML surface uses the main site theme or the shared product layer", () => {
  const htmlFiles = fs.readdirSync(publicDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => entry.name);

  for (const file of htmlFiles) {
    const source = readPublic(file);
    assert.ok(
      source.includes("styles.css") || source.includes("fima-design-system.css"),
      `${file} is outside the common FIMA site theme`
    );
  }
});

test("shared tokens cover product accents, keyboard focus, motion, and contrast modes", () => {
  for (const product of ["hub", "macro", "ai", "bot"]) {
    assert.match(designSystemSource, new RegExp(`data-fima-product="${product}"`));
  }
  assert.match(designSystemSource, /:focus-visible/);
  assert.match(designSystemSource, /prefers-reduced-motion:\s*reduce/);
  assert.match(designSystemSource, /forced-colors:\s*active/);
  assert.match(designSystemSource, /scrollbar-color/);
  assert.match(designSystemSource, /--fima-radius-lg/);
});

test("Content Studio keeps its guarded publishing controls while joining the Bot theme", () => {
  const source = readPublic("paradise-content-studio.html");
  assert.match(source, /id="publishConfirmation"/);
  assert.match(source, /PUBLISH TEST CONTENT/);
  assert.match(source, /data-fima-design-system="teal-obsidian"/);
  assert.match(source, /data-fima-product="bot"/);
  assert.doesNotMatch(source, /(?:id|name)="[^"]*webhook(?:url|token)/i);
});
