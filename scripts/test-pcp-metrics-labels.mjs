import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
test('PCP dashboard does not label produced/planned ratio as OEE or capacity utilization', () => {
  const panel = read('components/production/PCPKPIPanel.tsx');
  const metrics = read('lib/pcp/metrics.ts');
  assert.doesNotMatch(panel, /entityKey="oee"|title="Eficiência"|Utilização Capacidade|Lead Time: Planejado vs Real/);
  assert.match(panel, /title="Produzido \/ planejado"/);
  assert.match(panel, /Sem OP concluída com início, fim e tempo previsto válidos/);
  assert.match(panel, /Previsto em horas de operação; decorrido em horas corridas/);
  assert.match(metrics, /getTime\(\) - new Date\(o.start_date!\).getTime\(\)/);
  assert.match(metrics, /ageMs >= 0 && ageMs <= 30/);
  assert.doesNotMatch(metrics, /differenceInDays\(new Date\(o.completed_date\), new Date\(o.start_date\)\) \* 8/);
});
