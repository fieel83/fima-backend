export const PARADISE_PERMISSIONS = Object.freeze({
  MEMBER_HELP: "member.help",
  PROFILE_SELF: "profile.self",
  PROFILE_MANAGE: "profile.manage",
  GUILD_CONFIG_WRITE: "guild.config.write",
  GUILD_SETUP_PREVIEW: "guild.setup.preview",
  GUILD_SETUP_REPAIR: "guild.setup.repair",
  GUILD_REBUILD: "guild.rebuild",
  AUDIT_VIEW: "audit.view",
  AUDIT_REPAIR: "audit.repair",
  TICKET_WORK: "ticket.work",
  TICKET_MANAGE: "ticket.manage",
  TICKET_DELETE: "ticket.delete",
  TRAINING_HOST: "training.host",
  TRAINING_MANAGE: "training.manage",
  TRYOUT_HOST: "tryout.host",
  TRYOUT_MANAGE: "tryout.manage",
  REFEREE_WORK: "referee.work",
  REFEREE_APPROVE: "referee.approve",
  MODERATE: "moderation.work",
  SECURITY_MANAGE: "security.manage",
  APPLICATION_REVIEW: "application.review",
  LICENSE_DIAGNOSTICS: "license.diagnostics",
  LICENSE_REPAIR: "license.repair"
});

const ALL = "*";
export const PARADISE_ROLE_PERMISSION_DEFAULTS = Object.freeze({
  owner: [ALL],
  overseer: [PARADISE_PERMISSIONS.REFEREE_APPROVE, PARADISE_PERMISSIONS.AUDIT_VIEW],
  admin: [
    PARADISE_PERMISSIONS.GUILD_CONFIG_WRITE, PARADISE_PERMISSIONS.GUILD_SETUP_PREVIEW,
    PARADISE_PERMISSIONS.GUILD_SETUP_REPAIR, PARADISE_PERMISSIONS.AUDIT_VIEW,
    PARADISE_PERMISSIONS.AUDIT_REPAIR, PARADISE_PERMISSIONS.TICKET_MANAGE, PARADISE_PERMISSIONS.TICKET_DELETE,
    PARADISE_PERMISSIONS.TRAINING_MANAGE, PARADISE_PERMISSIONS.TRYOUT_MANAGE,
    PARADISE_PERMISSIONS.SECURITY_MANAGE, PARADISE_PERMISSIONS.APPLICATION_REVIEW
  ],
  moderator: [PARADISE_PERMISSIONS.MODERATE, PARADISE_PERMISSIONS.TICKET_WORK],
  security_staff: [PARADISE_PERMISSIONS.MODERATE, PARADISE_PERMISSIONS.SECURITY_MANAGE, PARADISE_PERMISSIONS.TICKET_WORK],
  support_staff: [PARADISE_PERMISSIONS.TICKET_WORK, PARADISE_PERMISSIONS.LICENSE_DIAGNOSTICS],
  fima_support: [PARADISE_PERMISSIONS.TICKET_WORK, PARADISE_PERMISSIONS.LICENSE_DIAGNOSTICS],
  training_manager: [PARADISE_PERMISSIONS.TRAINING_MANAGE, PARADISE_PERMISSIONS.TRAINING_HOST],
  training_supervisor: [PARADISE_PERMISSIONS.TRAINING_MANAGE, PARADISE_PERMISSIONS.TRAINING_HOST],
  experienced_training_hoster: [PARADISE_PERMISSIONS.TRAINING_HOST],
  training_hoster: [PARADISE_PERMISSIONS.TRAINING_HOST],
  tryout_manager: [PARADISE_PERMISSIONS.TRYOUT_MANAGE, PARADISE_PERMISSIONS.TRYOUT_HOST],
  experienced_tryout_hoster: [PARADISE_PERMISSIONS.TRYOUT_HOST],
  tryout_hoster: [PARADISE_PERMISSIONS.TRYOUT_HOST],
  referee_manager: [PARADISE_PERMISSIONS.REFEREE_WORK, PARADISE_PERMISSIONS.REFEREE_APPROVE],
  head_referee: [PARADISE_PERMISSIONS.REFEREE_WORK, PARADISE_PERMISSIONS.REFEREE_APPROVE],
  experienced_referee: [PARADISE_PERMISSIONS.REFEREE_WORK, PARADISE_PERMISSIONS.REFEREE_APPROVE],
  referee: [PARADISE_PERMISSIONS.REFEREE_WORK],
  trial_referee: [PARADISE_PERMISSIONS.REFEREE_WORK],
  application_reviewer: [PARADISE_PERMISSIONS.APPLICATION_REVIEW]
});

export const PARADISE_ROLE_MAPPING_KEYS = Object.freeze({
  owner_role: "owner",
  admin_role: "admin",
  overseer_role: "overseer",
  moderator_role: "moderator",
  security_staff_role: "security_staff",
  support_staff_role: "support_staff",
  fima_support_role: "fima_support",
  training_manager_role: "training_manager",
  training_supervisor_role: "training_supervisor",
  experienced_training_hoster_role: "experienced_training_hoster",
  training_hoster_role: "training_hoster",
  tryout_manager_role: "tryout_manager",
  experienced_tryout_hoster_role: "experienced_tryout_hoster",
  tryout_hoster_role: "tryout_hoster",
  referee_manager_role: "referee_manager",
  head_referee_role: "head_referee",
  experienced_referee_role: "experienced_referee",
  referee_role: "referee",
  trial_referee_role: "trial_referee",
  application_reviewer_role: "application_reviewer"
});

function normalizeRoleKey(value) {
  return String(value || "").trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function paradiseRoleKeysForMember({ roleIds = [], roleNames = [], mappings = {} } = {}) {
  const ids = new Set(roleIds.map(value => String(value || "")).filter(Boolean));
  const mapped = Object.entries(mappings || {}).flatMap(([mappingKey, roleId]) =>
    ids.has(String(roleId || "")) && PARADISE_ROLE_MAPPING_KEYS[mappingKey]
      ? [PARADISE_ROLE_MAPPING_KEYS[mappingKey]]
      : []
  );
  return [...new Set([...mapped, ...roleNames.map(normalizeRoleKey).filter(Boolean)])];
}

export function resolveParadisePermissions({ roleKeys = [], isOwner = false, overrides = {} } = {}) {
  if (isOwner) return new Set([ALL]);
  const permissions = new Set();
  for (const rawRole of roleKeys) {
    const role = normalizeRoleKey(rawRole);
    for (const permission of PARADISE_ROLE_PERMISSION_DEFAULTS[role] || []) permissions.add(permission);
    for (const permission of overrides?.[role] || []) permissions.add(String(permission));
  }
  return permissions;
}

export function hasParadisePermission({ permission, roleKeys = [], isOwner = false, overrides = {} } = {}) {
  const resolved = resolveParadisePermissions({ roleKeys, isOwner, overrides });
  return resolved.has(ALL) || resolved.has(String(permission));
}

export function assertParadisePermission(input = {}) {
  if (hasParadisePermission(input)) return true;
  const error = new Error("paradise_permission_denied");
  error.code = "paradise_permission_denied";
  error.permission = input.permission;
  throw error;
}
