import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const readPublic = (path) => fs.readFileSync(new URL(`../public/${path}`, import.meta.url), "utf8");

const surfaces = {
  desktopLogin: readPublic("desktop-login.html"),
  robloxCallback: readPublic("auth/roblox-callback.html"),
  privacy: readPublic("privacy/index.html"),
  terms: readPublic("terms/index.html")
};

const fimaBotSurfaces = {
  product: readPublic("paradise-bot.html"),
  applications: readPublic("paradise-apply.html"),
  contentStudio: readPublic("paradise-content-studio.html")
};

test("standalone account and policy surfaces use the shared FIMA product design contract", () => {
  for (const [name, source] of Object.entries(surfaces)) {
    assert.match(source, /<meta name="viewport" content="width=device-width, initial-scale=1">/u, `${name} must be responsive`);
    assert.match(source, /fima-design-system\.css\?v=\d{8}-\d+/u, `${name} must load the shared FIMA design system`);
    assert.match(source, /<body data-fima-product="(?:hub|macro)" data-fima-surface="[^"]+">/u, `${name} must identify its product and surface`);
  }
});

test("shared standalone surfaces preserve product context without reverting the ecosystem shell", () => {
  assert.match(surfaces.desktopLogin, /<span>FIMA<\/span>/u);
  assert.match(surfaces.robloxCallback, /<strong>FIMA <small>Macro<\/small><\/strong>/u);
  assert.match(surfaces.privacy, /<span>FIMA <small>Macro<\/small><\/span>/u);
  assert.match(surfaces.terms, /<span>FIMA <small>Macro<\/small><\/span>/u);
});

test("standalone animated surfaces respect reduced-motion preferences", () => {
  const desktopCss = readPublic("assets/css/desktop-login.css");
  const designCss = readPublic("assets/css/fima-design-system.css");
  assert.match(desktopCss, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(designCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration:\s*0\.01ms !important/u);
});

test("canonical FIMA Bot surfaces expose a keyboard skip target through the shared design system", () => {
  for (const [name, source] of Object.entries(fimaBotSurfaces)) {
    assert.match(source, /fima-design-system\.css/u, `${name} must load the shared FIMA design system`);
    assert.match(source, /class="skip-link" href="#main"/u, `${name} must expose a keyboard skip link`);
    assert.match(source, /<main(?: class="[^"]*")? id="main"|<main id="main"/u, `${name} must own the skip-link target`);
  }
});
