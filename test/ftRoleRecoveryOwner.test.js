import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/assets/js/fima-owner-tools.js', import.meta.url), 'utf8');
const workflow = source.slice(source.indexOf('let reviewedFtRoleRecovery=null;'), source.indexOf('async function runManagedOperation(kind)'));
const guildId = '1419335632324657306';
const journalId = '7e6032c4-1cce-4432-88cd-1ac5992d727f';
function harness() {
  const controls = new Map(), calls = [], messages = [];
  const byId = id => {
    if (!controls.has(id)) controls.set(id, { value: '', disabled: true, dataset: {}, textContent: '',
      replaceChildren() { this.value = ''; }, append(option) { if (!this.value) this.value = option.value; } });
    return controls.get(id);
  };
  const context = vm.createContext({ byId, document: { createElement: () => ({}) }, selectedGuildId: guildId,
    reviewedFtRoles: { digest: 'old-plan' }, API_BASE: 'https://api.example.test',
    show: (...args) => messages.push(args),
    fetch: async () => ({ ok: true, json: async () => ({ recovery: { guildId, journals: [{ id: journalId, status: 'recovery_required' }] } }) }),
    mutate: async (path, body) => { calls.push({ path, body }); return { response: { ok: true }, result: { recovery: {
      guildId, journalId, discordWrites: 0, digest: 'a'.repeat(64), status: 'recovered_partial' } } }; }
  });
  vm.runInContext(workflow, context);
  return { context, byId, calls, messages };
}

test('Owner recovery requires a fresh review and consumes it once without role moves', async () => {
  const h = harness();
  await h.byId('inspectFtRoleRecovery').onclick();
  await h.byId('applyFtRoleRecovery').onclick();
  assert.equal(h.calls.length, 0);
  await h.byId('prepareFtRoleRecovery').onclick();
  assert.equal(h.byId('applyFtRoleRecovery').disabled, false);
  assert.equal(h.byId('applyFtRoles').disabled, true);
  await h.byId('applyFtRoleRecovery').onclick();
  assert.deepEqual(h.calls.map(call => call.path), ['/api/fima-bot/actions/prepare-ft-role-recovery', '/api/fima-bot/actions/reconcile-ft-roles']);
  assert.equal(h.calls[1].body.expectedDigest, 'a'.repeat(64));
  assert.equal(h.calls[1].body.journalId, journalId);
  assert.equal(h.byId('applyFtRoleRecovery').disabled, true);
  await h.byId('applyFtRoleRecovery').onclick();
  assert.equal(h.calls.length, 2);
});

test('Switching journals or guilds invalidates Owner recovery approval', async () => {
  const h = harness();
  await h.byId('inspectFtRoleRecovery').onclick();
  await h.byId('prepareFtRoleRecovery').onclick();
  h.byId('ftRoleRecoveryJournal').value = 'another-journal';
  h.byId('ftRoleRecoveryJournal').onchange();
  await h.byId('applyFtRoleRecovery').onclick();
  assert.equal(h.calls.length, 1);
  h.context.selectedGuildId = 'another-guild';
  await h.byId('prepareFtRoleRecovery').onclick();
  assert.equal(h.calls.length, 1);
});

test('Lost apply response does not retain approval or automatically retry', async () => {
  const h = harness();
  await h.byId('inspectFtRoleRecovery').onclick();
  await h.byId('prepareFtRoleRecovery').onclick();
  let attempts = 0;
  h.context.mutate = async () => { attempts++; throw new Error('lost_response'); };
  await h.byId('applyFtRoleRecovery').onclick();
  await h.byId('applyFtRoleRecovery').onclick();
  assert.equal(attempts, 1);
  assert.equal(h.byId('applyFtRoleRecovery').disabled, true);
  assert.match(h.messages.at(-2)[0], /Inspect the journal/);
});

test('Recovery evidence returned after a guild switch cannot enable saving', async () => {
  const h = harness();
  await h.byId('inspectFtRoleRecovery').onclick();
  let resolve;
  h.context.mutate = () => new Promise(done => { resolve = done; });
  const pending = h.byId('prepareFtRoleRecovery').onclick();
  h.context.selectedGuildId = 'another-guild';
  resolve({ response: { ok: true }, result: { recovery: { guildId, journalId, discordWrites: 0, digest: 'a'.repeat(64) } } });
  await pending;
  assert.equal(h.byId('applyFtRoleRecovery').disabled, true);
});
