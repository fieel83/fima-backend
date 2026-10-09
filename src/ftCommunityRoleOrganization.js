import { createHash, randomUUID } from 'node:crypto';
import { PermissionsBitField } from 'discord.js';

const GUILD = '1419335632324657306';
const dividerNames = {
  '1420402369312723014': '□・OWNER / MANAGEMENT',
  '1420402382671450153': '□・MODERATION',
  '1420867185068216350': '□・CREATOR TEAM',
  '1420402397447983144': '□・COMMUNITY STAFF',
  '1421523633020338347': '◇・STUDENTS',
  '1420402220784029696': '◇・CREATORS / BUYERS',
  '1420402240975540315': '⌗・COMMUNITY',
  '1420402249238184068': '⌁・SYSTEM / LANGUAGE',
  '1420402230380728463': '⌁・NOTIFICATIONS / INTERESTS',
  '1420402256838131794': '⌁・REGION',
  '1420402264794730536': '◇・ACCESS / INTERESTS',
  '1420402168443306126': '◇・SYSTEM / XP / LEVELS'
};
const groups = ['Owner / Management', 'Moderation', 'FIMA Bot / System', 'Creators', 'Community',
  'Verified Buyers', 'Text Top 1–3', 'Voice Top 1–3', 'Level 5/10/20/30/50', 'Notifications', 'Language', 'Region', 'Interests'];
const critical = ['Administrator', 'ManageRoles', 'ManageGuild', 'ManageChannels', 'ManageWebhooks',
  'BanMembers', 'KickMembers', 'ModerateMembers', 'ManageMessages', 'ManageThreads', 'PinMessages',
  'ViewAuditLog', 'MentionEveryone', 'MuteMembers', 'DeafenMembers', 'MoveMembers'];
const fail = code => Object.assign(new Error(code), { code });
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function classifyFtRole(role) {
  const name = role.name.toLowerCase();
  if (role.managed || /quarantine|muted|bots|^fima$|^[+]+$|key/.test(name)) return 'FIMA Bot / System';
  if (role.id === '1420402470990905365' || /owner|almighty|^f\s*t$/.test(name)) return 'Owner / Management';
  if (/moderator|admin|ticket staff/.test(name)) return 'Moderation';
  if (/creator|designer|video team|stream mod/.test(name)) return 'Creators';
  if (/buyer/.test(name)) return 'Verified Buyers';
  if (/trial user/.test(name)) return 'Community';
  if (/text top/.test(name)) return 'Text Top 1–3';
  if (/voice top/.test(name)) return 'Voice Top 1–3';
  if (/level\s*(5|10|20|30|50)\b/.test(name)) return 'Level 5/10/20/30/50';
  if (/notification|ping/.test(name)) return 'Notifications';
  if (/turkish|english/.test(name)) return 'Language';
  if (/^(europe|asia|north america|south america)$/.test(name)) return 'Region';
  if (/glads|anti.?teamer|gif|perms|access|student/.test(name)) return 'Interests';
  return 'Community';
}

export function buildFtRoleOrganizationPlan(rows, botHighestPosition) {
  const before = [...rows].sort((a, b) => b.position - a.position || a.id.localeCompare(b.id));
  const anchor = row => row.id === GUILD || row.managed || !row.editable || row.position >= botHighestPosition ||
    critical.some(permission => row.permissions.includes(permission));
  const classified = before.map(row => ({ id: row.id, name: row.name, position: row.position,
    category: classifyFtRole(row), securityAnchor: anchor(row), divider: Boolean(dividerNames[row.id]) }));
  const desired = [];
  let band = [];
  const flush = () => {
    // Dividers are boundaries too: preserve their meaning and existing membership.
    const sorted = [...band].sort((a, b) => groups.indexOf(classifyFtRole(a)) - groups.indexOf(classifyFtRole(b)) ||
      (/level/i.test(a.name) && /level/i.test(b.name) ? Number(b.name.match(/\d+/)?.[0]) - Number(a.name.match(/\d+/)?.[0]) : 0) ||
      b.position - a.position);
    sorted.forEach((row, index) => desired.push({ id: row.id, position: band[index].position }));
    band = [];
  };
  for (const row of before) {
    if (anchor(row) || dividerNames[row.id]) { flush(); desired.push({ id: row.id, position: row.position }); }
    else band.push(row);
  }
  flush();
  const renames = before.filter(row => dividerNames[row.id] && !anchor(row) && row.name !== dividerNames[row.id])
    .map(row => ({ id: row.id, beforeName: row.name, afterName: dividerNames[row.id] }));
  const moves = desired.filter(row => before.find(original => original.id === row.id).position !== row.position);
  return { guildId: GUILD, digest: digest({ before, botHighestPosition }), classified, renames, moves,
    positions: desired, guarantees: ['No role deletion or creation', 'Permissions and member assignments retained',
      'Managed and privileged role positions fixed', 'Ordinary roles stay inside their existing security boundaries'],
    remaining: ['Legacy role removal requires complete membership and external dependency verification plus approval',
      'Privileged Creators role retained as a security anchor; permission changes require separate review'] };
}

