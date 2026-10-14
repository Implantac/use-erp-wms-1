import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(`../src/hooks/production/${name}`, import.meta.url), 'utf8');
for (const [hook, table, result] of [
  ['useProductionOrders.ts', 'production_orders', 'orders'],
  ['useProductionCapacity.ts', 'production_capacity', 'capacities'],
]) {
  test(`${table} requires active company for reads/writes and suppresses stale lists`, () => {
    const source = read(hook);
    assert.match(source, /useActiveTenant\(\)/);
    assert.match(source, /companyIdRef\.current !== companyId/);
    assert.match(source, new RegExp(`from\\('${table}'\\)\\.select\\('\\*'\\)\\.eq\\('company_id', companyId\\)`));
    assert.match(source, /\.eq\('id', id\)\.eq\('company_id', companyId\)\.select\('id'\)/);
    assert.match(source, new RegExp(`${result}: loadedCompanyId === companyId \\? ${result} : \\[\\]`));
  });
}
test('OP cannot be completed by a direct hook update', () => {
  assert.match(read('useProductionOrders.ts'), /updates\.status === 'completed'/);
});
