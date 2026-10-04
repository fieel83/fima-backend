import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  FIMA_BOT_APPLICATION_ROUTES,
  resolveFimaBotApplicationRoute
} from "../src/fimaBotApplicationRoute.js";
import {
  renderFimaBotApplicationCatalogHtml,
  renderFimaBotApplicationDetailHtml
} from "../src/fimaBotApplicationPageHtml.js";

const client = fs.readFileSync(new URL("../public/assets/js/paradise-apply.js", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("../src/server.js", import.meta.url), "utf8");
const requiredPages = FIMA_BOT_APPLICATION_ROUTES;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("application page resolver uses an explicit fail-closed allowlist", () => {
  assert.equal(Object.keys(requiredPages).length, 17);
  for (const [slug, expected] of Object.entries(requiredPages)) {
    const route = resolveFimaBotApplicationRoute(slug);
    assert.equal(route, expected);
    assert.ok(["staff", "business"].includes(route.workflow));
    assert.equal(route.pathname, `/fima-bot/apply/${slug}`);
    assert.equal(Object.isFrozen(route), true);
  }
  for (const invalid of ["", "Helper", "helper/extra", "../helper", "unknown", null, undefined]) {
    assert.equal(resolveFimaBotApplicationRoute(invalid), null);
    assert.equal(renderFimaBotApplicationDetailHtml(invalid), null);
  }
});

test("catalog output contains all canonical links but no detail form or journey", () => {
  const html = renderFimaBotApplicationCatalogHtml();
  assert.match(html, /data-application-page="catalog"/);
  for (const route of Object.values(requiredPages)) {
    assert.match(html, new RegExp(`href="${escapeRegExp(route.pathname)}"`));
  }
  assert.doesNotMatch(html, /id="applicationForm"/);
  assert.doesNotMatch(html, /id="applicationRouteFocus"/);
  assert.doesNotMatch(html, /class="journey"/);
  assert.doesNotMatch(html, /fima:(?:catalog|detail)-/);
});

test("every canonical slug renders a dedicated server-side detail document", () => {
  for (const route of Object.values(requiredPages)) {
    const html = renderFimaBotApplicationDetailHtml(route.slug);
    assert.match(html, new RegExp(`data-application-page="detail" data-application-slug="${escapeRegExp(route.slug)}"`));
    assert.match(html, new RegExp(`<title>${escapeRegExp(route.label)} Başvurusu · FIMA Bot</title>`));
    assert.match(html, new RegExp(`id="applicationRouteBreadcrumb">${escapeRegExp(route.label)}<`));
    assert.match(html, new RegExp(`id="applicationRouteFamily">${escapeRegExp(route.family)}<`));
    assert.match(html, new RegExp(`id="applicationRouteDescription">${escapeRegExp(route.description)}<`));
    assert.match(html, /id="applicationForm"/);
    assert.match(html, /id="guildSelect"/);
    assert.match(html, /id="typeSelect"/);
    assert.match(html, /id="applicationRouteStatus"[^>]+role="status"[^>]+aria-live="polite"/);
    assert.doesNotMatch(html, /class="apply-hero"/);
    assert.doesNotMatch(html, /id="applicationFamiliesTitle"/);
    assert.doesNotMatch(html, /fima:(?:catalog|detail)-/);
  }
  assert.notEqual(
    renderFimaBotApplicationDetailHtml("helper"),
    renderFimaBotApplicationDetailHtml("developer")
  );
});

test("application surfaces share the complete visible FIMA Bot navigation", () => {
  const html = renderFimaBotApplicationCatalogHtml();
  for (const [pathname, label] of [
    ["/fima-bot", "FIMA Bot"],
    ["/fima-bot/commands", "Komutlar"],
    ["/fima-bot/apply", "Başvurular"],
    ["/fima-bot/premium", "Premium"],
    ["/fima-bot/feedback", "Destek"],
    ["/fima-bot/invite", "Sunucuya ekle"],
    ["/fima-bot/dashboard", "Sunucu merkezi"]
  ]) {
    assert.match(html, new RegExp(`href="${escapeRegExp(pathname)}"[^>]*>${escapeRegExp(label)}<`));
  }
});

test("catalog guard prevents the detail client from touching absent form controls", () => {
  assert.match(client, /const form = byId\("applicationForm"\);\s*if \(!form\) return;/);
  for (const expected of Object.values(requiredPages)) {
    assert.match(client, new RegExp(`"${escapeRegExp(expected.pathname)}": Object\\.freeze\\(\\{ type: "${expected.type}", workflow: "${expected.workflow}"`));
  }
});

test("detail application review keeps submission local until explicit confirmation", () => {
  for (const id of [
    "applicationReviewPanel",
    "reviewGuildName",
    "reviewApplicationType",
    "reviewAnswers",
    "reviewEvidence",
    "reviewEditButton",
    "confirmSubmitButton"
  ]) {
    assert.match(client, new RegExp(`byId\\("${id}"\\)`));
  }
  assert.match(client, /function openReview\(\)/);
  assert.match(client, /form\.addEventListener\("submit", event => \{\s*event\.preventDefault\(\);\s*openReview\(\);/);
  assert.match(client, /async function submitConfirmedApplication\(\)/);
  assert.match(client, /confirmSubmitButton\?\.addEventListener\("click", \(\) => \{[\s\S]*void submitConfirmedApplication\(\);/);
  assert.match(client, /document\.createTextNode\(value\)/);
  assert.doesNotMatch(client, /reviewAnswers\.innerHTML|reviewEvidence\.innerHTML/);
});

test("server renders separate pages with no-store and robots protections", () => {
  assert.match(server, /renderFimaBotApplicationCatalogHtml\(\)/);
  assert.match(server, /const html = renderFimaBotApplicationDetailHtml\(req\.params\.slug\)/);
  assert.match(server, /if \(!html\) return res\.status\(404\)\.send\("Not found"\)/);
  assert.match(server, /res\.set\("Cache-Control", "no-store"\)/);
  assert.match(server, /res\.set\("X-Robots-Tag", "noindex, nofollow, noarchive"\)/);
  for (const [method, route, limiter] of [
    ["get", "draft", "paradiseApplicationDraftLimiter"],
    ["put", "draft", "paradiseApplicationDraftLimiter"],
    ["delete", "draft", "paradiseApplicationDraftLimiter"],
    ["get", "context", "paradiseApplicationLimiter"],
    ["post", "submit", "paradiseApplicationLimiter"]
  ]) {
    assert.match(server, new RegExp(`app\\.${method}\\("/api/fima-bot/applications/${route}", ${limiter}, requireUser,`));
  }
});
