import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../public/fima-bot-dashboard.html", import.meta.url), "utf8");
const script = fs.readFileSync(new URL("../public/assets/js/fima-bot-dashboard.js", import.meta.url), "utf8");
const operationsScript = fs.readFileSync(new URL("../public/assets/js/fima-guild-operations.js", import.meta.url), "utf8");
const controlsScript = fs.readFileSync(new URL("../public/assets/js/fima-controls.js", import.meta.url), "utf8");
const i18nScript = fs.readFileSync(new URL("../public/assets/js/fima-bot-dashboard-i18n.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../public/assets/css/fima-bot-dashboard.css", import.meta.url), "utf8");

test("customer dashboard is server-first and keeps workspace hidden initially", () => {
  assert.match(html, /data-server-directory/);
  assert.match(html, /data-workspace hidden/);
  assert.match(html, /Önce yöneteceğin sunucuyu seç/);
  assert.doesNotMatch(html, /data-guild-id="\d{16,22}"/);
});

test("customer dashboard scopes every workspace read to a selected authorized guild", () => {
  assert.match(script, /const requestedGuildId = safeGuildId\(guildId\)/);
  assert.match(script, /state\.workspaces\.find\(item => item\.guildId === requestedGuildId\)/);
  assert.match(script, /LIST_ENDPOINT}\/\$\{encodeURIComponent\(card\.guildId\)\}/);
  assert.match(script, /payload\.workspace\?\.guildId !== card\.guildId/);
  assert.match(script, /state\.workspaces\.some\(card => card\.guildId === requested\.guildId\)/);
});

test("customer dashboard covers loading empty error unauthorized and invite states", () => {
  assert.match(html, /Sunucuların hazırlanıyor/);
  assert.match(script, /Yönetilebilir sunucu bulunamadı/);
  assert.match(script, /paradise_workspace_unavailable/);
  assert.match(script, /guild_not_authorized/);
  assert.match(script, /discord_reauthorization_required/);
  assert.match(script, /FIMA Bot bu sunucuda kurulu değil/);
  assert.match(script, /requestId !== state\.request/);
});

test("customer dashboard writes only allowlisted route values with session CSRF protection", () => {
  assert.match(script, /request\("\/api\/csrf-token"\)/);
  assert.match(script, /method: "PATCH"/);
  assert.match(script, /credentials: "include"/);
  assert.match(script, /"x-fima-csrf": csrf/);
  assert.match(script, /body: JSON\.stringify\(\{ route, value, expectedVersion \}\)/);
  assert.match(script, /result\.committedVersion !== expectedVersion \+ 1/);
  assert.match(script, /result\.readbackVersion !== nextPayload\.version/);
  assert.match(script, /workspace_version_conflict/);
  assert.match(script, /EDITABLE_ROUTES\[payload\.route\]/);
  assert.match(script, /result\.workspace/);
  assert.match(script, /nextPayload\?\.workspace\?\.guildId !== state\.selected\.guildId/);
  assert.doesNotMatch(script, /\bPOST\b|\bDELETE\b/);
  assert.doesNotMatch(script, /localStorage|sessionStorage/);
  assert.doesNotMatch(script, /Authorization\s*:/i);
  assert.doesNotMatch(script, /password\s*[:=]|secret\s*[:=]/i);
});

