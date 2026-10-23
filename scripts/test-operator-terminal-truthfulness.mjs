import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const terminal = source('src/modules/production/OperatorTerminal.tsx');
const active = source('src/modules/production/operator-terminal/ActiveProductionCard.tsx');
const summary = source('src/modules/production/operator-terminal/ShiftSummaryCard.tsx');
const hook = source('src/hooks/system/useTimeEntries.ts');
test('unmeasured duration and incompatible quantity totals are not presented as productivity', () => {
  assert.doesNotMatch(terminal, /const elapsedSec|todayProduced|todayPcsH|realized_time_minutes:/);
  assert.match(active, /Tempo líquido não mensurado/);
  assert.match(summary, /unidades distintas/);
});
test('alert insertion errors and failed pauses cannot be reported as success', () => {
  assert.match(terminal, /if \(alertError\)/);
  assert.match(terminal, /if \(!await update\(currentEntry.id, \{ status: 'paused' \}, 'started'\)\)/);
  assert.match(terminal, /NÃO foi pausado/);
});
test('time entry mutations return success before dependent actions', () => {
  assert.match(hook, /return false;/);
  assert.match(hook, /return true;/);
  assert.match(terminal, /if \(!created\) \{/);
  assert.match(terminal, /if \(!finished\) \{/);
});
