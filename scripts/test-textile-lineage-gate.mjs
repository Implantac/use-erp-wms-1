import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hook = read('src/hooks/production/useProductionLogs.ts');
const page = read('src/modules/production/ProductionTraceability.tsx');
const ddl = read('docs/governance/sql/DRAFT_textile_lineage_contract.sql');
test('legacy log view is company scoped and cannot claim complete recall or mixed-unit totals', () => {
  assert.match(hook, /\.eq\('company_id', companyId\)/);
  assert.match(hook, /loadedCompanyId === companyId \? logs : \[\]/);
  assert.match(page, /Últimos 200 logs da empresa ativa/);
  assert.doesNotMatch(page, /Histórico completo|Peças Registradas|totalPieces/);
  assert.match(page, /\{hasCompany && !loadError && <>/);
});
test('lineage schema draft references existing lots but cannot deploy by migration scan', () => {
  assert.match(ddl, /REFERENCES public\.stock_lots\(id\)/);
  assert.match(ddl, /UNIQUE \(stock_lot_id\)/);
  assert.match(ddl, /ENABLE ROW LEVEL SECURITY/);
  assert.doesNotMatch(ddl, /CREATE POLICY|GRANT ALL|DELETE FROM public\.stock_lots/);
});
