import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/lib/pcp/mrp.ts', import.meta.url), 'utf8');
test('MRP compartilhado não recomenda compra automática a partir do saldo bruto', () => {
  assert.doesNotMatch(source, /Gere pedido de compra urgente|compras necessárias|Priorize compras ou redistribua/);
  assert.match(source, /type: 'alert',[\s\S]*baixa cobertura bruta estimada/);
  assert.match(source, /sem reservas, bloqueios ou conversões/);
  assert.match(source, /sev\[a\.severity\] \?\? 2/);
});