async function inventory(guild) {
  const roles = await guild.roles.fetch();
  return [...roles.values()].map(role => ({ id: role.id, name: role.name, position: role.position,
    permissions: role.permissions.toArray().sort(), managed: role.managed, editable: role.editable,
    color: role.color, hoist: role.hoist, mentionable: role.mentionable })).sort((a, b) => a.id.localeCompare(b.id));
}
const invariant = rows => rows.map(({ name, position, ...rest }) => rest);

// Read-only recovery evidence: never clears the journal or changes Discord roles.
export async function inspectFtRoleOrganization({ guild, journals }) {
  if (guild?.id !== GUILD) throw fail('ft_community_guild_required');
  const current = await inventory(guild);
  const compare = before => {
    const original = new Map((before || []).map(row => [row.id, row]));
    const present = new Set(current.map(row => row.id));
    return {
      added: current.filter(row => !original.has(row.id)).map(row => row.id),
      removed: [...original.keys()].filter(id => !present.has(id)),
      changed: current.flatMap(row => {
        const prior = original.get(row.id);
        if (!prior) return [];
        const fields = Object.keys(prior).filter(key => digest(prior[key]) !== digest(row[key]));
        return fields.length ? [{ id: row.id, fields, before: prior, current: row }] : [];
      })
    };
  };
  return { guildId: guild.id, capturedAt: new Date().toISOString(), readOnly: true, current,
    journals: journals.filter(row => row?.guildId === guild.id).map(row => ({
      id: row.id, status: row.status, startedAt: row.startedAt, completedAt: row.completedAt,
      error: row.error, appliedRenames: row.appliedRenames || [], plan: row.plan,
      comparedWithBefore: compare(row.before),
      comparedWithFailure: row.observed ? compare(row.observed) : null
    })) };
}

export async function organizeFtRoles({ guild, expectedDigest, actorUserId, saveJournal }) {
  if (guild?.id !== GUILD) throw fail('ft_community_guild_required');
  const me = await guild.members.fetchMe({ force: true });
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) throw fail('manage_roles_required');
  const before = await inventory(guild);
  const plan = buildFtRoleOrganizationPlan(before, me.roles.highest.position);
  if (!expectedDigest) return plan;
  if (expectedDigest !== plan.digest) throw fail('migration_stale_plan');
  if (typeof saveJournal !== 'function') throw fail('migration_journal_required');
  const journal = { id: randomUUID(), guildId: guild.id, actorUserId, status: 'applying',
    startedAt: new Date().toISOString(), before, plan, appliedRenames: [] };
  let expected = structuredClone(before);
  const persist = () => saveJournal(structuredClone(journal));
  const verify = async () => {
    const actual = await inventory(guild);
    if (digest(actual) !== digest(expected)) throw fail('role_organization_concurrent_change');
    return actual;
  };
  await persist();
  try {
    for (const row of plan.renames) {
      await verify();
      await guild.roles.cache.get(row.id).setName(row.afterName, 'Owner reviewed FT role organization');
      expected.find(role => role.id === row.id).name = row.afterName;
      await verify();
      journal.appliedRenames.push(row.id);
      await persist();
    }
    if (plan.moves.length) {
      await verify();
      await guild.roles.setPositions(plan.moves
        .map(row => ({ role: row.id, position: row.position })), 'Owner reviewed FT role organization');
      for (const row of plan.positions) expected.find(role => role.id === row.id).position = row.position;
    }
    journal.after = await verify();
    if (digest(invariant(before)) !== digest(invariant(journal.after))) throw fail('role_invariant_failed');
    journal.status = 'roles_organized';
    journal.completedAt = new Date().toISOString();
    await persist();
    return journal;
  } catch (error) {
    // A lost response or concurrent edit is ambiguous. Never overwrite another administrator's changes.
    journal.status = 'recovery_required';
    journal.error = error.code || 'role_organization_failed';
    journal.observed = await inventory(guild).catch(() => null);
    await persist().catch(() => {});
    error.journal = journal;
    throw error;
  }
}
