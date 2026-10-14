import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
test('route and operation screens scope known writes to the active company', () => {
  const routes = read('hooks/production/useProductionRoutes.ts');
  const operations = read('hooks/production/useProductionSteps.ts');
  const panel = read('modules/production/productionRoutes/RouteStepsPanel.tsx');
  assert.match(routes, /insert\(\{ \.\.\.item, company_id: companyId \}/);
  assert.match(routes, /insert\(\{ \.\.\.step, route_id: routeId, company_id: companyId \}/);
  assert.match(routes, /\.eq\('route_id', routeId\)\.eq\('company_id', companyId\)/);
  assert.match(operations, /insert\(\{ \.\.\.step, company_id: companyId \}/);
  assert.match(operations, /\.eq\('company_id', companyId\)/);
  assert.match(panel, /activeNameCounts\.get\(op.name\) === 1/);
  assert.match(panel, /selectableOperations\.some\(op => op.name === newStep.step_name\)/);
  assert.doesNotMatch(panel, /placeholder="Usinagem"/);
});
