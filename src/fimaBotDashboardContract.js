import { createHash } from "node:crypto";
import {
  normalizeParadiseCustomerWorkspacePatch,
  PARADISE_CUSTOMER_WORKSPACE_ROUTES
} from "./paradiseDashboardWorkspace.js";

const DASHBOARD_ROUTE_METADATA = Object.freeze({
  overview: ["core", "Genel bakış", ["language", "dashboardTheme"]],
  modules: ["core", "Modüller", ["modules"]],
  setup: ["core", "Kurulum sihirbazı", []],
  channels: ["server", "Kanallar", ["channelMappings"]],
  roles: ["server", "Roller ve izinler", ["roleMappings"]],
  welcome: ["community", "Karşılama", ["welcome"]],
  profiles: ["community", "Profiller", []],
  leaderboards: ["engagement", "Liderlik tabloları", []],
  challenge: ["engagement", "Meydan okuma sistemi", []],
  availability: ["engagement", "Uygunluk ve izin", []],
  sessions: ["community", "Eğitim ve seçme", ["sessionSettings"]],
  applications: ["community", "Başvurular", ["applicationSettings"]],
  tickets: ["community", "Destek talepleri", ["ticketSettings"]],
  moderation: ["safety", "Moderasyon", []],
  security: ["safety", "Güvenlik", ["automod"]],
  levels: ["engagement", "XP ve seviyeler", ["xpSettings"]],
  voice: ["engagement", "Katıl ve oluştur", ["voiceSettings"]],
  events: ["engagement", "Etkinlikler ve günlük soru", []],
  social: ["engagement", "Sosyal bildirimler", ["socialSettings"]],
  ai: ["engagement", "AI asistanı", ["aiSettings"]],
  commands: ["server", "Özel komutlar ve otomatik yanıt", []],
  branding: ["content", "Marka", ["brandColor", "dashboardTheme", "messageDensity", "separatorStyle", "footerStyle", "language"]],
  logs: ["operations", "Kayıtlar ve dökümler", ["logSettings"]],
  premium: ["operations", "Premium ve faturalama", []],
  audit: ["operations", "Denetim geçmişi", []],
  content: ["content", "Content", []],
  polls: ["content", "Native Polls", []],
  integrations: ["operations", "Integrations", []]
});

const DASHBOARD_ROUTE_DEFINITIONS = PARADISE_CUSTOMER_WORKSPACE_ROUTES.map(({ id, title }) => {
  const [group, tr, editableKeys] = DASHBOARD_ROUTE_METADATA[id] || [];
  if (!group) throw new Error(`missing_dashboard_route_metadata:${id}`);
  return [id, group, tr, title, editableKeys];
});

export const FIMA_BOT_DASHBOARD_ROUTES = Object.freeze(Object.fromEntries(DASHBOARD_ROUTE_DEFINITIONS.map(
  ([id, group, tr, en, editableKeys]) => [id, Object.freeze({
    id,
    group,
    label: Object.freeze({ tr, en }),
    editableKeys: Object.freeze(editableKeys),
    page: true
  })]
)));

const DISCORD_ID = /^\d{16,22}$/;
const SAFE_KEY = /^[a-z][a-zA-Z0-9]{0,48}$/;
const SECRET_KEY = /(secret|token|password|cookie|authorization|private.?key|recovery|webhook.?url|webhook.?token|license.?key|hwid|device.?id)/i;

const dashboardError = code => Object.assign(new Error(code), { code });

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(stable(value)).digest("hex");
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function assertSecretFree(value, path = []) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSecretFree(entry, [...path, String(index)]));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (!SAFE_KEY.test(key) || SECRET_KEY.test(key)) throw dashboardError("dashboard_patch_key_forbidden");
    assertSecretFree(entry, [...path, key]);
  }
}

export function dashboardPath(guildId, route = "overview") {
  const selectedRoute = FIMA_BOT_DASHBOARD_ROUTES[route];
  if (!DISCORD_ID.test(String(guildId || "")) || !selectedRoute) return null;
  return `/fima-bot/dashboard/servers/${guildId}/${selectedRoute.id}`;
}

