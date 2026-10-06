import { PermissionFlagsBits } from "discord.js";

export const COMMUNITY_LEVEL_ROLES = Object.freeze([
  { name: "Level 5", xp: 1250 },
  { name: "Level 10", xp: 5000 },
  { name: "Level 20", xp: 20000 },
  { name: "Level 30", xp: 45000 },
  { name: "Level 50", xp: 125000 }
]);

export function communityActivityRoleTargets(boards, totals) {
  const targets = new Map();
  for (const board of ["text", "voice"]) {
    for (let rank = 1; rank <= 3; rank++) {
      const name = `${board === "text" ? "Text" : "Voice"} Top ${rank}`;
      targets.set(name, new Set((boards[board]?.entries || [])
        .filter(entry => entry.rank === rank && entry.xp > 0).map(entry => entry.discordUserId)));
    }
  }
  for (const tier of COMMUNITY_LEVEL_ROLES) targets.set(tier.name, new Set());
  for (const total of totals) {
    const xp = Number(total._sum?.textXp || 0) + Number(total._sum?.voiceXp || 0);
    const tier = [...COMMUNITY_LEVEL_ROLES].reverse().find(item => xp >= item.xp);
    if (tier) targets.get(tier.name).add(total.discordUserId);
  }
  return targets;
}

// Fully fetch members before changing holders so departed winners and stale
// level memberships are reconciled without relying on the gateway cache.
export async function reconcileCommunityActivityRoles(guild, targets) {
  const allowed = new Set([...COMMUNITY_LEVEL_ROLES.map(tier => tier.name),
    ...["Text", "Voice"].flatMap(board => [1, 2, 3].map(rank => `${board} Top ${rank}`))]);
  if ([...targets.keys()].some(name => !allowed.has(name))) throw new Error("activity_roles_unknown_target");
  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error("activity_roles_manage_roles_missing");
  await guild.roles.fetch();
  const members = await guild.members.fetch();
  let added = 0;
  let removed = 0;
  const existing = new Map();
  for (const [name, holders] of targets) {
    const matching = [...guild.roles.cache.values()].filter(role => role.name === name);
    if (matching.length > 1) throw new Error("activity_roles_duplicate_name");
    let role = matching[0];
    if (role && (role.managed || role.permissions.bitfield !== 0n || role.position >= me.roles.highest.position)) {
      throw new Error("activity_roles_unsafe_existing_role");
    }
    existing.set(name, role);
  }
  for (const [name, holders] of targets) {
    let role = existing.get(name);
    if (!role) role = await guild.roles.create({ name, permissions: [], hoist: true, mentionable: false, reason: "FIMA activity recognition" });
    else if (!role.hoist) await role.setHoist(true, "FIMA activity recognition");
    for (const member of members.values()) {
      const wants = !member.user.bot && holders.has(member.id);
      const has = member.roles.cache.has(role.id);
      if (wants && !has) { await member.roles.add(role, "FIMA activity recognition"); added++; }
      if (!wants && has) { await member.roles.remove(role, "FIMA activity recognition"); removed++; }
    }
  }
  return { roles: targets.size, added, removed };
}
