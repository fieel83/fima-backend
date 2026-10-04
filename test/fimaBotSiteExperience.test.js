import assert from "node:assert/strict";
import test from "node:test";
import { FIMA_BOT_APPLICATIONS, FIMA_BOT_PAGES } from "../src/fimaBotExperienceContract.js";
import { FIMA_BOT_DASHBOARD_ROUTES } from "../src/fimaBotDashboardContract.js";
import {
  FIMA_BOT_APPLICATION_FORM_SCHEMAS,
  FIMA_BOT_THEME_STYLESHEET,
  fimaBotSiteRouteInventory,
  resolveFimaBotSiteRequest
} from "../src/fimaBotSiteExperience.js";

const GUILD_ID = "1520519015661961257";
const account = Object.freeze({
  locale: "en",
  authenticated: true,
  discordVerified: true,
  authorizedGuildIds: [GUILD_ID]
});

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test("every canonical site route renders as its own complete FIMA page", () => {
  for (const page of Object.values(FIMA_BOT_PAGES)) {
    const context = { ...account, owner: page.access === "owner" };
    const response = resolveFimaBotSiteRequest(page.pathname, context);
    assert.equal(response.status, 200, page.pathname);
    assert.equal(response.pageId, page.id, page.pathname);
    assert.equal(count(response.body, "<main "), 1, page.pathname);
    assert.equal(count(response.body, "data-page-id="), 1, page.pathname);
    assert.match(response.body, new RegExp(`href="${FIMA_BOT_THEME_STYLESHEET.replaceAll("/", "\\/")}"`));
    assert.match(response.body, /<title>.+ · FIMA Bot<\/title>/);
  }
});

test("route inventory exposes separate static, application and guild-dashboard pages", () => {
  const inventory = fimaBotSiteRouteInventory();
  assert.equal(inventory.staticRoutes.length, 8);
  assert.equal(inventory.publicApplicationRoutes.length, 17);
  assert.equal(inventory.dashboardRouteTemplates.length, 28);
  assert.equal(new Set([
    ...inventory.staticRoutes,
    ...inventory.publicApplicationRoutes,
    ...inventory.dashboardRouteTemplates
  ]).size, 53);
  assert.equal(inventory.dashboardRouteTemplates.every(path => path.startsWith("/fima-bot/dashboard/servers/:guildId/")), true);
});

test("application directory renders all 21 types with public and guild-private boundaries", () => {
  const response = resolveFimaBotSiteRequest("/fima-bot/apply", { locale: "en" });
  assert.equal(response.status, 200);
  assert.equal(count(response.body, 'class="application-card"'), 21);
  assert.equal(count(response.body, 'class="private-label"'), 4);
  assert.equal(count(response.body, 'class="text-link" href="/fima-bot/apply/'), 17);
  assert.match(response.body, /Helper/);
  assert.match(response.body, /Reseller \/ Affiliate/);
  assert.match(response.body, /No role is granted automatically/);
});

test("all 17 public application types have type-specific, manual-review form schemas", () => {
  const publicApplications = Object.values(FIMA_BOT_APPLICATIONS).filter(item => item.submission === "public");
  assert.equal(Object.keys(FIMA_BOT_APPLICATION_FORM_SCHEMAS).length, 17);
  for (const application of publicApplications) {
    const schema = FIMA_BOT_APPLICATION_FORM_SCHEMAS[application.type];
    assert.equal(schema.pathname, application.pathname);
    assert.equal(schema.reviewMode, "manual_review");
    assert.equal(schema.autoGrantRole, false);
    assert.equal(schema.fields.length, 5);
    assert.equal(schema.fields.at(-1).name, `${application.type}Response`);
    assert.equal(schema.fields.every(field => field.required), true);
  }
  assert.equal(new Set(Object.values(FIMA_BOT_APPLICATION_FORM_SCHEMAS).map(schema => schema.submitPath)).size, 17);
});

test("each public application page is independently guarded and posts its own type", () => {
  const helperPath = FIMA_BOT_APPLICATIONS.helper.pathname;
  assert.equal(resolveFimaBotSiteRequest(helperPath).code, "account_required");
  assert.equal(resolveFimaBotSiteRequest(helperPath, { authenticated: true }).code, "discord_verification_required");

  for (const type of ["helper", "developer", "partnership", "creator", "reseller"]) {
    const application = FIMA_BOT_APPLICATIONS[type];
    const response = resolveFimaBotSiteRequest(application.pathname, account);
    assert.equal(response.status, 200);
    assert.equal(response.pageId, `application:${type}`);
    assert.match(response.body, new RegExp(`action="/api/fima-bot/applications/${type}"`));
    assert.match(response.body, new RegExp(`name="${type}Response"`));
    assert.match(response.body, /data-review-mode="manual_review"/);
    assert.match(response.body, /data-auto-grant-role="false"/);
    assert.equal(count(response.body, 'class="application-form"'), 1);
  }
});

test("guild-private application types never gain public form routes", () => {
  for (const application of Object.values(FIMA_BOT_APPLICATIONS).filter(item => item.submission === "guild_private")) {
    assert.equal(application.pathname, null);
    const guessedPath = `/fima-bot/apply/${application.type.replaceAll("_", "-")}`;
    const response = resolveFimaBotSiteRequest(guessedPath, account);
    assert.equal(response.status, 404);
    assert.equal(response.kind, "not_found");
    assert.doesNotMatch(response.body, /class="application-form"/);
  }
});