export function fimaBotDashboardNavigation(guildId, locale = "tr") {
  if (!DISCORD_ID.test(String(guildId || ""))) return Object.freeze([]);
  const selectedLocale = String(locale || "").toLowerCase().split("-")[0] === "en" ? "en" : "tr";
  const groups = new Map();
  for (const route of Object.values(FIMA_BOT_DASHBOARD_ROUTES)) {
    if (!groups.has(route.group)) groups.set(route.group, []);
    groups.get(route.group).push(Object.freeze({
      id: route.id,
      label: route.label[selectedLocale],
      pathname: dashboardPath(guildId, route.id),
      readOnly: route.editableKeys.length === 0
    }));
  }
  return Object.freeze([...groups].map(([id, pages]) => Object.freeze({ id, pages: Object.freeze(pages) })));
}

export function resolveFimaBotDashboardPage(pathname, authorizedGuildIds = []) {
  const match = String(pathname || "").split(/[?#]/, 1)[0].match(/^\/fima-bot\/dashboard\/(?:servers\/)?(\d{16,22})\/([a-z][a-z0-9-]{0,39})$/);
  if (!match) return null;
  const [, guildId, routeId] = match;
  const route = FIMA_BOT_DASHBOARD_ROUTES[routeId];
  if (!route) return null;
  if (!new Set(authorizedGuildIds.map(String)).has(guildId)) return Object.freeze({ kind: "deny", code: "guild_not_authorized" });
  return Object.freeze({ kind: "page", guildId, route });
}

export function planFimaBotDashboardSave({
  actorId,
  guildId,
  authorizedGuildIds = [],
  route,
  csrfValidated = false,
  currentVersion,
  currentValue,
  patch
} = {}) {
  if (!DISCORD_ID.test(String(actorId || ""))) throw dashboardError("account_required");
  if (!DISCORD_ID.test(String(guildId || "")) || !authorizedGuildIds.map(String).includes(String(guildId))) {
    throw dashboardError("guild_not_authorized");
  }
  if (!csrfValidated) throw dashboardError("csrf_required");
  const definition = FIMA_BOT_DASHBOARD_ROUTES[route];
  if (!definition || definition.editableKeys.length === 0) throw dashboardError("dashboard_route_read_only");
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw dashboardError("dashboard_patch_invalid");
  const keys = Object.keys(patch);
  if (keys.length === 0 || keys.some(key => !definition.editableKeys.includes(key))) throw dashboardError("dashboard_patch_key_forbidden");
  assertSecretFree(patch);
  let normalizedPatch;
  try {
    normalizedPatch = normalizeParadiseCustomerWorkspacePatch({ route: definition.id, value: clone(patch) }).patch;
  } catch {
    throw dashboardError("dashboard_patch_invalid");
  }
  const before = clone(currentValue || {});
  const next = { ...before, ...clone(normalizedPatch) };
  return Object.freeze({
    kind: "dashboard_save_plan",
    actorId: String(actorId),
    guildId: String(guildId),
    route: definition.id,
    expectedVersion: String(currentVersion || ""),
    beforeDigest: digest(before),
    nextDigest: digest(next),
    rollbackSnapshot: Object.freeze({ version: String(currentVersion || ""), value: before, digest: digest(before) }),
    value: next,
    requiresExactReadback: true
  });
}

export function verifyFimaBotDashboardReadback(plan, readback = {}) {
  if (!plan || plan.kind !== "dashboard_save_plan") throw dashboardError("dashboard_plan_invalid");
  if (String(readback.guildId || "") !== plan.guildId || readback.route !== plan.route) {
    throw dashboardError("dashboard_readback_scope_mismatch");
  }
  if (digest(readback.value) !== plan.nextDigest) throw dashboardError("dashboard_readback_mismatch");
  return Object.freeze({ verified: true, guildId: plan.guildId, route: plan.route, digest: plan.nextDigest });
}

export function planFimaBotDashboardRollback(plan, reason = "readback_failed") {
  if (!plan || plan.kind !== "dashboard_save_plan" || !plan.rollbackSnapshot) throw dashboardError("dashboard_plan_invalid");
  return Object.freeze({
    kind: "dashboard_rollback_plan",
    guildId: plan.guildId,
    route: plan.route,
    expectedFailedDigest: plan.nextDigest,
    restore: plan.rollbackSnapshot,
    reason: String(reason || "readback_failed").slice(0, 80)
  });
}
