import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(`../src/modules/production/productionOrders/${path}`, import.meta.url), 'utf8');
test('OP detail does not edit shared product BOM or invent per-order material need', () => {
  const bom = read('OrderBomTab.tsx');
  const detail = read('OrderDetailDialog.tsx');
  assert.doesNotMatch(bom, /useMutation|\.insert\(|\.delete\(|\.update\(|\* quantity|por peça|Qtd\/peça/);
  assert.match(bom, /Estrutura <strong>atual do produto<\/strong>, não revisão congelada desta OP/);
  assert.match(bom, /Qtd\. cadastrada:/);
  assert.match(detail, /<OrderBomTab productId=\{order.product_id\} \/>/);
});
