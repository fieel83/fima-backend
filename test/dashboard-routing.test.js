import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/assets/js/account.js', import.meta.url), 'utf8');
const routing = source.slice(source.indexOf('  const dashboardRoutes ='), source.indexOf('\n  const copy ='));
const section = (pathname, hash = '') => vm.runInNewContext(`${routing}\ndashboardSectionFromLocation()`, { location: { pathname, hash } });

test('dashboard paths select their corresponding section', () => {
  for (const name of ['overview', 'products', 'billing', 'redeem', 'gifts', 'referrals', 'security', 'downloads', 'support', 'settings']) {
    assert.equal(section(`/dashboard/${name}`), name);
  }
});
test('existing section hashes work on overview routes', () => {
  for (const [hash, expected] of [['redeem', 'redeem'], ['gift-access', 'redeem'], ['purchased-gifts', 'gifts'], ['monthly-trial', 'redeem']]) {
    assert.equal(section('/dashboard/overview', `#${hash}`), expected);
  }
});
test('profile anchors retain the containing page and unknown fragments do not select panels', () => {
  assert.equal(section('/dashboard/overview', '#roblox-profile'), 'overview');
  assert.equal(section('/dashboard/products', '#unknown'), 'products');
  assert.equal(section('/dashboard', '#unknown'), 'overview');
});
