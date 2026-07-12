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
