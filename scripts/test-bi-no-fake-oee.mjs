import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../src/modules/production/bi/${path}`, import.meta.url), 'utf8');
test('BI does not calculate or present OEE from OP estimates and quantities', () => {
  assert.doesNotMatch(read('useBIMetrics.ts'), /const (availability|performance|quality|oee)\s*=/);
  assert.match(read('BIScorecards.tsx'), /title="OEE Global" value="—"/);
  assert.doesNotMatch(read('OEETab.tsx'), /oee\.toFixed|World Class|value: availability/);
  assert.match(read('OEETab.tsx'), /registros OEE por empresa/);
});
