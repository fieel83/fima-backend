const ROUTES = Object.freeze([
  ["overview", "Overview"], ["modules", "Modules"], ["setup", "Setup Wizard"],
  ["channels", "Channels"], ["roles", "Roles & Permissions"], ["welcome", "Welcome & Roles"],
  ["profiles", "Profiles"], ["leaderboards", "Leaderboards"], ["challenge", "Challenge System"],
  ["availability", "Availability & LOA"], ["sessions", "Training / Tryout"], ["applications", "Applications"],
  ["tickets", "Tickets"], ["moderation", "Moderation"], ["security", "Security / AutoMod"],
  ["levels", "XP / Levels"], ["voice", "Join-to-Create"], ["events", "Events / Daily Question"],
  ["social", "Social Notifications"], ["ai", "AI Assistant"], ["commands", "Custom Commands / Auto Responder"],
  ["branding", "Branding"], ["logs", "Logs / Transcripts"], ["premium", "Premium / Billing"], ["audit", "Audit History"]
].map(([id, title]) => Object.freeze({ id, title })));

export const PARADISE_CUSTOMER_WORKSPACE_ROUTES = ROUTES;

const CONFIG_KEYS_BY_ROUTE = Object.freeze({
  overview: ["activeSetupMode", "brandColor", "language", "dashboardTheme"],
  modules: ["modules", "enabledModules"],
  setup: ["activeSetupMode", "channelMappings", "roleMappings"],
  channels: ["channelMappings"],
  roles: ["roleMappings"],
  welcome: ["welcome", "leave", "rolePanels"],
  profiles: ["verification"],
  leaderboards: ["leaderboard", "roster"],
  challenge: ["challenge", "operations"],
  availability: ["loa", "operations"],
  sessions: ["staffOperations", "activity"],
  applications: ["applicationSettings"],
  tickets: ["operations", "channelMappings"],
  moderation: ["moderationSettings"],
  security: ["automod", "blacklist"],
  levels: ["xpSettings"],
  voice: ["voiceSettings"],
  events: ["eventSettings"],
  social: ["socialSettings"],
  ai: ["aiSettings"],
  commands: ["commandVisibility", "commandChannels"],
  branding: ["brandColor", "dashboardTheme", "messageDensity", "separatorStyle", "footerStyle", "language"],
  logs: ["channelMappings", "operations"],
  premium: ["plan"],
  audit: []
});

const cloneSafe = value => value && typeof value === "object" ? structuredClone(value) : value;

const DISCORD_ID = /^\d{16,22}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const SAFE_SETTING_KEY = /^[a-z][a-z0-9_]{0,48}$/;
const BLOCKED_SETTING_KEY = /(secret|token|password|cookie|license.?key|hwid|webhook|authorization|owner|billing|stripe)/i;
const CUSTOMER_MODULES = new Set([
  "welcome", "roles", "tickets", "applications", "levels", "voice", "security",
  "sessions", "profiles", "leaderboards", "challenge", "availability", "social", "ai"
]);

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function workspaceError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function boolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function boundedInteger(value, { min = 0, max = 100, fallback = min } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(numeric)));
}

function safeDiscordMappings(value, code) {
  if (!plainObject(value)) throw workspaceError(code);
  const entries = Object.entries(value);
  if (entries.length > 100) throw workspaceError(code);
  const mappings = {};
  for (const [key, id] of entries) {
    if (!SAFE_SETTING_KEY.test(key) || BLOCKED_SETTING_KEY.test(key) || !DISCORD_ID.test(String(id || ""))) {
      throw workspaceError(code);
    }
    mappings[key] = String(id);
  }
  return mappings;
}

function safeToggleMap(value, code) {
  if (!plainObject(value)) throw workspaceError(code);
  const entries = Object.entries(value);
  if (entries.length > CUSTOMER_MODULES.size) throw workspaceError(code);
  const result = {};
  for (const [key, enabled] of entries) {
    if (!CUSTOMER_MODULES.has(key) || typeof enabled !== "boolean") throw workspaceError(code);
    result[key] = enabled;
  }
  return result;
}

function safeOptions(value, allowed, code) {
  if (!plainObject(value)) throw workspaceError(code);
  const result = {};
  for (const [key, definition] of Object.entries(allowed)) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const candidate = value[key];
    if (definition.type === "boolean") {
      if (typeof candidate !== "boolean") throw workspaceError(code);
      result[key] = candidate;
    } else if (definition.type === "integer") {
      result[key] = boundedInteger(candidate, definition);
    } else if (definition.type === "enum") {
      if (!definition.values.includes(candidate)) throw workspaceError(code);
      result[key] = candidate;
    }
  }
  if (Object.keys(result).length !== Object.keys(value).length) throw workspaceError(code);
  return result;
}

