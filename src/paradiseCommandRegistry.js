import { hasParadisePermission, PARADISE_PERMISSIONS } from "./paradiseRbac.js";

const PLAN_ORDER = Object.freeze({ free: 0, pro: 1, premium: 2, network: 3 });

const entry = (id, command, options) => Object.freeze({
  id, command, subcommand: null, description: "", templateScope: ["community", "clan", "tsbtr"],
  requiredModule: null, requiredParadisePermission: null, requiredDiscordPermission: null,
  premiumScope: "free", allowedChannels: ["any"], memberSafe: false, parameters: [], autocompleteProvider: null,
  examples: [], commonErrors: [], auditEvent: null, relatedDashboardPage: null, relatedGuideMessage: null,
  ...options
});

export const PARADISE_COMMAND_REGISTRY = Object.freeze([
  entry("CMD-HELP", "help", { description: "Shows only commands the current user can use.", memberSafe: true, examples: ["/help query:profile"], relatedGuideMessage: "public-help" }),
  entry("CMD-PROFILE-CREATE", "profile", { subcommand: "create", description: "Starts verified profile creation.", memberSafe: true, requiredModule: "profiles", examples: ["/profile create"], relatedDashboardPage: "profiles" }),
  entry("CMD-PROFILE-VIEW", "profile", { subcommand: "view", description: "Views a profile by user, ID or Roblox name.", memberSafe: true, requiredModule: "profiles", examples: ["/profile view user:@player"], relatedDashboardPage: "profiles" }),
  entry("CMD-PROFILE-EDIT", "profile", { subcommand: "edit", description: "Edits the caller's verified profile.", memberSafe: true, requiredModule: "profiles", examples: ["/profile edit"], relatedDashboardPage: "profiles" }),
  entry("CMD-AVAILABILITY-PANEL", "availability", { subcommand: "panel", description: "Shows the live availability board.", templateScope: ["clan", "tsbtr"], memberSafe: true, requiredModule: "availability", allowedChannels: ["availability_channel"], examples: ["/availability panel"], relatedDashboardPage: "availability" }),
  entry("CMD-AVAILABILITY-COOLDOWN", "availability", { subcommand: "cooldown", description: "Sets a controlled challenge cooldown.", templateScope: ["clan", "tsbtr"], requiredModule: "availability", requiredParadisePermission: PARADISE_PERMISSIONS.REFEREE_APPROVE, allowedChannels: ["availability_channel"], examples: ["/availability cooldown user:@player hours:24"], auditEvent: "availability_cooldown_set", relatedDashboardPage: "availability" }),
  entry("CMD-AVAILABILITY-IMMUNITY", "availability", { subcommand: "immunity", description: "Sets a controlled challenge immunity.", templateScope: ["clan", "tsbtr"], requiredModule: "availability", requiredParadisePermission: PARADISE_PERMISSIONS.REFEREE_APPROVE, allowedChannels: ["availability_channel"], examples: ["/availability immunity user:@player hours:24"], auditEvent: "availability_immunity_set", relatedDashboardPage: "availability" }),
  entry("CMD-AVAILABILITY-CLEAR", "availability", { subcommand: "clear", description: "Clears a controlled cooldown or immunity.", templateScope: ["clan", "tsbtr"], requiredModule: "availability", requiredParadisePermission: PARADISE_PERMISSIONS.REFEREE_APPROVE, allowedChannels: ["availability_channel"], examples: ["/availability clear user:@player type:cooldown"], auditEvent: "availability_state_cleared", relatedDashboardPage: "availability" }),
  entry("CMD-CHALLENGE-CREATE", "challenge", { subcommand: "create", description: "Creates an eligible challenge ticket.", templateScope: ["clan", "tsbtr"], memberSafe: true, requiredModule: "challenge", allowedChannels: ["challenge_channel"], examples: ["/challenge create opponent:@player"], relatedDashboardPage: "challenge" }),
  entry("CMD-CHALLENGE-RESULT", "challenge", { subcommand: "result", description: "Submits a structured challenge result for review.", templateScope: ["clan", "tsbtr"], requiredModule: "challenge", requiredParadisePermission: PARADISE_PERMISSIONS.REFEREE_WORK, allowedChannels: ["challenge_ticket"], examples: ["/challenge result winner:@player loser:@player score:10-3"], auditEvent: "challenge_result_submitted", relatedGuideMessage: "referee-guide" }),
  entry("CMD-REFEREE-POST", "challenge", { subcommand: "post", description: "Submits a structured challenge score post.", templateScope: ["clan", "tsbtr"], requiredModule: "referee", requiredParadisePermission: PARADISE_PERMISSIONS.REFEREE_WORK, allowedChannels: ["challenge_ticket"], examples: ["/challenge post winner:@player loser:@player score:10-3"], auditEvent: "challenge_score_submitted", relatedGuideMessage: "referee-guide" }),
  entry("CMD-REFEREE-AUTOWIN", "challenge", { subcommand: "autowin", description: "Submits an in-ticket automatic win for review.", templateScope: ["clan", "tsbtr"], requiredModule: "referee", requiredParadisePermission: PARADISE_PERMISSIONS.REFEREE_WORK, allowedChannels: ["challenge_ticket"], examples: ["/challenge autowin winner:@player reason:no-show"], auditEvent: "challenge_autowin_submitted", relatedGuideMessage: "referee-guide" }),
  entry("CMD-CHALLENGE-CLOSE", "challenge", { subcommand: "close", description: "Closes a challenge ticket safely.", templateScope: ["clan", "tsbtr"], requiredModule: "challenge", requiredParadisePermission: PARADISE_PERMISSIONS.REFEREE_APPROVE, allowedChannels: ["challenge_ticket"], examples: ["/challenge close reason:resolved"], auditEvent: "challenge_closed", relatedGuideMessage: "referee-guide" }),
  entry("CMD-TRAINING-START", "training", { subcommand: "start", description: "Posts an active training announcement.", templateScope: ["community", "clan", "tsbtr"], requiredModule: "training", requiredParadisePermission: PARADISE_PERMISSIONS.TRAINING_HOST, allowedChannels: ["training_channel"], examples: ["/training start link:<private-server-link>"], auditEvent: "training_started", relatedGuideMessage: "training-hoster-guide" }),
  entry("CMD-TRAINING-CREATE", "training", { subcommand: "create", description: "Creates an active training announcement.", templateScope: ["community", "clan", "tsbtr"], requiredModule: "training", requiredParadisePermission: PARADISE_PERMISSIONS.TRAINING_HOST, allowedChannels: ["training_channel"], examples: ["/training create link:<private-server-link>"], auditEvent: "training_started", relatedGuideMessage: "training-hoster-guide" }),
  entry("CMD-TRAINING-RESULT", "training", { subcommand: "result", description: "Posts an authorized training result.", templateScope: ["community", "clan", "tsbtr"], requiredModule: "training", requiredParadisePermission: PARADISE_PERMISSIONS.TRAINING_HOST, allowedChannels: ["training_results_channel"], examples: ["/training result score:3-1 winner:Red"], auditEvent: "training_result_submitted", relatedGuideMessage: "training-hoster-guide" }),
  entry("CMD-TRYOUT-START", "tryout", { subcommand: "start", description: "Posts an active tryout announcement.", templateScope: ["clan", "tsbtr"], requiredModule: "tryout", requiredParadisePermission: PARADISE_PERMISSIONS.TRYOUT_HOST, allowedChannels: ["tryout_channel"], examples: ["/tryout start link:<private-server-link>"], auditEvent: "tryout_started", relatedGuideMessage: "tryout-hoster-guide" }),
  entry("CMD-TRYOUT-RESULT", "tryout", { subcommand: "result", description: "Submits an authorized tryout result.", templateScope: ["clan", "tsbtr"], requiredModule: "tryout", requiredParadisePermission: PARADISE_PERMISSIONS.TRYOUT_HOST, allowedChannels: ["tryout_results_channel"], examples: ["/tryout result user:@player stage:2 level:High strength:Strong"], auditEvent: "tryout_result_submitted", relatedGuideMessage: "tryout-hoster-guide" }),
  entry("CMD-REFEREE-GUIDE", "referee", { description: "Shows referee operations permitted by the selected template.", templateScope: ["clan", "tsbtr"], requiredModule: "referee", requiredParadisePermission: PARADISE_PERMISSIONS.REFEREE_WORK, examples: ["/referee works"], relatedGuideMessage: "referee-guide" }),
  entry("CMD-LEADERBOARD-ADD", "leaderboard", { subcommand: "add", description: "Adds a profile to a leaderboard position.", templateScope: ["clan", "tsbtr"], requiredModule: "leaderboard", requiredParadisePermission: PARADISE_PERMISSIONS.PROFILE_MANAGE, examples: ["/leaderboard add user:@player rank:25"], auditEvent: "leaderboard_added", relatedDashboardPage: "leaderboard", relatedGuideMessage: "leaderboard-guide" }),
  entry("CMD-LINEUP-ADD", "lineup", { subcommand: "add", description: "Adds a member to a configured lineup board.", templateScope: ["clan"], requiredModule: "lineups", requiredParadisePermission: PARADISE_PERMISSIONS.GUILD_CONFIG_WRITE, examples: ["/lineup add board:main user:@player"], auditEvent: "lineup_updated", relatedDashboardPage: "roster" }),
  entry("CMD-ROSTER", "roster", { description: "Manages the competitive roster board.", templateScope: ["clan"], requiredModule: "roster", requiredParadisePermission: PARADISE_PERMISSIONS.GUILD_CONFIG_WRITE, examples: ["/roster panel"], auditEvent: "roster_updated", relatedDashboardPage: "roster" }),
  entry("CMD-SETUP", "setupfieels", { description: "Opens the safe template selector.", requiredModule: "setup", requiredParadisePermission: PARADISE_PERMISSIONS.GUILD_SETUP_PREVIEW, examples: ["/setupfieels"], auditEvent: "setup_preview_opened", relatedDashboardPage: "setup", relatedGuideMessage: "owner-admin-guide" }),
  entry("CMD-FIMA-LICENSE-CHECK", "fima_license_check", { description: "Shows masked license diagnostics to authorized support staff.", templateScope: ["community"], requiredModule: "fima_support", requiredParadisePermission: PARADISE_PERMISSIONS.LICENSE_DIAGNOSTICS, examples: ["/fima_license_check user:@buyer"], auditEvent: "license_diagnostics_viewed", relatedGuideMessage: "fima-support-guide" }),
  entry("CMD-FIMA-LICENSE-REPAIR", "fima_license_repair", { description: "Creates a safe paid-license repair task for owner/admin approval.", templateScope: ["community"], requiredModule: "fima_support", requiredParadisePermission: PARADISE_PERMISSIONS.LICENSE_REPAIR, premiumScope: "premium", examples: ["/fima_license_repair license_id:<masked-id>"], auditEvent: "license_repair_requested", relatedGuideMessage: "fima-support-guide" })
]);

