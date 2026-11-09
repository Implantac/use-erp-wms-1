import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, CONFIG, REPORTER, WORKFLOW, PUBLIC_ASSERT, EXPECTED_SPEC_COUNT,
  globToRe, parseConfig, resolveSpecs, requiredNames, scanSpec,
  checkGate, collectWarnings, WEAK_PATTERNS,
} from './validate-e2e-no-skip.mjs';

const read = (p) => fs.readFileSync(p, 'utf8');
const listSpecs = () => {
  const out = [];
  for (const dir of ['tests/e2e', 'e2e/tests']) {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (e.isFile() && /\.(spec|test)\.ts$/.test(e.name)) out.push(`${dir}/${e.name}`);
    }
  }
  return out;
};
const FILES = listSpecs();
const CONFIG_TEXT = read(CONFIG);
const { testMatch, testIgnore } = parseConfig(CONFIG_TEXT);
const SPECS = resolveSpecs(testMatch, testIgnore, FILES);
const SOURCES = Object.fromEntries(SPECS.map((s) => [s, read(path.join(ROOT, s))]));
const GOOD = {
  config: CONFIG_TEXT, workflow: read(WORKFLOW), reporter: read(REPORTER),
  publicAssert: read(PUBLIC_ASSERT), specs: SPECS, sources: SOURCES,
};
const mutate = (patch) => checkGate({ ...GOOD, ...patch });

test('globToRe trata ** / como opcional e * como um segmento', () => {
  assert.ok(globToRe('e2e/tests/**/*.test.ts').test('e2e/tests/navigation.test.ts'));
  assert.ok(globToRe('tests/e2e/**/*.spec.ts').test('tests/e2e/store-journey.spec.ts'));
  assert.ok(globToRe('tests/e2e/isolated-*.spec.ts').test('tests/e2e/isolated-store-chain.spec.ts'));
  assert.ok(!globToRe('tests/e2e/isolated-*.spec.ts').test('tests/e2e/store-journey.spec.ts'));
  assert.ok(!globToRe('e2e/tests/**/*.test.ts').test('tests/e2e/foo.test.ts'));
});

test('parseConfig le testMatch/testIgnore do config real sem duplicar a lista', () => {
  assert.equal(testMatch.length, 2);
  assert.equal(testIgnore.length, 4);
  assert.ok(testIgnore.includes('tests/e2e/isolated-*.spec.ts'));
});

test('resolveSpecs deriva exatamente os 6 specs do job autenticado', () => {
  assert.equal(SPECS.length, EXPECTED_SPEC_COUNT);
  assert.ok(SPECS.includes('e2e/tests/navigation.test.ts'));
  assert.ok(SPECS.includes('tests/e2e/logistic-fiscal-correlation.spec.ts'));
  assert.ok(!SPECS.some((s) => s.includes('isolated-')));
  assert.ok(!SPECS.some((s) => s.includes('golden-path')));
});

test('requiredNames continua com 18 segredos e sem E2E_REQUIRE_ALL', () => {
  const names = requiredNames(GOOD.workflow);
  assert.equal(names.length, 18);
  assert.ok(!names.includes('E2E_REQUIRE_ALL'));
});

test('integracao: o gate real passa em todos os invariantes', () => {
  assert.deepEqual(checkGate(GOOD).problems, []);
});

test('gate reprova perda do testIgnore dos specs isolados', () => {
  const config = CONFIG_TEXT.replace("    'tests/e2e/isolated-*.spec.ts',\n", '');
  assert.ok(mutate({ config }).problems.some((p) => p.includes('testIgnore')));
});

test('gate reprova remocao do reporter anti-skip ou da sua condicao', () => {
  assert.ok(mutate({ config: CONFIG_TEXT.replace('./fail-on-skipped-reporter.ts', './outro.ts') }).problems
    .some((p) => p.includes('reporter anti-skip nao configurado')));
  assert.ok(mutate({ config: CONFIG_TEXT.replace("E2E_REQUIRE_ALL === '1'", "E2E_REQUIRE_ALL === '0'") }).problems
    .some((p) => p.includes('condicionado')));
  assert.ok(mutate({ reporter: GOOD.reporter.replace('!this.executed', 'false') }).problems
    .some((p) => p.includes('reporter: nao reprova')));
});

