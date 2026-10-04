import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/assets/js/paradise-community-structure.js', import.meta.url), 'utf8');
const previews = ['communityStructureSafety', 'communityDesktopPreview', 'communityMobilePreview', 'communityMappingPreview', 'communityRolePreview', 'communityPersonaPreview'];

function harness() {
  let guild = 'first';
  const elements = new Map(previews.concat('communityOperationStatus').map(id => [id, { textContent: 'Previous server data' }]));
  const requests = [];
  let loaded;
  vm.runInNewContext(source, {
    window: {
      __PARADISE_OWNER_CONSOLE__: { apiBase: '', getSelectedGuildId: () => guild },
      addEventListener: (_, callback) => { loaded = callback; }
    },
    document: { getElementById: id => elements.get(id) },
    fetch: () => new Promise(resolve => requests.push(resolve)),
    encodeURIComponent
  });
  return { elements, requests, select(id) { guild = id; loaded({ detail: { guildId: id } }); } };
}
const failure = error => ({ ok: false, json: async () => ({ error }) });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('failed community load clears old guild previews and exposes a recoverable error', async () => {
  const h = harness();
  for (const id of previews) assert.match(h.elements.get(id).textContent, /Loading the selected server/);
  h.requests[0](failure('not_found'));
  await flush();
  for (const id of previews) assert.match(h.elements.get(id).textContent, /Unavailable/);
  assert.match(h.elements.get('communityOperationStatus').textContent, /not_found/);
  h.select('first');
  assert.equal(h.requests.length, 2, 'the failed request can be retried');
});

test('a late failed request cannot overwrite another guild or unlock its active request', async () => {
  const h = harness();
  h.select('second');
  h.requests[0](failure('old_server_error'));
  await flush();
  assert.doesNotMatch(h.elements.get('communityOperationStatus').textContent, /old_server_error/);
  h.select('second');
  assert.equal(h.requests.length, 2, 'second guild request remains marked in flight');
  h.requests[1](failure('current_server_error'));
  await flush();
  assert.match(h.elements.get('communityOperationStatus').textContent, /current_server_error/);
});
