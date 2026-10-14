import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
test('menu search and direct route guard share the same niche presentation rule', () => {
  const sidebar = read('core/layout/Sidebar.tsx');
  const guard = read('components/auth/OperationalScopeGuard.tsx');
  const onboarding = read('pages/Onboarding.tsx');
  assert.match(sidebar, /if \(!canPresentNicheRoute\(segment, item.href\)\) return \[\]/);
  assert.match(sidebar, /children = item.children\?\.filter\(child => canPresentNicheRoute\(segment, child.href\)\)/);
  assert.match(guard, /if \(!canPresentNicheRoute\(segment, pathname\)\)/);
  for (const value of ['textile', 'fio', 'tecelagem', 'dyeing', 'laundry', 'animal_feed', 'food_factory', 'chemicals']) {
    assert.ok(onboarding.includes(`value: '${value}'`), value);
  }
});
