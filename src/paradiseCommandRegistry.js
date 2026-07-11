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
  entry("CMD-TICKET-OPEN", "ticket", { subcommand: "open", description: "Opens a member support ticket.", memberSafe: true, requiredModule: "tickets", allowedChannels: ["support"], examples: ["/ticket open"], relatedDashboardPage: "tickets" }),
  entry("CMD-AVAILABILITY", "availability", { subcommand: "set", description: "Sets personal availability or LOA status.", templateScope: ["clan", "tsbtr"], memberSafe: true, requiredModule: "availability", examples: ["/availability set status:available"], relatedDashboardPage: "availability" }),
  entry("CMD-CHALLENGE-CREATE", "challenge", { subcommand: "create", description: "Creates an eligible challenge ticket.", templateScope: ["clan", "tsbtr"], memberSafe: true, requiredModule: "challenge", allowedChannels: ["challenge_hub"], examples: ["/challenge create opponent:@player"], relatedDashboardPage: "challenge" }),
  entry("CMD-TRAINING-START", "training", { subcommand: "start", description: "Posts an active training announcement.", templateScope: ["community", "clan", "tsbtr"], requiredModule: "training", requiredParadisePermission: PARADISE_PERMISSIONS.TRAINING_HOST, allowedChannels: ["sessions"], examples: ["/training start link:<private-server-link>"], auditEvent: "training_started", relatedGuideMessage: "training-hoster-guide" }),
  entry("CMD-TRYOUT-START", "tryout", { subcommand: "start", description: "Posts an active tryout announcement.", templateScope: ["clan", "tsbtr"], requiredModule: "tryout", requiredParadisePermission: PARADISE_PERMISSIONS.TRYOUT_HOST, allowedChannels: ["sessions"], examples: ["/tryout start link:<private-server-link>"], auditEvent: "tryout_started", relatedGuideMessage: "tryout-hoster-guide" }),
  entry("CMD-REFEREE-POST", "post", { description: "Previews or submits a structured challenge score post.", templateScope: ["tsbtr"], requiredModule: "referee", requiredParadisePermission: PARADISE_PERMISSIONS.REFEREE_WORK, allowedChannels: ["challenge_ticket"], examples: ["/post winner_profile:101 loser_profile:102 total_score:10-3"], auditEvent: "challenge_score_submitted", relatedGuideMessage: "referee-guide" }),
  entry("CMD-REFEREE-APPROVE", "post", { subcommand: "approve", description: "Approves a pending score post if policy permits.", templateScope: ["tsbtr"], requiredModule: "referee", requiredParadisePermission: PARADISE_PERMISSIONS.REFEREE_APPROVE, allowedChannels: ["challenge_ticket"], examples: ["/post approve id:<pending-result>"], auditEvent: "challenge_score_approved", relatedGuideMessage: "referee-guide" }),
  entry("CMD-LEADERBOARD-ADD", "leaderboard", { subcommand: "add", description: "Adds a profile to a leaderboard position.", templateScope: ["clan", "tsbtr"], requiredModule: "leaderboard", requiredParadisePermission: PARADISE_PERMISSIONS.PROFILE_MANAGE, examples: ["/leaderboard add user:@player rank:25"], auditEvent: "leaderboard_added", relatedDashboardPage: "leaderboard", relatedGuideMessage: "leaderboard-guide" }),
  entry("CMD-LINEUP-ADD", "lineup", { subcommand: "add", description: "Adds a member to a configured lineup board.", templateScope: ["clan"], requiredModule: "lineups", requiredParadisePermission: PARADISE_PERMISSIONS.GUILD_CONFIG_WRITE, examples: ["/lineup add board:main user:@player"], auditEvent: "lineup_updated", relatedDashboardPage: "roster" }),
  entry("CMD-TICKET-CLOSE", "ticket", { subcommand: "close", description: "Closes a ticket using the shared state machine.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_WORK, allowedChannels: ["ticket"], examples: ["/ticket close"], auditEvent: "ticket_closed", relatedGuideMessage: "ticket-guide" }),
  entry("CMD-TICKET-DELETE", "ticket", { subcommand: "delete", description: "Deletes a closed ticket after transcript-first confirmation.", requiredModule: "tickets", requiredParadisePermission: PARADISE_PERMISSIONS.TICKET_DELETE, allowedChannels: ["ticket"], examples: ["/ticket delete"], auditEvent: "ticket_delete_requested", relatedGuideMessage: "ticket-guide" }),
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

export function paradiseCommandAccess({ command, subcommand = null, template, enabledModules = null, plan = "free", roleKeys = [], isOwner = false, channelKey = "any" } = {}) {
  const item = commandRegistryEntry(command, subcommand);
  if (!item) return Object.freeze({ allowed: false, code: "command_not_registered", entry: null });
  if (!item.templateScope.includes(template)) return Object.freeze({ allowed: false, code: "command_not_available_for_template", entry: item });
  if (enabledModules && !enabledModules.includes(item.requiredModule)) return Object.freeze({ allowed: false, code: "command_module_disabled", entry: item });
  if (!isPlanAllowed(item.premiumScope, plan) && !isOwner) return Object.freeze({ allowed: false, code: "command_plan_required", entry: item });
  if (!item.allowedChannels.includes("any") && !item.allowedChannels.includes(channelKey)) return Object.freeze({ allowed: false, code: "command_wrong_channel", entry: item });
  if (item.requiredParadisePermission && !hasParadisePermission({ permission: item.requiredParadisePermission, roleKeys, isOwner })) {
    return Object.freeze({ allowed: false, code: "command_permission_denied", entry: item });
  }
  return Object.freeze({ allowed: true, code: "command_allowed", entry: item });
}

export function visibleParadiseCommands(context = {}) {
  return PARADISE_COMMAND_REGISTRY.filter(item => paradiseCommandAccess({ ...context, command: item.command, subcommand: item.subcommand }).allowed);
}
