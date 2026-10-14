import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
test('PCP counts orders rather than summing different product quantities as efficiency', () => {
  assert.doesNotMatch(read('lib/pcp/metrics.ts'), /totalProduced|totalPlanned|efficiency: Math/);
  assert.doesNotMatch(read('lib/pcp/types.ts'), /completedSampleSize|efficiency: number/);
  assert.match(read('components/production/PCPKPIPanel.tsx'), /OPs concluídas hoje/);
  assert.doesNotMatch(read('components/production/PCPKPIPanel.tsx'), /Produzido \/ planejado|metrics\.efficiency/);
});
