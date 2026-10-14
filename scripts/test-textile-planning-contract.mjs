import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
test('woven and knitted paths are distinct planning metadata, not stock writes', () => {
  const profile = read('src/config/industrialProfile.ts');
  const bom = read('src/modules/production/productionOrders/OrderBomTab.tsx');
  assert.match(profile, /knitting: 'Malharia \(malha\)'/);
  assert.match(profile, /woven: \['fiber_preparation', 'spinning', 'weaving', 'dyeing', 'finishing'\]/);
  assert.match(profile, /knitted: \['fiber_preparation', 'spinning', 'knitting', 'dyeing', 'finishing'\]/);
  assert.match(bom, /Consulta sem edição, reserva ou baixa/);
  assert.doesNotMatch(bom, /Ao concluir a OP, cada material é baixado|A conclusão dará entrada apenas/);
});
