import { AuditLogEvent, PermissionsBitField } from 'discord.js';
import { FT_COMMUNITY_GUILD_ID } from './ftCommunityWelcome.js';
import { ftChannelName } from './ftCommunityChannelNames.js';

const staffRoles = new Set(['1420401457684938794', '1420401459177984036', '1422438292187643974', '1422436955815149648', '1420402470990905365']);
const actions = new Map([
  [AuditLogEvent.MemberRoleUpdate, 'Staff role assignment changed'],
  [AuditLogEvent.RoleCreate, 'Role created'],
  [AuditLogEvent.RoleUpdate, 'Role settings changed'],
  [AuditLogEvent.RoleDelete, 'Role deleted'],
  [AuditLogEvent.ChannelOverwriteCreate, 'Channel access added'],
  [AuditLogEvent.ChannelOverwriteUpdate, 'Channel access changed'],
  [AuditLogEvent.ChannelOverwriteDelete, 'Channel access removed']
]);
const elevated = ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'BanMembers', 'KickMembers', 'ModerateMembers'];
const snowflake = value => /^\d{17,20}$/.test(String(value || '')) ? String(value) : null;

export function ftStaffActionPayload(entry, guild) {
  if (guild?.id !== FT_COMMUNITY_GUILD_ID || !snowflake(entry?.id) || !actions.has(entry.action)) return null;
  const changes = entry.changes || [];
  const roleIds = changes.filter(row => ['$add', '$remove'].includes(row.key)).flatMap(row => (row.new || []).map(role => role.id)).filter(snowflake);
  if (entry.action === AuditLogEvent.MemberRoleUpdate && !roleIds.some(id => {
    if (staffRoles.has(id)) return true;
    const role = guild.roles?.cache?.get(id);
    return elevated.some(name => role?.permissions?.has(PermissionsBitField.Flags[name]));
  })) return null;
  const actor = snowflake(entry.executorId || entry.executor?.id);
  const target = snowflake(entry.targetId || entry.target?.id);
  // Reasons can contain credentials or private ticket content: retain them in Discord's audit log only.
  const fields = [
    { name: 'Actor', value: actor ? `<@${actor}> (\`${actor}\`)` : 'Unavailable in Discord audit log' },
    { name: 'Target', value: target ? `\`${target}\`` : 'Unavailable' },
    { name: 'Changed fields', value: changes.map(row => String(row.key).replace(/[^a-zA-Z0-9_$]/g, '')).filter(Boolean).slice(0, 20).join(', ') || 'See Discord audit log' },
    ...(roleIds.length ? [{ name: 'Roles', value: roleIds.map(id => `\`${id}\``).join(', ').slice(0, 1000) }] : []),
    { name: 'Reason and result', value: 'Applied by Discord. Authorized managers can review the reason in Server Settings → Audit Log.' }
  ];
  return { embeds: [{ title: actions.get(entry.action), color: 0x7657d6, fields, footer: { text: `FT staff action · ${entry.id}` } }], allowedMentions: { parse: [] } };
}

function denyPublicView(channel, guildId) {
  const overwrite = channel?.permissionOverwrites?.cache?.get(guildId);
  return Boolean(overwrite?.deny?.has(PermissionsBitField.Flags.ViewChannel) && !overwrite?.allow?.has(PermissionsBitField.Flags.ViewChannel));
}

const deliveries = new WeakMap();
export async function publishFtStaffAction(entry, guild, settings) {
  if (!ftStaffActionPayload(entry, guild)) return { status: 'ignored' };
  const previous = deliveries.get(guild) || Promise.resolve();
  const delivery = previous.catch(() => {}).then(() => deliverStaffAction(entry, guild, settings));
  deliveries.set(guild, delivery);
  try { return await delivery; }
  finally { if (deliveries.get(guild) === delivery) deliveries.delete(guild); }
}

async function deliverStaffAction(entry, guild, settings) {
  const payload = ftStaffActionPayload(entry, guild);
  if (!payload) return { status: 'ignored' };
  const channels = [...(await guild.channels.fetch()).values()].filter(channel => channel && ftChannelName(channel.name) === 'staff-actions' && channel.isTextBased?.());
  if (channels.length !== 1) throw new Error('FT staff actions channel missing or ambiguous');
  const channel = channels[0];
  const parent = channel.parent || await guild.channels.fetch(channel.parentId);
  if (ftChannelName(parent?.name) !== 'management' || !denyPublicView(parent, guild.id) || !denyPublicView(channel, guild.id)) throw new Error('FT staff actions requires private MANAGEMENT permissions');
  const key = `ft_staff_action:${guild.id}:${entry.id}`;
  const saved = await settings.findUnique({ where: { key } });
  if (saved?.value?.messageId) return { status: 'already_logged', messageId: saved.value.messageId };
  // Recover a successful send followed by a failed database write without reposting it.
  const history = await channel.messages.fetch({ limit: 50 });
  const marker = payload.embeds[0].footer.text;
  const existing = [...history.values()].find(message => message.author?.id === guild.client.user.id && message.embeds?.some(embed => embed.footer?.text === marker));
  const message = existing || await channel.send(payload);
  const value = { channelId: channel.id, messageId: message.id, eventId: entry.id, status: 'logged' };
  await settings.upsert({ where: { key }, create: { key, value }, update: { value } });
  return { ...value, status: existing ? 'recovered' : 'logged' };
}
