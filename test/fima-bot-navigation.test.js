import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const publicFile = (name) => fs.readFileSync(new URL(`../public/${name}`, import.meta.url), "utf8");

const productPages = [
  { file: "fima-bot-commands.html", current: "/fima-bot/commands" },
  { file: "fima-bot-invite.html", current: "/fima-bot/invite" },
  { file: "fima-bot-premium.html", current: "/fima-bot/premium" },
  { file: "fima-bot-feedback.html", current: "/fima-bot/feedback" }
];

const canonicalRoutes = [
  "/fima-bot",
  "/fima-bot/commands",
  "/fima-bot/apply",
  "/fima-bot/invite",
  "/fima-bot/premium",
  "/fima-bot/feedback",
  "/fima-bot/content-studio",
  "/fima-bot/embed-builder",
  "/fima-bot/dashboard"
];

function navigationMarkup(source, className) {
  const match = source.match(new RegExp(`<(?:div|nav) class="${className}"[^>]*>([\\s\\S]*?)<\\/(?:div|nav)>`, "u"));
  assert.ok(match, `${className} navigation must exist`);
  return match[1];
}

function hrefs(markup) {
  return [...markup.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);
}

test("standalone FIMA Bot product pages share a complete canonical navigation", () => {
  for (const { file, current } of productPages) {
    const navigation = navigationMarkup(publicFile(file), "page-links");
    assert.deepEqual(hrefs(navigation), canonicalRoutes, `${file} must keep the canonical product route order`);
    assert.match(navigation, new RegExp(`href="${current}" aria-current="page"`, "u"));
    assert.equal((navigation.match(/aria-current="page"/gu) || []).length, 1, `${file} must expose one current page`);
  }
});

test("FIMA Bot dashboard exposes product routes and marks its own route current", () => {
  const navigation = navigationMarkup(publicFile("fima-bot-dashboard.html"), "topnav");
  assert.deepEqual(hrefs(navigation), [...canonicalRoutes, "/dashboard"]);
  assert.match(navigation, /href="\/fima-bot\/dashboard" aria-current="page"/u);
  assert.match(navigation, /class="account-link" href="\/dashboard">Hesabım/u);
});

test("FIMA Bot marketing header links to both content workspaces and the server dashboard", () => {
  const navigation = navigationMarkup(publicFile("paradise-bot.html"), "bot-menu");
  assert.match(navigation, /href="\/fima-bot\/content-studio"/u);
  assert.match(navigation, /href="\/fima-bot\/embed-builder"/u);
  assert.match(navigation, /href="\/fima-bot\/dashboard"/u);
});

test("application and content workspaces retain the complete product route map", () => {
  const applicationNavigation = navigationMarkup(publicFile("paradise-apply.html"), "site-menu");
  assert.deepEqual(hrefs(applicationNavigation), canonicalRoutes);
  assert.match(applicationNavigation, /href="\/fima-bot\/apply" aria-current="page"/u);

  const contentNavigation = navigationMarkup(publicFile("paradise-content-studio.html"), "workspace-switcher");
  assert.deepEqual(hrefs(contentNavigation), canonicalRoutes);
  assert.match(contentNavigation, /data-content-workspace="content-studio" href="\/fima-bot\/content-studio" aria-current="page"/u);
  assert.match(contentNavigation, /data-content-workspace="embed-builder" href="\/fima-bot\/embed-builder"/u);
});

test("responsive product navigation retains a dashboard escape hatch", () => {
  const pageCss = publicFile("assets/css/fima-bot-pages.css");
  const dashboardCss = publicFile("assets/css/fima-bot-dashboard.css");
  assert.match(pageCss, /@media\(max-width:900px\)\{\.page-links\{overflow-x:auto/u);
  assert.doesNotMatch(dashboardCss, /\.topnav a:not\(\.account-link\)\{display:none\}/u);
  assert.match(dashboardCss, /\.topnav\{[^}]*overflow-x:auto/u);
});
