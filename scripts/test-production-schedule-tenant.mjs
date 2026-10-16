import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const hook = read('src/hooks/production/useProductionSchedule.ts');
const page = read('src/modules/production/ProductionSchedule.tsx');
test('schedule reads and mutations are scoped to the selected company', () => {
  assert.match(hook, /\.eq\('company_id', companyId\)\.order\('planned_start'/);
  assert.match(hook, /company_id: companyId, production_order_id:/);
  assert.match(hook, /\.eq\('id', id\)\.eq\('company_id', companyId\)\.eq\('status', current\.status\)/);
  assert.match(hook, /loadedCompanyId === companyId \? schedules : \[\]/);
});
test('creation validates OP ownership, dates and observes write result', () => {
  assert.match(hook, /end <= start/);
  assert.match(hook, /\.eq\('id', schedule\.production_order_id\)\.eq\('company_id', companyId\)/);
  assert.match(hook, /\.eq\('production_order_id', schedule\.production_order_id\)\.limit\(1\)/);
  assert.match(hook, /if \(error \|\| !data\?\.length\)/);
  assert.match(page, /if \(!await create\(/);
});
test('schedule actions cannot present completion of a production order', () => {
  assert.match(hook, /action: 'start' \| 'end'/);
  assert.match(hook, /\.eq\('updated_at', current\.updated_at\)/);
  assert.match(page, /Encerrar janela/);
  assert.match(page, /não conclui a OP/);
  assert.doesNotMatch(page, /updateOrder\(/);
});
test('read failure is visible rather than reported as an empty schedule', () => {
  assert.match(hook, /setLoadError\(true\)/);
  assert.match(page, /\{hasCompany && !loadError && <>/);
  assert.match(page, /Falha na leitura da programação/);
});
