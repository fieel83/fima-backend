import { PermissionsBitField } from 'discord.js';

export function temporaryVoiceOverwrites(parentOverwrites, ownerId) {
  const inherited = Array.from(parentOverwrites || [], overwrite => ({
    id: overwrite.id, type: overwrite.type,
    allow: BigInt(overwrite.allow?.bitfield ?? overwrite.allow ?? 0),
    deny: BigInt(overwrite.deny?.bitfield ?? overwrite.deny ?? 0)
  }));
  const ownerPermissions = PermissionsBitField.Flags.ViewChannel | PermissionsBitField.Flags.Connect;
  const previous = inherited.find(overwrite => overwrite.id === ownerId);
  const owner = { id: ownerId, type: 1,
    allow: (previous?.allow || 0n) | ownerPermissions,
    deny: (previous?.deny || 0n) & ~ownerPermissions };
  return [...inherited.filter(overwrite => overwrite.id !== ownerId), owner];
}
