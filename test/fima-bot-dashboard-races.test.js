import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/assets/js/fima-bot-dashboard.js', import.meta.url), 'utf8');
const guildId = '1520519015661961257';
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  const elements = new Map();
  const element = key => {
    if (!elements.has(key)) elements.set(key, { hidden: false, textContent: '', classList: { toggle() {} }, setAttribute() {}, removeAttribute() {}, addEventListener() {}, querySelectorAll: () => [] });
    return elements.get(key);
  };
  const context = vm.createContext({ URL, Intl, console, document: { querySelector: element, addEventListener() {} }, window: { addEventListener() {}, confirm: () => true }, fetch: () => new Promise(() => {}) });
  // Isolate the existing editor race tests from the separately loaded operations UI.
  context.renderFimaOperations = () => {};
  vm.runInContext(source.replace(/^import .*;\s*$/gm, '').replaceAll('export function ', 'function ').replace(/\nboot\(\);\s*$/, ''), context);
  vm.runInContext(`
    globalThis.rendered = [];
    globalThis.errors = [];
    renderModules = () => {};
    renderSelectedServer = () => {};
    setModuleSelectorState = () => {};
    updateUrl = () => {};
    updateDocumentTitle = () => {};
    focusModulePanel = () => {};
    renderWorkspaceFacts = () => {};
    renderModule = payload => rendered.push(payload);
    actionState = () => {};
    showError = (target, code) => errors.push(code);
    state.workspaces = [{ guildId: '${guildId}', name: 'Fixture' }];
    globalThis.dashboardState = state;
  `, context);
  return { context, element, run: code => vm.runInContext(code, context) };
}

test('dashboard reads and writes use the session-owning API origin with CSRF', async () => {
  const h = harness();
  const calls = [];
  h.context.fetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.endsWith('/csrf-token') ? { csrfToken: 'fixture-csrf' } : { success: true } };
  };
  await h.run(`request(LIST_ENDPOINT)`);
  await h.run(`patchWorkspaceConfig('${guildId}', 'branding', { language: 'en' }, 4)`);
  assert.deepEqual(calls.map(call => call.url), [
    'https://api.fimamacro.com/api/fima-bot/customer/workspaces',
    'https://api.fimamacro.com/api/csrf-token',
    `https://api.fimamacro.com/api/fima-bot/customer/workspaces/${guildId}/config`
  ]);
  assert.ok(calls.every(call => call.options.credentials === 'include'));
  assert.equal(calls[2].options.headers['x-fima-csrf'], 'fixture-csrf');
  assert.equal(calls[2].options.method, 'PATCH');
});

for (const [status, code, expected] of [[401, 'unauthorized', 'login_required'], [403, 'discord_connection_required', 'discord_connection_required']]) {
  test(`directory HTTP ${status} displays the actionable authentication error`, async () => {
    const h = harness();
    h.context.fetch = async () => ({ ok: false, status, json: async () => ({ error: code }) });
    await h.run('boot()');
    assert.deepEqual([...h.context.errors], [expected]);
  });
}

test('returning to server directory invalidates a pending workspace read', async () => {
  const h = harness();
  const pending = deferred();
  h.context.pending = pending.promise;
  h.run('request = () => pending');
  const opening = h.run(`openWorkspace('${guildId}')`);
  h.run('showDirectory()');
  pending.resolve({ workspace: { guildId }, routes: [{ id: 'overview' }], route: 'overview' });
  await opening;
  assert.equal(h.context.dashboardState.selected, null);
  assert.equal(h.context.rendered.length, 0);
  assert.equal(h.element('[data-workspace]').hidden, true);
});

test('wrong guild response displays an error instead of leaving perpetual loading', async () => {
  const h = harness();
  h.context.response = { workspace: { guildId: '1520519015661961258' } };
  h.run('request = async () => response');
  assert.equal(await h.run(`openWorkspace('${guildId}')`), false);
  assert.deepEqual([...h.context.errors], ['workspace_route_unavailable']);
});

for (const outcome of ['success', 'failure']) {
  test(`late save ${outcome} cannot change another active editor`, async () => {
    const h = harness();
    const pending = deferred();
    const listeners = {};
    const status = { textContent: '', className: '' };
    const controls = [{ disabled: false }];
    const form = {
      isConnected: true, reportValidity: () => true,
      addEventListener: (name, fn) => { listeners[name] = fn; },
      querySelector: selector => selector === '[data-editor-status]' ? status : { addEventListener() {} },
      querySelectorAll: () => controls,
      setAttribute() {}, removeAttribute() {}
    };
    h.context.form = form;
    h.context.pending = pending.promise;
    h.run("document.querySelector = selector => selector === '[data-config-form]' ? form : null");
    h.run(`
      editableValue = () => ({ language: 'tr' });
      formValue = () => ({ language: 'en' });
      patchWorkspaceConfig = () => pending;
      state.selected = state.workspaces[0];
      state.route = 'branding';
      bindEditor({ version: 1, route: 'branding' }, {});
      state.dirty = true;
    `);
    const saving = listeners.submit({ preventDefault() {} });
    h.run(`++state.request; state.route = 'welcome'; state.dirty = true; state.saving = true;`);
    form.isConnected = false;
    if (outcome === 'success') pending.resolve({ committedVersion: 2, readbackVersion: 2, workspace: { version: 2, route: 'branding', workspace: { guildId } } });
    else pending.reject(new Error('network_error'));
    await saving;
    assert.equal(h.context.dashboardState.route, 'welcome');
    assert.equal(h.context.dashboardState.saving, true);
    assert.equal(h.context.dashboardState.dirty, true);
    assert.equal(h.context.rendered.length, 0);
    assert.equal(controls[0].disabled, true);
  });
}
