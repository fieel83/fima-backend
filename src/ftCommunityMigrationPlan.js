import { createHash } from 'node:crypto';

export const FT_MIGRATION_GUILD_ID = '1419335632324657306';
export const FT_MIGRATION_CATEGORIES = Object.freeze([
  '□・STAFF', '□・MANAGEMENT', '▤・RECORDS', '⌂・START', '⌗・COMMUNITY',
  '⌁・EVENTS', '◇・HELP', '◉・VOICE', '▤・ARCHIVE'
]);

const groups = [
  ['START', ['rules', 'roles', 'fieel-info', 'joins-leaves', 'start-here']],
  ['COMMUNITY', ['general', 'chat', 'english-chat', 'media', 'english-media', 'sohbet', 'medya', 'turkce-sohbet', 'turkce-medya', 'turkish-chat', 'turkish-media', 'vouches', 'outfits', 'capes', 'levels']],
  ['EVENTS', ['announcements', 'updates', 'uploads', 'polls', 'events', 'giveaways', 'turkce-duyurular', 'fima-updates']],
  ['HELP', ['support', 'faq', 'support-faq', 'fima-support', 'fima-guide', 'fima-macro', 'fake-headless']],
  ['STAFF', ['staff-hub', 'staff-chat', 'staff-guides', 'staff-application-reviews', 'application-reviews', 'moderator-only', 'steps', 'macro-steps']],
  ['MANAGEMENT', ['management', 'management-chat', 'admin-chat', 'staff-actions', 'video-hub', 'video-ideas', 'video-scripts', 'video-assets', 'video-review', 'video-upload-schedule']],
  ['RECORDS', ['logs', 'wick-logs', 'message-logs', 'un-bl-logs', 'join-logs', 'fima-logs', 'staff-logs', 'security-logs', 'ticket-transcripts', 'transcripts']],
  ['ARCHIVE', ['openclaw-private', 'old-things', 'glads', 'eu-glads', 'asia-glads', 'na-glads', 'anti-teamers', 'leaderboard', 'tournaments']]
];
const destination = new Map(groups.flatMap(([group, names]) => names.map(name => [name, group])));
const normalize = name => String(name || '').normalize('NFKC').toLowerCase()
  .replace(/^[^\p{L}\p{N}]+/u, '').replace(/[_\s]+/g, '-');

const chatNames = new Set(['general', 'chat', 'english-chat', 'media', 'english-media', 'sohbet', 'medya',
  'turkce-sohbet', 'turkce-medya', 'turkish-chat', 'turkish-media', 'staff-chat', 'mod-chat', 'management', 'management-chat', 'admin-chat', 'moderator-only']);
const panelNames = new Set(['roles', 'support', 'fima-support', 'polls', 'events', 'giveaways', 'staff-application-reviews', 'application-reviews']);
function styledChannelName(channel, privateTicket, group) {
  if (!group || privateTicket) return channel.name;
  const key = normalize(channel.name);
  const aliases = { 'turkce-sohbet': 'sohbet', 'turkish-chat': 'sohbet', 'turkce-medya': 'medya',
    'turkish-media': 'medya', 'support-faq': 'faq', 'create-a-room': 'create-room' };
  const base = aliases[key] || key;
  return `${[2, 13].includes(channel.type) ? '◦' : panelNames.has(key) ? '◇' : chatNames.has(key) ? '›' : '⌁'}・${base}`;
}

