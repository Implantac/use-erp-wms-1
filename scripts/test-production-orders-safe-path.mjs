import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const page = read('src/modules/production/ProductionOrders.tsx');
const service = read('src/services/production/productionService.ts');
const hook = read('src/hooks/production/useProductionOrders.ts');
test('OP page uses the scoped compare-and-swap hook instead of generic status mutation', () => {
  assert.match(page, /useProductionOrders\(\)/);
  assert.doesNotMatch(page, /useProduction\(\)|updateOrderStatus/);
  assert.doesNotMatch(service, /async updateOrderStatus\(/);
  assert.match(hook, /\.eq\('id', id\)\.eq\('company_id', companyId\)\.eq\('status', current\.status\)/);
});
test('OP list never calls completed ratio efficiency and does not show false empty totals on load error', () => {
  assert.match(page, /title="OPs concluídas" value=\{completedCount\}/);
  assert.doesNotMatch(page, /title="Eficiência"/);
  assert.match(page, /\{hasCompany && !loadError && <>/);
  assert.match(hook, /setLoadError\(true\)/);
});
