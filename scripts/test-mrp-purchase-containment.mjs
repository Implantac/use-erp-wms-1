import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const page = readFileSync(new URL('../src/modules/production/MRPPage.tsx', import.meta.url), 'utf8');
const tab = readFileSync(new URL('../src/modules/production/mrp/MRPPurchaseTab.tsx', import.meta.url), 'utf8');
test('MRP líquido gera compra somente pela RPC transacional idempotente', () => {
  assert.equal(existsSync(new URL('../src/modules/production/mrp/useMRPPurchaseOrder.ts', import.meta.url)), false);
  assert.doesNotMatch(page, /useMRPPurchaseOrder|handleGeneratePurchaseOrder/);
  assert.match(tab, /generateMrpPurchaseOrder/);
  assert.match(tab, /createClientIdempotencyKey/);
  assert.match(tab, /Necessidade líquida/);
  assert.doesNotMatch(tab, /\.insert\(/);
});