function isPlanAllowed(required, current) {
  return (PLAN_ORDER[String(current || "free").toLowerCase()] ?? -1) >= (PLAN_ORDER[required] ?? Number.MAX_SAFE_INTEGER);
}

export function commandRegistryEntry(command, subcommand = null) {
  return PARADISE_COMMAND_REGISTRY.find(item => item.command === command && item.subcommand === subcommand) || null;
}

export function commandRegistryEntries(command) {
  return PARADISE_COMMAND_REGISTRY.filter(item => item.command === command);
}

export function inferParadiseTemplate({ configuredTemplate = null, guildName = "" } = {}) {
  if (["community", "clan", "tsbtr"].includes(configuredTemplate)) return configuredTemplate;
  if (/fieel'?s community/i.test(String(guildName || ""))) return "community";
  if (/tsbtr|yedek/i.test(String(guildName || ""))) return "tsbtr";
  return "clan";
}

export function enabledParadiseModules(config = {}) {
  if (Array.isArray(config.enabledModules)) return [...new Set(config.enabledModules.filter(Boolean))];
  if (config.modules && typeof config.modules === "object") {
    return Object.entries(config.modules).filter(([, enabled]) => enabled !== false).map(([module]) => module);
  }
  return null;
}

export function paradiseCommandChannelContext({ config = {}, command, subcommand = null, channelId } = {}) {
  const targetChannelId = String(channelId || "");
  const channelMappings = config.channelMappings && typeof config.channelMappings === "object" ? config.channelMappings : {};
  const commandChannels = Array.isArray(config.commandChannels?.[command]) ? config.commandChannels[command].map(String) : [];
  const entry = commandRegistryEntry(command, subcommand);
  const configuredEntryMappings = entry?.allowedChannels?.includes("any")
    ? []
    : entry?.allowedChannels?.filter(key => channelMappings[key]) || [];
  const channelKeys = Object.entries(channelMappings)
    .filter(([, mappedId]) => String(mappedId || "") === targetChannelId)
    .map(([key]) => key);
  if (commandChannels.includes(targetChannelId)) channelKeys.push("command_channel");
  return Object.freeze({
    channelKeys: [...new Set(channelKeys)],
    channelConstraintConfigured: Boolean(commandChannels.length || configuredEntryMappings.length)
  });
}

export function paradiseCommandRegistrationAllowed({ command, template } = {}) {
  const entries = commandRegistryEntries(command);
  if (!entries.length) return Object.freeze({ known: false, allowed: true, code: "legacy_command" });
  return Object.freeze({
    known: true,
    allowed: entries.some(item => item.templateScope.includes(template)),
    code: entries.some(item => item.templateScope.includes(template)) ? "command_registered_for_template" : "command_not_registered_for_template"
  });
}

export function paradiseCommandAccess({ command, subcommand = null, template, enabledModules = null, plan = "free", roleKeys = [], isOwner = false, channelKey = "any", channelKeys = null, channelConstraintConfigured = true } = {}) {
  const item = commandRegistryEntry(command, subcommand);
  if (!item) return Object.freeze({ allowed: false, code: "command_not_registered", entry: null });
  if (!item.templateScope.includes(template)) return Object.freeze({ allowed: false, code: "command_not_available_for_template", entry: item });
  if (enabledModules && !enabledModules.includes(item.requiredModule)) return Object.freeze({ allowed: false, code: "command_module_disabled", entry: item });
  if (!isPlanAllowed(item.premiumScope, plan) && !isOwner) return Object.freeze({ allowed: false, code: "command_plan_required", entry: item });
  const actualChannelKeys = channelKeys || [channelKey];
  if (channelConstraintConfigured && !item.allowedChannels.includes("any") && !actualChannelKeys.some(key => item.allowedChannels.includes(key))) {
    return Object.freeze({ allowed: false, code: "command_wrong_channel", entry: item });
  }
  if (item.requiredParadisePermission && !hasParadisePermission({ permission: item.requiredParadisePermission, roleKeys, isOwner })) {
    return Object.freeze({ allowed: false, code: "command_permission_denied", entry: item });
  }
  return Object.freeze({ allowed: true, code: "command_allowed", entry: item });
}

export function visibleParadiseCommands(context = {}) {
  return PARADISE_COMMAND_REGISTRY.filter(item => paradiseCommandAccess({ ...context, command: item.command, subcommand: item.subcommand }).allowed);
}
