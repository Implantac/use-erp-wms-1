import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../src/modules/production/bi/${path}`, import.meta.url), 'utf8');
test('BI does not call catalog prices realized financial results', () => {
  const metrics = read('useBIMetrics.ts');
  assert.doesNotMatch(metrics, /totalRevenue|totalCostSum|grossProfit|scrapCostEstimate|revenuePerHour|paretoData/);
  for (const title of ['Receita Total', 'Lucro Bruto', 'Custo Refugo']) {
    assert.match(read('BIScorecards.tsx'), new RegExp(`title="${title}" value="—"`));
  }
  assert.match(read('ParetoTab.tsx'), /Pareto de lucro não apurado/);
  assert.doesNotMatch(read('ProfitTab.tsx'), /Lucro por Produto|Receita × Custo × Lucro/);
});
