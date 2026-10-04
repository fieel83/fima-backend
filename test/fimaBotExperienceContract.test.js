import assert from "node:assert/strict";
import test from "node:test";
import {
  auditFimaBotPublicAssetPath,
  FIMA_BOT_DESIGN_CONTRACT,
  FIMA_BOT_APPLICATIONS,
  FIMA_BOT_LEGACY_ALIASES,
  FIMA_BOT_PAGES,
  FIMA_BOT_SURFACE,
  fimaBotApplicationCatalog,
  fimaBotNavigation,
  resolveFimaBotApplicationSubmission,
  resolveFimaBotApplicationPage,
  resolveFimaBotPage
} from "../src/fimaBotExperienceContract.js";

test("canonical FIMA Bot pages are unique, separate and access-scoped", () => {
  const pages = Object.values(FIMA_BOT_PAGES);
  assert.equal(new Set(pages.map(page => page.pathname)).size, pages.length);
  assert.deepEqual(new Set(pages.map(page => page.access)), new Set(["public", "account", "owner"]));
  assert.equal(FIMA_BOT_SURFACE.designSystem, "teal-obsidian");
  assert.equal(fimaBotNavigation("en", "public").some(page => page.pathname === "/fima-bot/dashboard"), false);
  assert.equal(fimaBotNavigation("tr", "account").some(page => page.pathname === "/fima-bot/dashboard"), true);
  assert.equal(resolveFimaBotPage("/fima-bot/content-studio", { authenticated: true }).code, "owner_required");
  assert.equal(resolveFimaBotPage("/fima-bot/content-studio", { authenticated: true, owner: true }).kind, "page");
  assert.equal(resolveFimaBotPage("/fima-bot/unknown"), null);
});

test("Paradise survives only as a compatibility redirect, never a visible label", () => {
  for (const [legacy, target] of Object.entries(FIMA_BOT_LEGACY_ALIASES)) {
    assert.match(legacy, /paradise/);
    assert.match(target, /^\/fima-bot/);
    assert.deepEqual(resolveFimaBotPage(legacy), { kind: "redirect", status: 308, target });
  }
  const publicText = JSON.stringify({ pages: FIMA_BOT_PAGES, applications: FIMA_BOT_APPLICATIONS, surface: FIMA_BOT_SURFACE });
  assert.doesNotMatch(publicText, /Paradise/i);
});

test("application discovery has all 21 types in six families and Helper is not privileged", () => {
  const catalog = fimaBotApplicationCatalog("tr");
  assert.equal(catalog.length, 21);
  assert.deepEqual(new Set(catalog.map(item => item.family)), new Set([
    "Community Staff",
    "Clan Operations",
    "Competitive / TSBTR",
    "Partnership",
    "Creator / Media",
    "Reseller / Affiliate"
  ]));
  assert.equal(catalog.every(item => item.autoGrantRole === false), true);
  assert.equal(catalog.find(item => item.type === "helper").submission, "public");
  assert.equal(catalog.filter(item => item.submission === "guild_private").length, 4);
  assert.match(catalog.find(item => item.type === "fima_support").label, /FIMA/);
  assert.equal(JSON.stringify(catalog).includes("BaÅ"), false);
});

test("public submissions require account and Discord verification; private modes stay fail-closed", () => {
  assert.equal(resolveFimaBotApplicationSubmission("helper").code, "account_required");
  assert.equal(resolveFimaBotApplicationSubmission("helper", { authenticated: true }).code, "discord_verification_required");
  assert.deepEqual(resolveFimaBotApplicationSubmission("helper", { authenticated: true, discordVerified: true }).allowed, true);
  assert.equal(resolveFimaBotApplicationSubmission("war_hoster", {
    authenticated: true,
    discordVerified: true,
    publicWebsite: true,
    guildPrivateContext: true
  }).allowed, false);
  assert.equal(resolveFimaBotApplicationSubmission("war_hoster", {
    authenticated: true,
    discordVerified: true,
    publicWebsite: false,
    guildPrivateContext: true
  }).code, "guild_private_review");
});

test("every public application has a separate guarded page route", () => {
  const publicApplications = Object.values(FIMA_BOT_APPLICATIONS).filter(item => item.submission === "public");
  assert.equal(new Set(publicApplications.map(item => item.pathname)).size, publicApplications.length);
  for (const application of publicApplications) {
    assert.equal(resolveFimaBotApplicationPage(application.pathname)?.code, "account_required");
    assert.equal(resolveFimaBotApplicationPage(application.pathname, { authenticated: true })?.code, "discord_verification_required");
    assert.equal(resolveFimaBotApplicationPage(application.pathname, {
      authenticated: true,
      discordVerified: true
    })?.application.type, application.type);
  }
  assert.equal(resolveFimaBotApplicationPage("/fima-bot/apply/clan-mainer"), null);
});

test("shared FIMA shell and public asset paths preserve the canonical FIMA Bot identity", () => {
  assert.equal(FIMA_BOT_DESIGN_CONTRACT.foundation, "fima-shared-product-shell-v1");
  assert.equal(FIMA_BOT_DESIGN_CONTRACT.pageModel, "route-per-feature");
  assert.equal(FIMA_BOT_DESIGN_CONTRACT.accessibility.reducedMotion, true);
  assert.equal(auditFimaBotPublicAssetPath("/assets/images/fima-bot/profile.webp").allowed, true);
  assert.equal(auditFimaBotPublicAssetPath("/assets/images/paradise/profile.webp").code, "fima_bot_asset_root_required");
  assert.equal(auditFimaBotPublicAssetPath("/assets/images/fima-bot/paradise-banner.webp").code, "legacy_identity_in_public_asset");
});
