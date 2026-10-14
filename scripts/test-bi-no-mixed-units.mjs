import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../src/modules/production/bi/${file}`, import.meta.url), 'utf8');
test('BI does not aggregate heterogeneous OP and time-entry quantities', () => {
  assert.doesNotMatch(read('useBIMetrics.ts'), /totalProduced|totalRejected|scrapRate/);
  assert.doesNotMatch(read('productionTrend.ts'), /produced_quantity|rejected_quantity|yieldRate|pcsH/);
  assert.doesNotMatch(read('ExecutiveTab.tsx') + read('TrendTab.tsx'), /Peças\/h|dataKey="produced"|dataKey="rejected"|dataKey="yieldRate"/);
  assert.match(read('TrendTab.tsx'), /inclui pausas/);
});