test("all 28 dashboard features render at distinct authorized guild pages", () => {
  for (const route of Object.values(FIMA_BOT_DASHBOARD_ROUTES)) {
    const path = `/fima-bot/dashboard/servers/${GUILD_ID}/${route.id}`;
    const response = resolveFimaBotSiteRequest(path, account);
    assert.equal(response.status, 200, route.id);
    assert.equal(response.pageId, `dashboard:${route.id}`);
    assert.equal(response.guildId, GUILD_ID);
    assert.equal(count(response.body, 'class="dashboard-main"'), 1);
    assert.equal(count(response.body, `data-page-id="dashboard:${route.id}"`), 1);
    assert.match(response.body, new RegExp(`href="${path.replaceAll("/", "\\/")}" aria-current="page"`));
  }
});

test("dashboard experience never renders an unimplemented save route", () => {
  for (const routeId of Object.keys(FIMA_BOT_DASHBOARD_ROUTES)) {
    const response = resolveFimaBotSiteRequest(`/fima-bot/dashboard/${GUILD_ID}/${routeId}`, account);
    assert.equal(response.status, 200, routeId);
    if (routeId !== "applications") assert.match(response.body, /Read only/);
    assert.doesNotMatch(response.body, /Save changes/);
    assert.doesNotMatch(response.body, /data-requires-exact-readback|data-rollback-on-mismatch/);
    assert.doesNotMatch(response.body, /method="post" action="\/api\/fima-bot\/dashboard/);
  }
});

test("editable overview preview points back to the live dashboard without fake controls", () => {
  const response = resolveFimaBotSiteRequest(`/fima-bot/dashboard/${GUILD_ID}/overview`, account);
  assert.match(response.body, /Return to live dashboard/);
  assert.match(response.body, new RegExp(`href="\\/fima-bot\\/dashboard\\/servers\\/${GUILD_ID}\\/overview"`));
  assert.doesNotMatch(response.body, /name="activeSetupMode"|<form/);
});

test("dashboard application page shows the full multi-type catalog, not a Helper-only screen", () => {
  const response = resolveFimaBotSiteRequest(`/fima-bot/dashboard/${GUILD_ID}/applications`, account);
  assert.equal(count(response.body, 'class="application-settings"'), 1);
  assert.equal(count(response.body, '<li><span>'), 21);
  assert.match(response.body, /Helper/);
  assert.match(response.body, /Moderator/);
  assert.match(response.body, /FIMA Support/);
  assert.match(response.body, /Partnership/);
  assert.match(response.body, /Creator \/ Media Partner/);
  assert.match(response.body, /Reseller \/ Affiliate/);
});

test("guild dashboard entry, authorization and unknown-route behavior fail closed", () => {
  assert.equal(resolveFimaBotSiteRequest(`/fima-bot/dashboard/${GUILD_ID}/overview`).code, "account_required");
  assert.equal(resolveFimaBotSiteRequest(`/fima-bot/dashboard/${GUILD_ID}/overview`, {
    authenticated: true,
    authorizedGuildIds: []
  }).code, "guild_not_authorized");
  assert.deepEqual(resolveFimaBotSiteRequest(`/fima-bot/dashboard/${GUILD_ID}`, account), {
    kind: "redirect",
    status: 302,
    target: `/fima-bot/dashboard/servers/${GUILD_ID}/overview`
  });
  assert.equal(resolveFimaBotSiteRequest(`/fima-bot/dashboard/${GUILD_ID}/unknown`, account).status, 404);
});

test("account and owner pages enforce their access levels", () => {
  assert.equal(resolveFimaBotSiteRequest("/fima-bot/dashboard").code, "account_required");
  assert.equal(resolveFimaBotSiteRequest("/fima-bot/dashboard", account).status, 200);
  assert.equal(resolveFimaBotSiteRequest("/fima-bot/content-studio", account).code, "owner_required");
  const ownerPage = resolveFimaBotSiteRequest("/fima-bot/content-studio", { ...account, owner: true });
  assert.equal(ownerPage.status, 200);
  assert.match(ownerPage.body, /Production publishing disabled/);
  assert.doesNotMatch(ownerPage.body, /webhook(?:Url|Token)/i);
});

test("legacy Paradise URLs only return compatibility redirects", () => {
  const response = resolveFimaBotSiteRequest("/paradise/apply", account);
  assert.deepEqual(response, { kind: "redirect", status: 308, target: "/fima-bot/apply" });
  const rendered = resolveFimaBotSiteRequest("/fima-bot", account);
  assert.doesNotMatch(rendered.body, /Paradise/i);
});

test("localized page copy is UTF-8 clean and untrusted guild labels are escaped", () => {
  const turkish = resolveFimaBotSiteRequest("/fima-bot/apply", { locale: "tr" });
  assert.match(turkish.body, /Başvuru/);
  assert.match(turkish.body, /İçerik Üreticisi/);
  assert.doesNotMatch(turkish.body, /BaÃ|Ä°|ÅŸ/);

  const dashboard = resolveFimaBotSiteRequest("/fima-bot/dashboard", {
    authenticated: true,
    authorizedGuildIds: [GUILD_ID],
    guilds: [{ id: GUILD_ID, name: '<img src=x onerror="alert(1)">' }]
  });
  assert.doesNotMatch(dashboard.body, /<img src=x/);
  assert.match(dashboard.body, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
});
