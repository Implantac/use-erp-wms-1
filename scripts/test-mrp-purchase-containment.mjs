import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const page = readFileSync(new URL('../src/modules/production/MRPPage.tsx', import.meta.url), 'utf8');
const tab = readFileSync(new URL('../src/modules/production/mrp/MRPPurchaseTab.tsx', import.meta.url), 'utf8');
test('projeção bruta não oferece criação insegura de pedido', () => {
  assert.equal(existsSync(new URL('../src/modules/production/mrp/useMRPPurchaseOrder.ts', import.meta.url)), false);
  assert.doesNotMatch(page, /useMRPPurchaseOrder|handleGeneratePurchaseOrder/);
  assert.match(tab, /Button size="sm" disabled/);
  assert.match(tab, /saldo bruto|Saldo bruto/);
  assert.doesNotMatch(tab, /onGenerate|\.insert\(/);
});
