#!/usr/bin/env node
/**
 * QA-07 — auditoria ANTI-FALSO-VERDE do job `authenticated`.
 *
 * Pergunta que este script responde: "quando os 18 segredos existirem, o job
 * vai rodar TESTES DE VERDADE, ou pode anunciar sucesso com testes ausentes,
 * ignorados ou vacuamente verdes?"
 *
 * E puramente ESTATICO: nao executa Playwright, nao precisa de segredo, nao
 * sobe servidor, nao altera specs/config/workflow e nao imprime valores.
 *
 *   node scripts/validate-e2e-no-skip.mjs            # invariantes (exit 2 se violados)
 *   node scripts/validate-e2e-no-skip.mjs --strict   # trata divida conhecida como erro
 *
 * NAO esta no CI e NAO substitui `bun run e2e:critical` com E2E_REQUIRE_ALL=1.
 * A lista de specs e DERIVADA de e2e/playwright.config.ts (testMatch/testIgnore),
 * nao duplicada. As funcoes puras sao testadas em validate-e2e-no-skip.test.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const CONFIG = path.join(ROOT, 'e2e/playwright.config.ts');
export const REPORTER = path.join(ROOT, 'e2e/fail-on-skipped-reporter.ts');
export const WORKFLOW = path.join(ROOT, '.github/workflows/e2e.yml');
export const PUBLIC_ASSERT = path.join(ROOT, 'scripts/assert-playwright-public.mjs');

/** Numero de specs que o job autenticado DEVE coletar (congelado em QA-07). */
export const EXPECTED_SPEC_COUNT = 6;

/** Converte glob simples (com `** /`) em RegExp ancorada. */
export function globToRe(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = escaped
    .replace(/\*\*\//g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\u0001/g, '(?:.*/)?');
  return new RegExp(`^${body}$`);
}

/** Extrai os arrays `testMatch` / `testIgnore` do config do Playwright. */
export function parseConfig(config) {
  const arrayOf = (name) => {
    const m = new RegExp(`${name}:\\s*\\[([\\s\\S]*?)\\]`).exec(config ?? '');
    return m ? [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]) : [];
  };
  return { testMatch: arrayOf('testMatch'), testIgnore: arrayOf('testIgnore') };
}

/** Resolve quais arquivos o job autenticado coletaria. */
export function resolveSpecs(testMatch, testIgnore, files) {
  const match = testMatch.map(globToRe);
  const ignore = testIgnore.map(globToRe);
  return files
    .filter((f) => match.some((re) => re.test(f)) && !ignore.some((re) => re.test(f)))
    .sort();
}

/** Nomes exigidos pelo step 4 (uma unica fonte de verdade). */
export function requiredNames(workflow) {
  const m = /for name in ([^;]+); do/.exec(workflow ?? '');
  if (!m) throw new Error('lista de segredos nao encontrada em e2e.yml');
  return m[1].trim().split(/\s+/).filter((n) => n !== 'E2E_REQUIRE_ALL');
}