test('gate reprova E2E_REQUIRE_ALL ausente do workflow ou promovido a segredo', () => {
  assert.ok(mutate({ workflow: GOOD.workflow.replace("E2E_REQUIRE_ALL: '1'", "E2E_REQUIRE_ALL: '0'") }).problems
    .some((p) => p.includes('E2E_REQUIRE_ALL=1 ausente')));
  assert.ok(mutate({ workflow: GOOD.workflow.replace('E2E_WEAVING_LOT_ID;', 'E2E_WEAVING_LOT_ID E2E_REQUIRE_ALL;') }).problems
    .some((p) => p.includes('nao e segredo')));
});

test('gate reprova comando trocado e perda do piso do smoke publico', () => {
  assert.ok(mutate({ workflow: GOOD.workflow.replace('run: bun run e2e:critical', 'run: bun run e2e') }).problems
    .some((p) => p.includes('e2e:critical ausente')));
  assert.ok(mutate({ publicAssert: GOOD.publicAssert.replace('expected < 3', 'expected < 0') }).problems
    .some((p) => p.includes('expected>=3')));
});

test('gate reprova completude: spec removido, spec sem assercao e spec vazio', () => {
  assert.ok(mutate({ specs: SPECS.slice(0, 5) }).problems.some((p) => p.includes('completude')));
  const sources = { ...SOURCES, [SPECS[0]]: "import { test } from '@playwright/test'; test('x', async () => {});" };
  assert.ok(mutate({ sources }).problems.some((p) => p.includes('sem nenhuma assercao')));
  const missing = { ...SOURCES }; delete missing[SPECS[0]];
  assert.ok(mutate({ sources: missing }).problems.some((p) => p.includes('spec ausente')));
});

test('scanSpec detecta reticencias literais, ramo condicional, espera fixa e skip', () => {
  const weak = scanSpec(read(path.join(ROOT, 'tests/e2e/logistic-fiscal-correlation.spec.ts')));
  assert.ok(weak.warnings.some((w) => w.label.includes('reticencias')));
  assert.ok(weak.warnings.some((w) => w.label.includes('espera fixa')));
  const nav = scanSpec(read(path.join(ROOT, 'e2e/tests/navigation.test.ts')));
  assert.ok(nav.warnings.some((w) => w.label.includes('ramo condicional')));
  const ui = scanSpec(read(path.join(ROOT, 'tests/e2e/store-journey-ui.spec.ts')));
  assert.ok(ui.warnings.some((w) => w.label.includes('skip condicional')));
});

test('scanSpec detecta parênteses aninhados dentro do if e only/fixme', () => {
  const s = "test('x', async () => { if (!page.url().includes('login')) { await expect(page).toHaveURL(/x/); } });";
  assert.ok(scanSpec(s).warnings.some((w) => w.label.includes('ramo condicional')));
  assert.ok(scanSpec("test.only('x', async () => { expect(1).toBe(1); });").warnings
    .some((w) => w.label.includes('only/fixme')));
});

test('scanSpec considera spec limpo sem avisos', () => {
  const clean = "test('a', async () => { await expect(page).toHaveURL(/x/); expect(1).toBe(1); });";
  const s = scanSpec(clean);
  assert.equal(s.tests, 1);
  assert.equal(s.expects, 2);
  assert.deepEqual(s.warnings, []);
});

test('collectWarnings lista a divida conhecida dos arquivos reais', () => {
  const w = collectWarnings(SPECS, SOURCES);
  assert.ok(w.some((x) => x.includes('logistic-fiscal-correlation') && x.includes('reticencias')));
  assert.ok(w.some((x) => x.includes('navigation.test.ts') && x.includes('condicional')));
  assert.equal(collectWarnings(['x.ts'], { 'x.ts': "test('a', () => { expect(1).toBe(1); });" }).length, 0);
});

test('WEAK_PATTERNS cobre 5 classes de falso verde', () => {
  assert.equal(WEAK_PATTERNS.length, 5);
});
