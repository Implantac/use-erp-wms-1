import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hook = read('src/hooks/production/useProductionMachines.ts');
const page = read('src/modules/production/ProductionMachinesPage.tsx');
const routes = read('src/routes/ProductionRoutes.tsx');
const menu = read('src/config/navigation/sections/operacional.ts');

test('equipment entry exists in production routes and industry navigation', () => {
  assert.match(routes, /path="maquinas" element={<ProductionMachinesPage/);
  assert.match(menu, /href: '\/producao\/maquinas'/);
});
test('reads and writes explicitly scope equipment to active company', () => {
  assert.match(hook, /select\('\*'\)\.eq\('company_id', companyId\)/);
  assert.match(hook, /company_id: companyId, code, name, type/);
  assert.match(hook, /\.eq\('id', id\)\.eq\('company_id', companyId\)/);
  assert.match(hook, /loadedCompanyId === companyId \? machines : \[\]/);
  assert.match(hook, /filter: `company_id=eq\.\$\{companyId\}`/);
});
test('registry does not expose operational updates and does not claim capacity', () => {
  assert.match(hook, /\['code', 'name', 'type', 'sector', 'active'\]/);
  assert.match(hook, /\.eq\('updated_at', current\.updated_at\)/);
  assert.match(page, /Não mede produção ou paradas automaticamente/);
  assert.doesNotMatch(page, /capacity_per_hour:/);
});
