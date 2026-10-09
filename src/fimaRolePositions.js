import { PermissionsBitField } from "discord.js";

// A successful Discord mutation response does not prove the final hierarchy:
// later moves can shift earlier roles, and another administrator can edit it.
export async function organizeFimaRolePositions(guild, roleSummary, roleTypes) {
  const warnings = [];
  const me = await guild.members.fetchMe({ force: true });
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return { attempted: true, success: false, moved: 0, verified: false, warnings: ["Bot is missing Manage Roles."] };
  }
  const highest = me.roles.highest?.position || 0;
  const expected = [];
  for (const [index, type] of Object.keys(roleSummary).entries()) {
    const role = await guild.roles.fetch(roleSummary[type]?.id).catch(() => null);
    if (!role) {
      warnings.push(`${roleTypes[type]?.fallbackName || type} was not found.`);
      continue;
    }
    if (role.managed || !role.editable || role.position >= highest || role.id === guild.id) {
      warnings.push(`${role.name} cannot be moved by the bot.`);
      continue;
    }
    const target = Math.max(1, highest - 1 - index);
    expected.push({ id: role.id, name: role.name, initial: role.position, target });
    if (role.position !== target) {
      try {
        await role.setPosition(target, "Fima role setup");
      } catch (error) {
        warnings.push(`${role.name} position unchanged: ${error.message}`);
      }
    }
  }
  let live;
  try {
    live = await guild.roles.fetch();
  } catch {
    return { attempted: true, success: false, moved: 0, verified: false, warnings: [...warnings, "Final role positions could not be verified."] };
  }
  let moved = 0;
  for (const row of expected) {
    if (live.get(row.id)?.position !== row.target) {
      warnings.push(`${row.name} final position does not match the requested order.`);
    } else if (row.initial !== row.target) {
      moved += 1;
    }
  }
  return { attempted: true, success: warnings.length === 0, moved, verified: warnings.length === 0, warnings };
}
