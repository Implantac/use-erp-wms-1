import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync(new URL('../src/hooks/inventory/useSupplyStock.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/modules/production/SupplyStock.tsx', import.meta.url), 'utf8');
test('cadastro não cria saldo sem movimento e não anuncia êxito na falha', () => {
  const create = hook.slice(hook.indexOf('const createSupply ='), hook.indexOf('const updateSupply ='));
  assert.match(create, /supply\.current_quantity !== undefined && supply\.current_quantity !== 0/);
  assert.match(create, /\.\.\.supply,[\s\S]*current_quantity: 0,[\s\S]*total_value: 0/);
  assert.match(page, /if \(!created\) return;\s*setNewSupplyOpen\(false\)/);
  assert.match(page, /value=\{0\} disabled aria-describedby="supply-opening-balance-note"/);
});