// This is deliberately a review plan, never an instruction to reconstruct a guild.
// Unrecognised resources remain in place until their purpose has been reviewed.
export function buildFtCommunityMigrationPlan(audit) {
  if (audit?.guild?.id !== FT_MIGRATION_GUILD_ID) {
    return { status: 'unavailable', reason: 'ft_community_guild_required', readOnly: true };
  }
  const types = { GuildText: 0, GuildVoice: 2, GuildCategory: 4, GuildAnnouncement: 5,
    AnnouncementThread: 10, PublicThread: 11, PrivateThread: 12, GuildStageVoice: 13,
    GuildDirectory: 14, GuildForum: 15, GuildMedia: 16 };
  const channels = [...new Map([
    ...(audit.categories || []).map(category => ({ ...category, type: 4 })),
    ...(audit.channels || []).map(channel => ({ ...channel, type: types[channel.type] ?? channel.type }))
  ].map(channel => [channel.id, channel])).values()];
  const categories = channels.filter(channel => channel.type === 4 || channel.type === '4');
  const categoryNames = new Map(categories.map(category => [category.id, category.name]));
  const targetCategories = FT_MIGRATION_CATEGORIES.map((name, position) => {
    const key = normalize(name).toUpperCase();
    const matches = categories.filter(category => normalize(category.name) === normalize(key));
    return { name, key, position, existingId: matches.length === 1 ? matches[0].id : null,
      decision: matches.length === 1 ? (matches[0].name === name ? 'keep' : 'rename') : matches.length ? 'review' : 'create',
      preserveExistingPermissions: true };
  });
  const matrix = channels.filter(channel => !categories.includes(channel)).map(channel => {
    const key = normalize(channel.name);
    const currentCategory = categoryNames.get(channel.parentId) || null;
    // The staff rules channel is separate from the public onboarding rules.
    const staffRules = key === 'rules' && normalize(currentCategory) === 'staff';
    // Historical procedures already archived must not be reactivated by their names.
    const archivedProcedure = ['steps', 'macro-steps'].includes(key) && normalize(currentCategory) === 'archive';
    // Preserve private support conversations in place; unknown/public ticket-like channels still require review.
    const privateTicket = /^(?:closed-)?ticket-/.test(key) && normalize(currentCategory) === 'help'
      && (channel.permissionOverwrites || []).some(row => row.id === audit.guild.id
        && Number(row.type) === 0 && (row.deny || []).includes('ViewChannel'));
    const group = archivedProcedure ? 'ARCHIVE' : privateTicket ? 'HELP'
      : staffRules ? 'STAFF' : [2, 13].includes(channel.type) ? 'VOICE' : destination.get(key);
    const target = targetCategories.find(category => category.key === group);
    const decision = !target ? 'review' : group === 'ARCHIVE' ? 'archive'
      : target.existingId && channel.parentId === target.existingId ? 'keep' : 'move';
    return { id: channel.id, name: channel.name, targetName: styledChannelName(channel, privateTicket, group), type: channel.type, parentId: channel.parentId,
      currentCategory, targetCategory: target?.name || null, targetCategoryId: target?.existingId || null,
      decision, preserveId: true, preserveHistory: true, preservePermissionOverwrites: true,
      permissionReviewRequired: Boolean(target && channel.parentId !== target.existingId),
      reason: !target ? 'Purpose or active integration must be reviewed before moving.'
        : group === 'ARCHIVE' ? 'Preserve historical private channel and its access restrictions.'
        : 'Reuse the existing channel; preserve message, webhook and integration IDs.' };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const oldCategories = categories.filter(category => !targetCategories.some(target => target.existingId === category.id))
    .map(category => ({ id: category.id, name: category.name, decision: 'review_after_moves',
      reason: 'Remove from the active structure only after all children and permissions are verified.' }));
  const requiredNames = ['rules', 'roles', 'fieel-info', 'joins-leaves', 'general', 'media',
    'turkce-sohbet', 'turkce-medya', 'vouches', 'announcements', 'updates', 'uploads', 'polls',
    'support', 'support-faq', 'fima-macro', 'fake-headless', 'outfits', 'capes', 'management', 'staff-actions'];
  const missingChannels = requiredNames.filter(name => !matrix.some(channel => normalize(channel.name) === name
    || name === 'management' && ['management-chat', 'admin-chat'].includes(normalize(channel.name))
    || name === 'support-faq' && normalize(channel.name) === 'faq'
    || name === 'turkce-sohbet' && ['sohbet', 'turkish-chat'].includes(normalize(channel.name))
    || name === 'turkce-medya' && ['medya', 'turkish-media'].includes(normalize(channel.name))));
  const sourceDigest = createHash('sha256').update(JSON.stringify(channels.map(channel => ({
    id: channel.id, name: channel.name, type: channel.type, parentId: channel.parentId, position: channel.position,
    permissionOverwrites: (channel.permissionOverwrites || []).map(row => ({
      id: row.id, type: Number(row.type), allow: [...(row.allow || [])].sort(),
      deny: [...(row.deny || [])].sort()
    })).sort((a, b) => a.id.localeCompare(b.id))
  })).sort((a, b) => a.id.localeCompare(b.id)))).digest('hex');
  return { schemaVersion: 1, status: 'review_required', readOnly: true, productionMutationAllowed: false,
    guildId: audit.guild.id, capturedAt: audit.capturedAt, sourceDigest,
    targetCategories, matrix, oldCategories, missingChannels,
    unresolvedChannelIds: matrix.filter(row => row.decision === 'review').map(row => row.id),
    deletionOperations: [],
    remainingChecks: ['Complete message, pin, webhook, ticket and third-party integration audit.',
      'Review effective role and member access before and after every parent change.',
      'Back up and verify rollback before applying any move.',
      'Refresh the live snapshot and reject a stale plan.',
      'Verify welcome/leave, roles, tickets, showcases, security and temporary voice flows.'] };
}
