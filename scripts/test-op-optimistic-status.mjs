import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
test('OP generic hook rejects arbitrary fields and stale transitions', () => {
  const hook = read('hooks/production/useProductionOrders.ts');
  assert.match(hook, /canChangeOPStatus\(current\.status, updates\.status\)/);
  assert.match(hook, /key !== 'status' && key !== 'start_date'/);
  assert.match(hook, /\.eq\('status', current\.status\)/);
  assert.match(hook, /\.eq\('updated_at', current\.updated_at\)\.select\('id'\)/);
  assert.match(hook, /!data\?\.length/);
  assert.doesNotMatch(read('modules/production/pcp/OrdersTab.tsx'), /onStatusChange\(o, 'completed'\)/);
  assert.match(read('modules/production/kanban/hooks/useKanbanActions.ts'), /canChangeOPStatus\(order\.status, newStatus\)/);
});
