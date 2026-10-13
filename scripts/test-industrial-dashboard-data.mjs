import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

for (const name of ['SpinningDashboard', 'WeavingDashboard', 'TextileDashboard']) {
  test(`${name} não anuncia métricas sem fonte`, () => {
    const source = readFileSync(new URL(`../src/modules/production/${name}.tsx`, import.meta.url), 'utf8');
    assert.match(source, /UnmeasuredMetrics/);
    assert.doesNotMatch(source, /\d+(?:[.,]\d+)?\s*(?:%|kWh|m\b|min\b)/);
  });
}
