import assert from 'node:assert/strict';
import test from 'node:test';
import { communityActivitySettings, communityActivitySettingsForGuild } from '../src/communityActivitySettings.js';
import { handleCommunityTextActivity, reconcileCommunityVoiceGuild } from '../src/communityActivity.js';
import { applyParadiseCustomerWorkspacePatch, normalizeParadiseCustomerWorkspacePatch, buildParadiseCustomerWorkspaceView } from '../src/paradiseDashboardWorkspace.js';
import { PARADISE_TEST_GUILD_ID } from '../src/runtimeEnvironment.js';

const source = { COMMUNITY_ACTIVITY_ENABLED: 'true', DISCORD_MESSAGE_CONTENT_INTENT: 'true' };
const managed = { communityManaged: true, enabled: true, chatXp: 23, chatCooldownSeconds: 30, voiceXpPerMinute: 7 };
const setting = (xpSettings) => ({ findUnique: async () => ({ value: { guildConfigs: { [PARADISE_TEST_GUILD_ID]: { xpSettings } } } }) });

test('legacy generic XP settings do not silently disable the monthly engine', () => {
  assert.deepEqual(communityActivitySettings({ enabled: false, chatXp: 1 }, source), {
    communityManaged: false, enabled: true, chatXp: 10, chatCooldownSeconds: 0, voiceXpPerMinute: 5
  });
  assert.equal(communityActivitySettings(managed, { COMMUNITY_ACTIVITY_ENABLED: 'false' }).enabled, false);
});

test('explicit community save binds validated rates without allowing client-owned migration markers', async () => {
  const normalized = normalizeParadiseCustomerWorkspacePatch({ route: 'levels', value: { enabled: true, chatXp: 23, chatCooldownSeconds: 30, voiceXpPerMinute: 7 } });
  const next = applyParadiseCustomerWorkspacePatch({ activeSetupMode: 'community' }, normalized);
  assert.deepEqual(next.xpSettings, managed);
  assert.equal((await communityActivitySettingsForGuild({ setting: setting(next.xpSettings) }, PARADISE_TEST_GUILD_ID, source)).chatXp, 23);
  assert.equal((await communityActivitySettingsForGuild({ setting: setting(next.xpSettings) }, 'other-guild', source)).chatXp, 10);
  assert.throws(() => normalizeParadiseCustomerWorkspacePatch({ route: 'levels', value: { communityManaged: true } }));
  const unrelated = buildParadiseCustomerWorkspaceView({ card: { guildId: 'other-guild', botInstalled: true }, config: { activeSetupMode: 'community', modules: { levels: true }, xpSettings: { enabled: false, chatXp: 1 } }, route: 'levels' });
  assert.equal(unrelated.config.xpSettings.chatXp, 1);
});

function textDb(recent = false) {
  const writes = [];
  const tx = {
    communityActivitySeason: { upsert: async () => ({ id: 'season' }) },
    communityActivityMember: { upsert: async () => ({ id: 'member' }), update: async (args) => { writes.push(args.data); return { textXp: args.data.textXp.increment }; } },
    communityTextActivity: {
      findUnique: async () => null, count: async () => 0,
      findFirst: async ({ where }) => where.contentHash ? null : (recent ? { id: 'recent' } : null),
      create: async (args) => { writes.push(args.data); }
    }
  };
  return { writes, setting: setting(managed), $transaction: async (fn) => fn(tx) };
}
const message = { guildId: PARADISE_TEST_GUILD_ID, id: 'msg', channelId: 'channel', author: { id: 'user', bot: false }, content: 'FIMA topluluğunda bugün birlikte antrenman yapalım.' };

test('monthly text engine awards the saved guild rate and blocks distinct messages during cooldown', async () => {
  const db = textDb();
  const result = await handleCommunityTextActivity(message, { db, source });
  assert.equal(result.accepted, true);
  assert.equal(result.xp, 23);
  assert.equal(db.writes[0].xp, 23);
  const cooling = textDb(true);
  assert.equal((await handleCommunityTextActivity(message, { db: cooling, source })).reason, 'message_cooldown');
  assert.equal(cooling.writes.length, 0);
});

test('pausing guild XP prevents text writes and closes only its voice sessions without accruing XP', async () => {
  const db = textDb();
  db.setting = setting({ ...managed, enabled: false });
  assert.equal((await handleCommunityTextActivity(message, { db, source })).reason, 'activity_disabled');
  assert.equal(db.writes.length, 0);
  let closed;
  db.communityVoiceSession = { updateMany: async (args) => { closed = args; } };
  const now = new Date('2026-10-09T00:00:00Z');
  assert.equal((await reconcileCommunityVoiceGuild({ id: PARADISE_TEST_GUILD_ID }, { db, source, now })).reason, 'activity_disabled');
  assert.deepEqual(closed.where, { guildId: PARADISE_TEST_GUILD_ID, active: true });
  assert.equal(closed.data.lastAccruedAt, now);
  assert.equal(closed.data.active, false);
  assert.equal(db.writes.length, 0);
});
