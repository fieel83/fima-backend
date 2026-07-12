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
  entry("CMD-TICKET-OPEN", "ticket", { subcommand: "open", description: "Opens one private support ticket.", memberSafe: true, requiredModule: "tickets", examples: ["/ticket open"], relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-INFO", "ticket", { subcommand: "info", description: "Shows safe status for the current ticket.", memberSafe: true, requiredModule: "tickets", examples: ["/ticket info"], relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-CLAIM", "ticket", { subcommand: "claim", description: "Claims the current support ticket.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_WORK, examples: ["/ticket claim"], auditEvent: "support_ticket_claimed", relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-UNCLAIM", "ticket", { subcommand: "unclaim", description: "Releases a claimed support ticket.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_WORK, examples: ["/ticket unclaim"], auditEvent: "support_ticket_unclaimed", relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-CLOSE", "ticket", { subcommand: "close", description: "Closes the ticket after a transcript is saved.", requiredModule: "tickets", examples: ["/ticket close"], auditEvent: "support_ticket_closed", relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-REOPEN", "ticket", { subcommand: "reopen", description: "Reopens a closed support ticket.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_WORK, examples: ["/ticket reopen"], auditEvent: "support_ticket_reopened", relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-DELETE", "ticket", { subcommand: "delete", description: "Starts the transcript-first deletion flow.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_DELETE, examples: ["/ticket delete"], auditEvent: "support_ticket_deleted", relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-MANAGE", "ticket", { subcommand: "rename", description: "Renames a support ticket safely.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_MANAGE, examples: ["/ticket rename name:support-member"], auditEvent: "support_ticket_renamed", relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-ADD", "ticket", { subcommand: "add", description: "Adds a member to a support ticket.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_MANAGE, examples: ["/ticket add user:@member"], auditEvent: "support_ticket_member_added", relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-REMOVE", "ticket", { subcommand: "remove", description: "Removes a member from a support ticket.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_MANAGE, examples: ["/ticket remove user:@member"], auditEvent: "support_ticket_member_removed", relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-ESCALATE", "ticket", { subcommand: "escalate", description: "Escalates a support ticket with a safe note.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_WORK, examples: ["/ticket escalate note:payment review"], auditEvent: "support_ticket_escalated", relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-TRANSCRIPT", "ticket", { subcommand: "transcript", description: "Saves a redacted manual transcript.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_WORK, examples: ["/ticket transcript"], auditEvent: "support_ticket_transcript_saved", relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-PANEL", "ticket", { subcommand: "panel", description: "Posts the configured support entry panel.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_MANAGE, examples: ["/ticket panel"], auditEvent: "support_ticket_panel_updated", relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-CONFIG", "ticket", { subcommand: "config", description: "Opens the safe ticket configuration route.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_MANAGE, examples: ["/ticket config"], relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-REPAIR", "ticket", { subcommand: "repair", description: "Repairs the canonical ticket header in place.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_MANAGE, examples: ["/ticket repair"], auditEvent: "support_ticket_repaired", relatedDashboardPage: "tickets", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-LOGS", "ticket", { subcommand: "logs", description: "Shows safe ticket lifecycle metadata.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_WORK, examples: ["/ticket logs"], relatedDashboardPage: "logs", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-PROFILE-CREATE", "profile", { subcommand: "create", description: "Starts verified profile creation.", memberSafe: true, requiredModule: "profiles", examples: ["/profile create"], relatedDashboardPage: "profiles" }),
  entry("CMD-PROFILE-VIEW", "profile", { subcommand: "view", description: "Views a profile by user, ID or Roblox name.", memberSafe: true, requiredModule: "profiles", examples: ["/profile view user:@player"], relatedDashboardPage: "profiles" }),
  entry("CMD-PROFILE-EDIT", "profile", { subcommand: "edit", description: "Edits the caller's verified profile.", memberSafe: true, requiredModule: "profiles", examples: ["/profile edit"], relatedDashboardPage: "profiles" }),
  entry("CMD-PROFILE-PRIVACY", "profile", { subcommand: "privacy", description: "Sets guild-local profile visibility.", memberSafe: true, requiredModule: "profiles", examples: ["/profile privacy visibility:private"], relatedDashboardPage: "profiles" }),
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
  entry("CMD-MOD-WARN", "mod", { subcommand: "warn", description: "Records a proportionate staff warning.", requiredModule: "moderation", requiredParadisePermission: PARADISE_PERMISSIONS.MODERATE, examples: ["/mod warn user:@member reason:spam"], auditEvent: "moderation_warned", relatedGuideMessage: "mod-command-guide" }),
  entry("CMD-MOD-MUTE", "mod", { subcommand: "mute", description: "Applies a configured timeout with an audit record.", requiredModule: "moderation", requiredParadisePermission: PARADISE_PERMISSIONS.MODERATE, examples: ["/mod mute user:@member preset:spam reason:repeat spam"], auditEvent: "moderation_timed_out", relatedGuideMessage: "mod-command-guide" }),
  entry("CMD-MOD-PURGE", "mod", { subcommand: "purge", description: "Deletes a bounded batch of recent messages with an audit record.", requiredModule: "moderation", requiredParadisePermission: PARADISE_PERMISSIONS.MODERATE, requiredDiscordPermission: "ManageMessages", examples: ["/mod purge amount:25"], auditEvent: "moderation_messages_purged", relatedGuideMessage: "mod-command-guide" }),
  entry("CMD-MOD-SLOWMODE", "mod", { subcommand: "slowmode", description: "Sets a reviewed channel slowmode.", requiredModule: "moderation", requiredParadisePermission: PARADISE_PERMISSIONS.MODERATE, examples: ["/mod slowmode seconds:10"], auditEvent: "moderation_slowmode_changed", relatedGuideMessage: "mod-command-guide" }),
  entry("CMD-MOD-CASE-REVIEW", "mod", { subcommand: "case-revoke", description: "Preserves audit history while revoking a reviewed case.", requiredModule: "moderation", requiredParadisePermission: PARADISE_PERMISSIONS.MODERATE, examples: ["/mod case-revoke id:abcd1234 reason:reviewed"], auditEvent: "moderation_case_revoked", relatedGuideMessage: "mod-command-guide" }),
  entry("CMD-CHANNEL-LOCK", "channel", { subcommand: "lock", description: "Locks the current channel through a logged senior moderation action.", requiredModule: "moderation", requiredParadisePermission: PARADISE_PERMISSIONS.MODERATE, examples: ["/channel lock"], auditEvent: "channel_locked", relatedGuideMessage: "mod-command-guide" }),
  entry("CMD-APPLICATION-REVIEW", "application", { subcommand: "panel", description: "Posts or refreshes the configured application entry panel.", requiredModule: "applications", requiredParadisePermission: PARADISE_PERMISSIONS.APPLICATION_REVIEW, examples: ["/application panel"], auditEvent: "application_panel_updated", relatedGuideMessage: "application-guide" }),
  entry("CMD-APPLICATION-APPLY", "application", { subcommand: "apply", description: "Starts a template-appropriate application form.", memberSafe: true, requiredModule: "applications", examples: ["/application apply type:support"], relatedDashboardPage: "applications", relatedGuideMessage: "application-guide" }),
  entry("CMD-APPLICATION-STATUS", "application", { subcommand: "status", description: "Shows the caller's latest private application state.", memberSafe: true, requiredModule: "applications", examples: ["/application status"], relatedDashboardPage: "applications", relatedGuideMessage: "application-guide" }),
  entry("CMD-APPLICATION-CONTINUE", "application", { subcommand: "continue", description: "Returns a staff-requested clarification to the same review queue.", memberSafe: true, requiredModule: "applications", examples: ["/application continue"], auditEvent: "application_clarification_submitted", relatedDashboardPage: "applications", relatedGuideMessage: "application-guide" }),
  entry("CMD-LEADERBOARD-ADD", "leaderboard", { subcommand: "add", description: "Adds a profile to a leaderboard position.", templateScope: ["clan", "tsbtr"], requiredModule: "leaderboard", requiredParadisePermission: PARADISE_PERMISSIONS.PROFILE_MANAGE, examples: ["/leaderboard add user:@player rank:25"], auditEvent: "leaderboard_added", relatedDashboardPage: "leaderboard", relatedGuideMessage: "leaderboard-guide" }),
  entry("CMD-LINEUP-ADD", "lineup", { subcommand: "add", description: "Adds a member to a configured lineup board.", templateScope: ["clan"], requiredModule: "lineups", requiredParadisePermission: PARADISE_PERMISSIONS.GUILD_CONFIG_WRITE, examples: ["/lineup add board:main user:@player"], auditEvent: "lineup_updated", relatedDashboardPage: "roster" }),
  entry("CMD-ROSTER", "roster", { description: "Manages the competitive roster board.", templateScope: ["clan"], requiredModule: "roster", requiredParadisePermission: PARADISE_PERMISSIONS.GUILD_CONFIG_WRITE, examples: ["/roster panel"], auditEvent: "roster_updated", relatedDashboardPage: "roster" }),
  entry("CMD-SPAR-REQUEST", "spar", { subcommand: "request", description: "Creates an audited clan spar request.", templateScope: ["clan"], requiredModule: "war", requiredParadisePermission: PARADISE_PERMISSIONS.GUILD_CONFIG_WRITE, examples: ["/spar request opponent:Clan format:5v5 FT3"], auditEvent: "spar_requested", relatedDashboardPage: "roster" }),
  entry("CMD-WAR-CREATE", "war", { subcommand: "create", description: "Creates an auditable clan war record.", templateScope: ["clan"], requiredModule: "war", requiredParadisePermission: PARADISE_PERMISSIONS.GUILD_CONFIG_WRITE, examples: ["/war create opponent:Clan format:5v5 FT3"], auditEvent: "war_created", relatedDashboardPage: "roster" }),
  entry("CMD-WAR-RESULT", "war", { subcommand: "result", description: "Closes a war only with an HTTPS evidence link.", templateScope: ["clan"], requiredModule: "war", requiredParadisePermission: PARADISE_PERMISSIONS.GUILD_CONFIG_WRITE, examples: ["/war result id:abcd1234 winner:paradise proof:https://discord.com/channels/..."], auditEvent: "war_completed", relatedDashboardPage: "roster" }),
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

// Public /help is intentionally member-safe only.  The private staff guide
// consumes this separate view so hiding a command in Discord UI is never the
// authorization boundary; paradiseCommandAccess still runs at interaction time.
export function visibleParadiseStaffCommands(context = {}) {
  return visibleParadiseCommands({ ...context, channelConstraintConfigured: false }).filter(item => !item.memberSafe);
}
