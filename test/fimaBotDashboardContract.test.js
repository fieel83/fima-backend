import assert from "node:assert/strict";
import test from "node:test";
import {
  FIMA_BOT_DASHBOARD_ROUTES,
  dashboardPath,
  fimaBotDashboardNavigation,
  planFimaBotDashboardRollback,
  planFimaBotDashboardSave,
  resolveFimaBotDashboardPage,
  verifyFimaBotDashboardReadback
} from "../src/fimaBotDashboardContract.js";
import { PARADISE_CUSTOMER_WORKSPACE_ROUTES } from "../src/paradiseDashboardWorkspace.js";

const ACTOR_ID = "1520519015661961258";
const GUILD_ID = "1520519015661961257";

test("dashboard uses distinct guild-scoped page routes and rejects unknown routes", () => {
  const paths = Object.keys(FIMA_BOT_DASHBOARD_ROUTES).map(route => dashboardPath(GUILD_ID, route));
  assert.equal(new Set(paths).size, paths.length);
  assert.equal(paths.every(path => path.startsWith(`/fima-bot/dashboard/servers/${GUILD_ID}/`)), true);
  assert.equal(dashboardPath(GUILD_ID, "missing"), null);
  assert.equal(resolveFimaBotDashboardPage(`${dashboardPath(GUILD_ID, "applications")}`, [GUILD_ID]).route.id, "applications");
  assert.equal(resolveFimaBotDashboardPage(`${dashboardPath(GUILD_ID, "applications")}`, []).code, "guild_not_authorized");
  assert.equal(resolveFimaBotDashboardPage(`/fima-bot/dashboard/${GUILD_ID}/unknown`, [GUILD_ID]), null);
});

test("dashboard navigation is grouped, localized and page-per-feature", () => {
  const navigation = fimaBotDashboardNavigation(GUILD_ID, "en-GB");
  const pages = navigation.flatMap(group => group.pages);
  assert.equal(navigation.length, 7);
  assert.equal(pages.length, Object.keys(FIMA_BOT_DASHBOARD_ROUTES).length);
  assert.equal(new Set(pages.map(page => page.pathname)).size, pages.length);
  assert.equal(pages.find(page => page.id === "overview").label, "Overview");
  assert.equal(pages.find(page => page.id === "audit").readOnly, true);
  assert.deepEqual(fimaBotDashboardNavigation("invalid"), []);
});

test("site dashboard routes exactly match the canonical customer workspace inventory", () => {
  assert.deepEqual(
    Object.keys(FIMA_BOT_DASHBOARD_ROUTES),
    PARADISE_CUSTOMER_WORKSPACE_ROUTES.map(route => route.id)
  );
  assert.equal(Object.hasOwn(FIMA_BOT_DASHBOARD_ROUTES, "content-studio"), false);
  assert.equal(FIMA_BOT_DASHBOARD_ROUTES.premium.editableKeys.length, 0);
  assert.deepEqual(FIMA_BOT_DASHBOARD_ROUTES.overview.editableKeys, ["language", "dashboardTheme"]);
});

test("save contract requires guild authorization, CSRF, allowlisted fields and exact readback", () => {
  const plan = planFimaBotDashboardSave({
    actorId: ACTOR_ID,
    guildId: GUILD_ID,
    authorizedGuildIds: [GUILD_ID],
    route: "branding",
    csrfValidated: true,
    currentVersion: "7",
    currentValue: { language: "tr", brandColor: "#20d9ba" },
    patch: { language: "en" }
  });
  assert.equal(plan.requiresExactReadback, true);
  assert.equal(plan.rollbackSnapshot.value.language, "tr");
  assert.equal(verifyFimaBotDashboardReadback(plan, {
    guildId: GUILD_ID,
    route: "branding",
    value: plan.value
  }).verified, true);
  assert.throws(() => verifyFimaBotDashboardReadback(plan, {
    guildId: GUILD_ID,
    route: "branding",
    value: { ...plan.value, language: "tr" }
  }), { code: "dashboard_readback_mismatch" });
  assert.equal(planFimaBotDashboardRollback(plan).restore.value.language, "tr");
});

test("dashboard patches fail closed on secrets and read-only pages", () => {
  const base = {
    actorId: ACTOR_ID,
    guildId: GUILD_ID,
    authorizedGuildIds: [GUILD_ID],
    route: "welcome",
    csrfValidated: true,
    currentVersion: "1",
    currentValue: {}
  };
  assert.throws(() => planFimaBotDashboardSave({ ...base, patch: { welcome: { webhookToken: "redacted" } } }), {
    code: "dashboard_patch_key_forbidden"
  });
  assert.throws(() => planFimaBotDashboardSave({ ...base, csrfValidated: false, patch: { welcome: {} } }), {
    code: "csrf_required"
  });
  assert.throws(() => planFimaBotDashboardSave({ ...base, route: "audit", patch: { audit: true } }), {
    code: "dashboard_route_read_only"
  });
  assert.throws(() => planFimaBotDashboardSave({
    ...base,
    route: "overview",
    patch: { activeSetupMode: "unsupported" }
  }), { code: "dashboard_patch_key_forbidden" });
});

test("dashboard save plans use the canonical customer workspace normalizer", () => {
  const plan = planFimaBotDashboardSave({
    actorId: ACTOR_ID,
    guildId: GUILD_ID,
    authorizedGuildIds: [GUILD_ID],
    route: "overview",
    csrfValidated: true,
    currentVersion: "1",
    currentValue: { activeSetupMode: "community", language: "tr", dashboardTheme: "paradise" },
    patch: { language: "en", dashboardTheme: "midnight" }
  });
  assert.deepEqual(plan.value, { activeSetupMode: "community", language: "en", dashboardTheme: "midnight" });
});
