const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;

function toBigInt(value) {
  try { return BigInt(value ?? 0); } catch { return 0n; }
}

export function canManageParadiseGuild(member = {}) {
  if (member.owner === true) return true;
  const permissions = toBigInt(member.permissions ?? member.permissionBits);
  return (permissions & MANAGE_GUILD) === MANAGE_GUILD || (permissions & ADMINISTRATOR) === ADMINISTRATOR;
}

export function paradiseGuildWorkspaceAccess({ guildId, memberships = [], installedGuildIds = [] } = {}) {
  const id = String(guildId || "");
  const membership = memberships.find(item => String(item.id) === id);
  if (!membership) return Object.freeze({ allowed: false, code: "guild_not_authorized", guildId: id, installed: false });
  if (!canManageParadiseGuild(membership)) return Object.freeze({ allowed: false, code: "manage_guild_required", guildId: id, installed: false });
  const installed = new Set(installedGuildIds.map(String)).has(id);
  return Object.freeze({ allowed: true, code: installed ? "guild_workspace_allowed" : "guild_invite_required", guildId: id, installed });
}

export function assertParadiseGuildWorkspaceAccess(input = {}) {
  const result = paradiseGuildWorkspaceAccess(input);
  if (result.allowed) return result;
  const error = new Error(result.code);
  error.code = result.code;
  error.guildId = result.guildId;
  throw error;
}