test("customer dashboard editor supports save discard dirty guards and accessible controls", () => {
  assert.match(script, /data-config-form/);
  assert.match(script, /data-save-config/);
  assert.match(script, /data-discard-config/);
  assert.match(script, /renderModule\(state\.payload\)/);
  assert.match(script, /window\.confirm\(/);
  assert.match(script, /beforeunload/);
  assert.match(script, /event\.returnValue = ""/);
  assert.match(script, /aria-busy/);
  assert.match(script, /role="status" aria-live="polite"/);
  assert.match(script, /<label for="\$\{id\}">/);
  assert.match(script, /data-mapping-key/);
  assert.match(script, /pattern="\[0-9\]\{16,22\}"/);
  assert.doesNotMatch(script, /FormData|type="file"|\/upload/);
  assert.match(css, /\.config-editor\{/);
  assert.match(css, /\.config-switch\{/);
  assert.match(css, /\.mapping-row\{/);
  assert.match(css, /\.editor-footer\{/);
});

test("customer dashboard assets preserve theme and accessibility contracts", () => {
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /class="skip-link"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /--cyan:#56d9ff/);
  assert.match(css, /focus-visible/);
});

test("applications module exposes the complete multi-family application catalog", () => {
  assert.match(script, /Başvuru rol kataloğu/);
  for (const route of ["helper", "staff", "moderator", "support", "training-hoster", "event-staff", "giveaway-staff", "content-creator", "video-team", "creative-team", "developer", "fima-support", "macro-staff", "fflag-staff", "partnership", "creator", "reseller"]) {
    assert.match(script, new RegExp(`\\["${route}", "`));
  }
  assert.match(script, /href="\/fima-bot\/apply\/\$\{slug\}"/);
  assert.match(css, /\.application-family-grid\{/);
});

test("customer dashboard never offers automatic application role grants", () => {
  assert.doesNotMatch(script, /autoGrantRole|Rolü otomatik ver/);
});

test("dashboard provides grouped mobile navigation, route pagination and accessible state changes", () => {
  assert.match(html, /data-module-select[^>]+aria-describedby="mobile-module-status" disabled/);
  assert.match(script, /<optgroup label=/);
  assert.match(script, /select\.disabled = disabled/);
  assert.match(script, /class="module-pagination" aria-label="Modül sayfaları"/);
  assert.match(script, /href="\$\{dashboardPath\(state\.selected\?\.guildId, route\.id\)\}" data-module-page=/);
  assert.match(script, /tone === "error" \? "alert" : "status"/);
  assert.match(script, /panel\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(script, /workspace_route_unavailable/);
  assert.match(script, /Bu sunucuda gösterilecek modül yok/);
  assert.match(css, /\.mobile-module-picker \.fima-select-trigger:disabled\{/);
  assert.match(css, /\.module-pagination>a:.*focus-visible/);
});

test("dashboard replaces native channel menus in dynamically rendered operation panels", () => {
  assert.match(operationsScript, /import \{ enhanceFimaControls \}/);
  assert.ok((operationsScript.match(/enhanceFimaControls\(body\)/g) || []).length >= 2);
  assert.match(operationsScript, /enhanceFimaControls\(voicePanel\)/);
  assert.match(operationsScript, /enhanceFimaControls\(migrationPanel\)/);
  assert.match(controlsScript, /setAttribute\('role', 'combobox'\)/);
  assert.match(controlsScript, /setAttribute\('role', 'listbox'\)/);
  assert.match(controlsScript, /classList\.add\('fima-select-source'\)/);
  assert.match(html, /fima-bot-dashboard\.js\?v=20261006-1/);
});

test("dashboard shares language preferences and translates dynamic browser UI without resetting the editor", () => {
  assert.match(html, /id="fimaUiLanguage"/);
  const sharedRuntime = html.indexOf("/assets/js/fima-surface-i18n.js");
  const dashboardI18n = html.indexOf("/assets/js/fima-bot-dashboard-i18n.js");
  const dashboardModule = html.indexOf("/assets/js/fima-bot-dashboard.js");
  assert.ok(sharedRuntime >= 0 && sharedRuntime < dashboardI18n && dashboardI18n < dashboardModule);

  assert.match(i18nScript, /FimaSurfaceI18n/);
  assert.match(i18nScript, /runtime\.mount\(/);
  assert.match(i18nScript, /window\.FimaBotDashboardI18n/);
  assert.match(i18nScript, /title: "FIMA Bot \| Server Center"/);
  assert.match(i18nScript, /description: "FIMA Bot server management center"/);
  assert.match(i18nScript, /\^\(\[\\d\.,\]\+\) üye\$/);
  assert.match(i18nScript, /yapılandırılmış alan/);
  assert.match(i18nScript, /Yalnızca/);

  assert.match(script, /dashboardLanguage\(\) === "en" \? "en-US" : "tr-TR"/);
  assert.match(script, /new Intl\.DateTimeFormat\(locale/);
  assert.match(script, /new Intl\.NumberFormat\(numberLocale\)/);
  assert.match(script, /localizedCopy\("Kaydedilmemiş değişikliklerin var\./);
  assert.match(script, /setCustomValidity\(localizedCopy\(/);
  assert.match(script, /document\.addEventListener\("fima:language-change"/);
  assert.match(script, /if \(state\.payload\?\.workspace && state\.selected\) renderWorkspaceFacts\(state\.payload\)/);
  assert.doesNotMatch(script, /fima:language-change[\s\S]{0,180}renderModule\(/);
});
