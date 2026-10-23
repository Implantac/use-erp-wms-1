import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const hook = read('src/hooks/system/useTimeEntries.ts');
const terminal = read('src/modules/production/OperatorTerminal.tsx');
const entries = read('src/modules/production/TimeEntries.tsx');
const kpis = read('src/modules/production/timeEntries/TimeEntriesKPIs.tsx');
test('status compare-and-swap scopes to company and row', () => {
  assert.match(hook, /\.eq\('id', id\)\.eq\('company_id', companyId\)/);
  assert.match(hook, /query = query\.eq\('status', expectedStatus\)/);
  assert.match(hook, /!data\?\.length/);
});
test('both entry screens check transition success and do not directly add to OP totals', () => {
  for (const source of [terminal, entries]) {
    assert.match(source, /\{ status: 'paused' \}, 'started'\)/);
    assert.match(source, /if \(!finished\) (?:return|\{)|if \(!await update\(entry\.id, \{ status: 'completed'/);
    assert.doesNotMatch(source, /produced_quantity: order\.produced_quantity \+/);
  }
});
test('mixed-unit quantities are not displayed in aggregate KPIs', () => {
  assert.doesNotMatch(entries, /totalProduced|totalRejected/);
  assert.doesNotMatch(kpis, /Produzidos Hoje|Peças boas|Rejeitados Hoje/);
});
