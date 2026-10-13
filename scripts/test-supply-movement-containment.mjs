import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hook = readFileSync(new URL('../src/hooks/inventory/useSupplyStock.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/modules/production/SupplyStock.tsx', import.meta.url), 'utf8');
test('não registra movimento separado de saldo e não fecha diálogo em falha', () => {
  const block = hook.slice(hook.indexOf('const registerMovement = async'), hook.indexOf('const lowStockItems ='));
  assert.doesNotMatch(block, /\.insert\(|\.update\(/);
  assert.match(block, /return false/);
  assert.match(page, /if \(!saved\) return;\s*setMovementOpen\(false\)/);
  assert.match(page, /disabled title="Requer operação transacional de estoque homologada"/);
});