// Customer workspaces accept a deliberately small, non-secret configuration
// surface. Owner-console operations, billing, feature flags and provider data
// are never accepted here, even when a user manages the guild in Discord.
export function normalizeParadiseCustomerWorkspacePatch({ route, value } = {}) {
  const selectedRoute = normalizeParadiseWorkspaceRoute(route);
  if (!plainObject(value)) throw workspaceError("invalid_workspace_patch");

  if (selectedRoute === "overview") {
    return {
      route: selectedRoute,
      patch: safeOptions(value, {
        activeSetupMode: { type: "enum", values: ["community", "clan", "tsbtr"] },
        language: { type: "enum", values: ["tr", "en"] },
        dashboardTheme: { type: "enum", values: ["paradise", "charcoal", "midnight"] }
      }, "invalid_workspace_overview")
    };
  }
  if (selectedRoute === "branding") {
    const { brandColor, ...brandingOptions } = value;
    const patch = safeOptions(brandingOptions, {
      dashboardTheme: { type: "enum", values: ["paradise", "charcoal", "midnight"] },
      messageDensity: { type: "enum", values: ["compact", "comfortable"] },
      separatorStyle: { type: "enum", values: ["classic", "sharp", "elegant"] },
      footerStyle: { type: "enum", values: ["important_only", "disabled"] },
      language: { type: "enum", values: ["tr", "en"] }
    }, "invalid_workspace_branding");
    if (Object.prototype.hasOwnProperty.call(value, "brandColor")) {
      if (!HEX_COLOR.test(String(brandColor || ""))) throw workspaceError("invalid_brand_color");
      patch.brandColor = String(brandColor).toUpperCase();
    }
    return { route: selectedRoute, patch };
  }
  if (selectedRoute === "modules") {
    return { route: selectedRoute, patch: { modules: safeToggleMap(value.modules, "invalid_workspace_modules") } };
  }
  if (selectedRoute === "channels") {
    return { route: selectedRoute, patch: { channelMappings: safeDiscordMappings(value.channelMappings, "invalid_channel_mappings") } };
  }
  if (selectedRoute === "roles") {
    return { route: selectedRoute, patch: { roleMappings: safeDiscordMappings(value.roleMappings, "invalid_role_mappings") } };
  }

  const optionRoutes = {
    welcome: ["welcome", { enabled: { type: "boolean" }, mentionMember: { type: "boolean" }, showMemberCount: { type: "boolean" } }],
    tickets: ["ticketSettings", { enabled: { type: "boolean" }, claimEnabled: { type: "boolean" }, autoTranscript: { type: "boolean" }, deleteDelayMinutes: { type: "integer", min: 0, max: 10080, fallback: 5 } }],
    sessions: ["sessionSettings", { trainingEnabled: { type: "boolean" }, tryoutEnabled: { type: "boolean" }, resultApprovalRequired: { type: "boolean" } }],
    applications: ["applicationSettings", { enabled: { type: "boolean" }, membershipRequired: { type: "boolean" }, cooldownDays: { type: "integer", min: 0, max: 365, fallback: 0 } }],
    levels: ["xpSettings", { enabled: { type: "boolean" }, chatXp: { type: "integer", min: 1, max: 100, fallback: 10 }, chatCooldownSeconds: { type: "integer", min: 15, max: 3600, fallback: 60 } }],
    voice: ["voiceSettings", { enabled: { type: "boolean" }, defaultLimit: { type: "integer", min: 0, max: 99, fallback: 0 }, autoDelete: { type: "boolean" }, safeNames: { type: "boolean" } }],
    security: ["automod", { enabled: { type: "boolean" }, blockInvites: { type: "boolean" }, blockScamKeywords: { type: "boolean" }, mentionSpamLimit: { type: "integer", min: 3, max: 50, fallback: 8 } }],
    social: ["socialSettings", { enabled: { type: "boolean" }, delaySeconds: { type: "integer", min: 0, max: 3600, fallback: 60 } }],
    ai: ["aiSettings", { enabled: { type: "boolean" }, ticketAssistant: { type: "boolean" }, communityAssistant: { type: "boolean" } }]
  };
  const definition = optionRoutes[selectedRoute];
  if (!definition) throw workspaceError("workspace_route_read_only");
  const [key, allowed] = definition;
  return { route: selectedRoute, patch: { [key]: safeOptions(value, allowed, `invalid_workspace_${selectedRoute}`) } };
}

export function applyParadiseCustomerWorkspacePatch(config = {}, normalizedPatch = {}) {
  if (!plainObject(config) || !plainObject(normalizedPatch?.patch)) throw workspaceError("invalid_workspace_patch");
  const next = structuredClone(config);
  for (const [key, value] of Object.entries(normalizedPatch.patch)) {
    if (key === "channelMappings" || key === "roleMappings" || key === "modules") {
      next[key] = { ...(next[key] || {}), ...value };
    } else if (plainObject(value)) {
      next[key] = { ...(next[key] || {}), ...value };
    } else {
      next[key] = value;
    }
  }
  next.customerWorkspaceVersion = Math.max(0, Number(next.customerWorkspaceVersion) || 0) + 1;
  return next;
}

export function normalizeParadiseWorkspaceRoute(route = "overview") {
  const normalized = String(route || "overview").trim().toLowerCase();
  return ROUTES.some(item => item.id === normalized) ? normalized : "overview";
}

export function customerWorkspaceConfigView(config = {}, route = "overview") {
  const selectedRoute = normalizeParadiseWorkspaceRoute(route);
  const keys = CONFIG_KEYS_BY_ROUTE[selectedRoute] || [];
  return Object.fromEntries(keys
    .filter(key => Object.prototype.hasOwnProperty.call(config || {}, key))
    .map(key => [key, cloneSafe(config[key])]));
}

export function buildParadiseCustomerWorkspaceView({ card, config = {}, route = "overview" } = {}) {
  if (!card?.guildId) {
    const error = new Error("workspace_card_required");
    error.code = "workspace_card_required";
    throw error;
  }
  const selectedRoute = normalizeParadiseWorkspaceRoute(route);
  return Object.freeze({
    workspace: {
      guildId: String(card.guildId),
      name: String(card.name || "Unnamed server"),
      iconHash: card.iconHash || null,
      botInstalled: card.botInstalled === true,
      canManage: card.canManage === true,
      activePlan: String(card.activePlan || "free"),
      activeTemplate: card.activeTemplate || null,
      lastSuccessfulSyncAt: card.lastSuccessfulSyncAt || null
    },
    route: selectedRoute,
    routes: ROUTES,
    config: card.botInstalled ? customerWorkspaceConfigView(config, selectedRoute) : {},
    inviteRequired: card.botInstalled !== true
  });
}
