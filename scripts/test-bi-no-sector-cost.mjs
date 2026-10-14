import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../src/modules/production/bi/${path}`, import.meta.url), 'utf8');
test('sector activity does not claim money, productivity or approved reject target', () => {
  const tab = read('CostTab.tsx');
  const hook = read('useBIMetrics.ts');
  assert.doesNotMatch(tab, /Min\/Peça|Eficiência|Meta 5%|Custo por Setor|Refugo por Setor/);
  assert.doesNotMatch(hook, /costPerUnit|costBySector/);
  assert.match(tab, /Horas informadas por setor/);
  assert.match(read('BIScorecards.tsx'), /Carga média cadastrada/);
});
