import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { paradiseDashboardHtml } from '../src/paradiseDashboardHtml.js';

function accessRuntime(language) {
  const html = paradiseDashboardHtml({ clientId: 'test' });
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  const element = (textContent = '') => ({ textContent, dataset: {}, childElementCount: 0, hidden: false });
  elements.set('accessTitle', element('Checking secure session…'));
  elements.set('accessMessage', element('Your Fima login and linked Discord identity are checked without exposing account details.'));
  elements.set('accessGate', element());
  elements.set('console', element());
  elements.set('uiLanguage', { value: language });
  let actions = [];
  elements.set('accessActions', {
    set innerHTML(value) {
      actions = [...value.matchAll(/<(?:a|button)\b([^>]*)>([^<]*)<\/(?:a|button)>/g)].map(match => {
        const node = element(match[2]);
        const source = match[1].match(/data-en-text="([^"]*)"/);
        if (source) node.dataset.enText = source[1];
        return node;
      });
    },
  });
  const storage = new Map([['paradiseUiLanguage', language]]);
  const context = vm.createContext({
    byId: id => elements.get(id),
    currentPayload: null,
    syncMobilePageLabels: () => {},
    updateGuideResultCount: () => {},
    localizeApplicationEditor: () => {},
    API_BASE: 'https://api.example.test',
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: {
      documentElement: {},
      querySelectorAll: selector => selector.startsWith('h1,h2,h3,button')
        ? [elements.get('accessTitle'), elements.get('accessMessage'), ...actions] : [],
    },
  });
  // Execute the actual rendered localization/access functions without dashboard network startup.
  vm.runInContext(script.slice(script.indexOf('const UI_TR='), script.indexOf('function show(')), context);
  vm.runInContext(script.slice(script.indexOf('function renderAccess('), script.indexOf('async function sessionStatus(')), context);
  return { context, elements, actions: () => actions };
}

const reasons = {
  login_required: ['FIMA login required', 'FIMA girişi gerekli'],
  discord_link_required: ['Discord account required', 'Discord hesabı gerekli'],
  not_owner: ['FIMA access is restricted', 'FIMA erişimi kısıtlı'],
  unavailable: ['Session check unavailable', 'Oturum kontrolü kullanılamıyor'],
};

for (const language of ['en', 'tr']) {
  test(`access decisions survive initial checking translation and language changes (${language})`, () => {
    const runtime = accessRuntime(language);
    const { context, elements } = runtime;
    vm.runInContext(`applyUiLanguage('${language}')`, context);
    const initialMessage = elements.get('accessMessage').textContent;
    for (const [reasonCode, titles] of Object.entries(reasons)) {
      assert.equal(vm.runInContext(`renderAccess({ ownerAuthorized:false, reasonCode:'${reasonCode}' })`, context), false);
      assert.equal(elements.get('accessTitle').textContent, titles[language === 'en' ? 0 : 1]);
      assert.notEqual(elements.get('accessMessage').textContent, initialMessage);
      assert.equal(elements.get('console').hidden, true);
      assert.equal(elements.get('accessGate').hidden, false);
      vm.runInContext("applyUiLanguage('en')", context);
      assert.equal(elements.get('accessTitle').textContent, titles[0]);
      for (const action of runtime.actions()) assert.equal(action.textContent, action.dataset.enText);
      vm.runInContext("applyUiLanguage('tr')", context);
      assert.equal(elements.get('accessTitle').textContent, titles[1]);
      elements.get('uiLanguage').value = language;
      vm.runInContext(`applyUiLanguage('${language}')`, context);
    }
    assert.equal(vm.runInContext('renderAccess({ ownerAuthorized:true })', context), true);
    assert.equal(elements.get('console').hidden, false);
    assert.equal(elements.get('accessGate').hidden, true);
  });
}
