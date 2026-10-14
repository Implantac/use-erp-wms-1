import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../src/hooks/${path}`, import.meta.url), 'utf8');
for (const [path, table] of [['production/useProductCosts.ts', 'product_costs'], ['system/useTimeEntries.ts', 'time_entries']]) {
  test(`${table}: reads and writes require company context and stale reads are ignored`, () => {
    const source = read(path);
    assert.match(source, /useActiveTenant\(\)/);
    assert.match(source, /companyIdRef\.current !== companyId/);
    assert.match(source, /loadedCompanyId === companyId/);
    assert.match(source, new RegExp(`from\\('${table}'\\)\\.select\\('\\*'\\)\\.eq\\('company_id', companyId\\)`));
    assert.match(source, /\.eq\('id', id\)\.eq\('company_id', companyId\)/);
  });
}
test('catalog price sums are not exposed as revenue', () => {
  assert.doesNotMatch(read('production/useProductCosts.ts'), /totalRevenue|totalCostSum/);
});
