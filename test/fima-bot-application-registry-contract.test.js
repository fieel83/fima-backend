import assert from "node:assert/strict";
import test from "node:test";
import {
  FIMA_BOT_APPLICATION_POLICIES
} from "../src/fimaBotApplicationPolicy.js";
import {
  FIMA_BOT_APPLICATION_ROUTES
} from "../src/fimaBotApplicationRoute.js";
import {
  FIMA_BOT_APPLICATIONS
} from "../src/fimaBotExperienceContract.js";

test("public website application registries stay exactly aligned", () => {
  const publicApplications = Object.values(FIMA_BOT_APPLICATIONS)
    .filter(application => application.submission === "public");

  assert.equal(publicApplications.length, 17);
  assert.equal(Object.keys(FIMA_BOT_APPLICATION_ROUTES).length, publicApplications.length);

  for (const application of publicApplications) {
    const route = FIMA_BOT_APPLICATION_ROUTES[application.slug];
    const policy = FIMA_BOT_APPLICATION_POLICIES[application.type];

    assert.ok(route, application.type);
    assert.equal(route.type, application.type);
    assert.equal(route.pathname, application.pathname);
    assert.equal(policy.slug, application.slug);
    assert.equal(policy.publicFormPath, application.pathname);
    assert.equal(policy.submitPath, `/api/fima-bot/applications/${application.type}`);
    assert.equal(policy.reviewMode, "manual_review");
    assert.equal(policy.autoGrantRole, false);
  }
});

test("guild-private applications cannot leak into public website routes", () => {
  const privateApplications = Object.values(FIMA_BOT_APPLICATIONS)
    .filter(application => application.submission === "guild_private");
  const publicRouteTypes = new Set(
    Object.values(FIMA_BOT_APPLICATION_ROUTES).map(route => route.type)
  );

  assert.equal(privateApplications.length, 4);
  for (const application of privateApplications) {
    const policy = FIMA_BOT_APPLICATION_POLICIES[application.type];

    assert.equal(application.pathname, null);
    assert.equal(publicRouteTypes.has(application.type), false);
    assert.equal(policy.publicFormPath, null);
    assert.equal(policy.submitPath, `/api/fima-bot/guilds/:guildId/applications/${application.type}`);
    assert.equal(policy.reviewMode, "guild_private_review");
    assert.equal(policy.autoGrantRole, false);
  }
});
