import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = name => readFileSync(new URL(`../src/modules/production/${name}.tsx`, import.meta.url), 'utf8');

test('SpinningDashboard não anuncia métricas sem fonte', () => {
  const source = read('SpinningDashboard');
  assert.match(source, /UnmeasuredMetrics/);
  assert.doesNotMatch(source, /\d+(?:[.,]\d+)?\s*(?:%|kWh|m\b|min\b)/);
});

test('WeavingDashboard não anuncia métricas sem fonte', () => {
  const source = read('WeavingDashboard');
  assert.match(source, /consultas reais/);
  assert.match(source, /Sem fonte suficiente|em vez de estimar/);
  assert.match(source, /OPs de tecelagem ativas|OPs ativas \(sem marca tecelagem\)/);
  assert.doesNotMatch(source, /title="OEE|title="Eficiência|metros\/hora/);
});

test('TextileDashboard não anuncia métricas sem fonte', () => {
  const source = read('TextileDashboard');
  assert.match(source, /contagens reais/);
  assert.match(source, /não estima eficiência/);
  assert.match(source, /Sem dados suficientes|sem dados suficientes/);
  assert.doesNotMatch(source, /title="OEE|title="Eficiência/);
});
