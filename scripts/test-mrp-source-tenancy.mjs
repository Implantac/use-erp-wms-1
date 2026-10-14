import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../src/hooks/${path}`, import.meta.url), 'utf8');
test('MRP technical sheets and supply balances are scoped to the company before rendering', () => {
  const sheets = read('production/useTechnicalSheets.ts');
  const supplies = read('inventory/useSupplyStock.ts');
  assert.match(sheets, /from\('product_technical_sheets'\)\.select\('\*'\)\.eq\('company_id', companyId\)/);
  assert.match(sheets, /loadedCompanyId === companyId \? sheets : \[\]/);
  assert.match(supplies, /from\('supply_stock'\)\.select\('\*'\)\.eq\('company_id', companyId\)/);
  assert.match(supplies, /from\('supply_movements'\)\.select\('\*'\)\.eq\('company_id', companyId\)/);
  assert.match(supplies, /loadedSuppliesCompanyId === companyId \? supplies : \[\]/);
  assert.match(supplies, /loadedMovementsCompanyId === companyId \? movements : \[\]/);
  for (const code of [sheets, supplies]) assert.match(code, /companyIdRef\.current !== companyId/);
});
