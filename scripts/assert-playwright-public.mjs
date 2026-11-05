#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const reportPath = process.argv[2] ?? 'e2e/test-results/public-results.json';
let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`[public-e2e] cannot read JSON report ${reportPath}: ${error.message}`);
  process.exit(2);
}

const stats = report.stats ?? {};
const expected = Number(stats.expected ?? 0);
const skipped = Number(stats.skipped ?? 0);
const unexpected = Number(stats.unexpected ?? 0);
const flaky = Number(stats.flaky ?? 0);

console.log(
  `[public-e2e] expected=${expected}, skipped=${skipped}, unexpected=${unexpected}, flaky=${flaky}`,
);

if (expected < 3 || skipped !== 0 || unexpected !== 0 || flaky !== 0) {
  console.error('[public-e2e] incomplete or unsuccessful smoke suite; refusing a vacuous success');
  process.exit(1);
}