/** Padroes que permitem um teste passar sem validar o que promete. */
export const WEAK_PATTERNS = [
  ['assercao contra reticencias literais', /\.toContain\(\s*['"]\.{3}['"]\s*\)/],
  ['assercao dentro de ramo condicional (verificar caminho sem assercao)', /if\s*\((?:[^()]|\([^()]*\))*\)\s*\{[\s\S]{0,800}?expect\(/],
  ['espera fixa por tempo (flaky)', /waitForTimeout\(\s*\d+\s*\)/],
  ['skip condicional por configuracao', /test\.skip\(\s*!/],
  ['only/fixme que reduz a suite', /(?:test|describe)\.(?:only|fixme)\s*\(/],
];

/** Varre um spec e devolve os avisos de divida conhecida. */
export function scanSpec(text) {
  const found = [];
  for (const [label, re] of WEAK_PATTERNS) {
    const hits = [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
    if (hits.length) found.push({ label, count: hits.length });
  }
  return {
    tests: (text.match(/\b(?:test|it)\s*\(/g) || []).length,
    expects: (text.match(/\bexpect\s*\(/g) || []).length,
    warnings: found,
  };
}

/** Invariantes duros: se qualquer um falhar, o gate pode ficar verde por vacuidade. */
export function checkGate({ config, workflow, reporter, publicAssert, specs, sources }) {
  const p = [];
  const { testMatch, testIgnore } = parseConfig(config);
  if (!testMatch.length) p.push('config: testMatch ausente ou vazio');
  if (!testIgnore.some((g) => g.includes('isolated-'))) {
    p.push('config: testIgnore nao exclui os specs isolados (apontaria para homologacao)');
  }
  if (!config.includes('fail-on-skipped-reporter.ts')) p.push('config: reporter anti-skip nao configurado');
  if (!config.includes("E2E_REQUIRE_ALL === '1'")) p.push('config: reporter anti-skip nao esta condicionado a E2E_REQUIRE_ALL');
  if (!config.includes('forbidOnly')) p.push('config: forbidOnly ausente');
  if (!/E2E_REQUIRE_ALL:\s*'1'/.test(workflow)) p.push('workflow: E2E_REQUIRE_ALL=1 ausente do step autenticado');
  if (!/run:\s*bun run e2e:critical/.test(workflow)) p.push('workflow: comando e2e:critical ausente');
  const names = requiredNames(workflow);
  if (names.length !== 18) p.push(`workflow: esperados 18 segredos, encontrados ${names.length}`);
  // Checa a lista CRUA: requiredNames() filtra o literal, entao perguntar a
  // ele seria tautologico. O erro e o literal ENTRAR no for do step 4.
  const rawFor = /for name in ([^;]+); do/.exec(workflow)?.[1] ?? '';
  if (/\bE2E_REQUIRE_ALL\b/.test(rawFor)) p.push('workflow: E2E_REQUIRE_ALL nao e segredo');
  if (!/status === 'skipped'/.test(reporter) || !/!this\.executed/.test(reporter)) {
    p.push('reporter: nao reprova skip nem execucao vazia');
  }
  if (!/expected\s*<\s*3/.test(publicAssert)) p.push('smoke publico: piso de contagem (expected>=3) ausente');
  if (specs.length !== EXPECTED_SPEC_COUNT) {
    p.push(`completude: esperados ${EXPECTED_SPEC_COUNT} specs no job autenticado, resolvidos ${specs.length}`);
  }
  if (specs.some((s) => s.includes('isolated-'))) p.push('completude: spec isolado vazou para o job autenticado');
  for (const spec of specs) {
    const text = sources?.[spec];
    if (text == null) { p.push(`spec ausente: ${spec}`); continue; }
    const scan = scanSpec(text);
    if (!scan.tests) p.push(`spec sem nenhum test(): ${spec}`);
    if (!scan.expects) p.push(`spec sem nenhuma assercao: ${spec}`);
  }
  return { problems: p, names, specs };
}

/** Avidos de divida conhecida; nao sao erro por padrao (nao corrigidos sem autorizacao). */
export function collectWarnings(specs, sources) {
  const out = [];
  for (const spec of specs) {
    for (const w of scanSpec(sources?.[spec] ?? '').warnings) {
      out.push(`${spec}: ${w.label}${w.count > 1 ? ` (${w.count}x)` : ''}`);
    }
  }
  return out;
}

function main() {
  const read = (f) => fs.readFileSync(f, 'utf8');
  const walk = (dir, prefix = '') => {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), rel));
      else if (/\.(spec|test)\.ts$/.test(e.name)) out.push(rel);
    }
    return out;
  };
  const files = [
    ...walk(path.join(ROOT, 'tests/e2e'), 'tests/e2e'),
    ...walk(path.join(ROOT, 'e2e/tests'), 'e2e/tests'),
  ];
  const config = read(CONFIG);
  const { testMatch, testIgnore } = parseConfig(config);
  const specs = resolveSpecs(testMatch, testIgnore, files);
  const sources = Object.fromEntries(specs.map((s) => [s, read(path.join(ROOT, s))]));
  const { problems, names } = checkGate({
    config, workflow: read(WORKFLOW), reporter: read(REPORTER),
    publicAssert: read(PUBLIC_ASSERT), specs, sources,
  });
  const warnings = collectWarnings(specs, sources);
  for (const w of warnings) console.warn(`[divida conhecida] ${w}`);
  if (problems.length) {
    for (const problem of problems) console.error(`::error::${problem}`);
    console.error(`[e2e-no-skip] ${problems.length} invariante(s) violado(s).`);
    return 2;
  }
  if (process.argv.includes('--strict') && warnings.length) {
    console.error(`[e2e-no-skip] --strict: ${warnings.length} divida(s) nao corrigida(s).`);
    return 2;
  }
  console.log(`[e2e-no-skip] OK: ${specs.length} specs resolvidos a partir do config, ` +
    `${names.length} segredos no gate, reporter anti-skip ligado a E2E_REQUIRE_ALL. ` +
    `${warnings.length} divida(s) conhecida(s) listada(s) acima — NAO corrigidas sem autorizacao. ` +
    'Validacao ESTATICA; nao substitui bun run e2e:critical com skip=0.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
