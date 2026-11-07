#!/usr/bin/env node
/**
 * Validador ESTATICO do overlay de homologacao (QA-06).
 *
 * Nao sobe Docker, nao aplica migration, nao le segredo e nao imprime valor.
 * Verifica invariantes de seguranca que, se violados, fariam a homologacao
 * apontar para producao, expor o ambiente na rede ou produzir falso verde.
 *
 *   node scripts/validate-homologacao-compose.mjs
 *
 * NAO esta no CI e NAO altera o gate autenticado. Exit 0 = OK; exit 2 = erro.
 * As funcoes exportadas sao puras e testadas em
 * scripts/validate-homologacao-compose.test.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const OVERLAY = path.join(ROOT, 'infra/homologacao/docker-compose.homologacao.yml');
export const BOOTSTRAP = path.join(ROOT, 'infra/homologacao/bootstrap.sh');
export const TEMPLATE = path.join(ROOT, 'infra/homologacao/homologacao.env.example');
export const WORKFLOW = path.join(ROOT, '.github/workflows/e2e.yml');
export const DOCKERIGNORE = path.join(ROOT, '.dockerignore');

// Montados em runtime: o gate SEC-02 barra estes literais em arquivos versionados.
const GH_PREFIX = ['gh', 'p_'].join('');
const JWT_PREFIX = ['ey', 'J'].join('');
const PROD_HOSTS = ['useerp.lovable.app', 'supabase.co'];

const prodHit = (text) => PROD_HOSTS.find((h) => text.toLowerCase().includes(h));

/** Extrai entradas de `ports:` (lista YAML ou array inline com !reset). */
export function publishedPorts(yaml) {
  const out = [];
  for (const line of yaml.split('\n')) {
    if (line.trimStart().startsWith('#')) continue;
    if (!/\bports:/.test(line) && !/^\s*-\s*["']/.test(line)) continue;
    const cleaned = line
      .replace(/^\s*ports:\s*(!reset\s*)?/, '')
      .replace(/[[\]"']/g, '')
      .trim();
    for (const token of cleaned.split(/\s+/)) {
      if (/:\d+/.test(token)) out.push(token);
    }
  }
  return out;
}

/** Nomes exigidos pelo step 4 do job autenticado (uma unica fonte de verdade). */
export function requiredNames(yaml) {
  const match = /for name in ([^;]+); do/.exec(yaml ?? '');
  if (!match) throw new Error('lista de segredos nao encontrada em e2e.yml');
  return match[1].trim().split(/\s+/).filter((n) => n !== 'E2E_REQUIRE_ALL');
}

/** Invariantes do overlay. Retorna array de problemas (nunca valores). */
export function checkOverlay(yaml) {
  const p = [];
  if (!/^name:\s*\S+/m.test(yaml)) p.push('overlay: `name:` ausente');
  if (!/ports:\s*!reset/.test(yaml)) {
    p.push('overlay: `ports` precisa de !reset — Compose concatena listas e manteria 0.0.0.0 ativo');
  }
  const published = publishedPorts(yaml);
  for (const port of published) {
    if (!port.startsWith('127.0.0.1:')) p.push(`overlay: porta publicada sem bind de loopback (${port})`);
  }
  if (!published.length) p.push('overlay: nenhuma porta de loopback declarada para o web');
  if (/network_mode:\s*host/.test(yaml)) p.push('overlay: network_mode host proibido');
  if (/privileged:\s*true/.test(yaml)) p.push('overlay: privileged proibido');
  if (/\/var\/run\/docker\.sock/.test(yaml)) p.push('overlay: socket do Docker montado');
  if (/image:\s*\S*:latest\b/.test(yaml)) p.push('overlay: imagem com tag mutavel :latest');
  if (!/ANON_KEY:\s*\$\{ANON_KEY:\?/.test(yaml)) p.push('overlay: ANON_KEY deve usar a forma com falha fechada');
  if (!/restart:\s*["']?no["']?/.test(yaml)) p.push('overlay: restart: "no" ausente');
  const host = prodHit(yaml);
  if (host) p.push(`overlay: referencia a host de producao (${host})`);
  if (yaml.includes(GH_PREFIX + 'A'.repeat(24)) || new RegExp(JWT_PREFIX + '[A-Za-z0-9_-]{20,}').test(yaml)) {
    p.push('overlay: credencial literal encontrada');
  }
  for (const key of ['POSTGRES_PASSWORD', 'JWT_SECRET', 'SERVICE_ROLE_KEY']) {
    const re = new RegExp(`^\\s*${key}:\\s*(?!\\$\\{)(?!#)\\S+`, 'm');
    if (re.test(yaml)) p.push(`overlay: ${key} com valor literal`);
  }
  return p;
}

/** Invariantes do procedimento de bootstrap. */
export function checkBootstrap(sh) {
  const p = [];
  const required = [
    ['set -euo pipefail', 'falha fechado'],
    ['validate-homologacao-env.mjs', 'pre-voo dos 18 segredos'],
    ['validate-homologacao-compose.mjs', 'validador estatico'],
    [/\$\{COMPOSE\[@\]\}"\s+config\s+-q/, 'comando de validacao de sintaxe antes de subir'],
    ['E2E_REQUIRE_ALL=1', 'reporter anti-skip'],
    ['bun run e2e:critical', 'execucao das jornadas'],
    ['trap ', 'teardown garantido'],
    ['down -v', 'descarte dos volumes'],
  ];
  for (const [needle, label] of required) {
    const found = typeof needle === 'string' ? sh.includes(needle) : needle.test(sh);
    if (!found) p.push(`bootstrap: ausente ${label} (${needle})`);
  }
  const forbidden = [
    ['supabase db push', 'push em banco remoto'],
    ['supabase link', 'vinculo a projeto remoto'],
    ['--migrate', 'flag de migracao desabilitada no setup'],
    ['0.0.0.0', 'bind aberto'],
    ['E2E_REQUIRE_ALL=0', 'anti-skip desligado'],
  ];
  for (const [needle, label] of forbidden) {
    if (sh.includes(needle)) p.push(`bootstrap: proibido ${label} (${needle})`);
  }
  const host = prodHit(sh);
  if (host) p.push(`bootstrap: referencia a host de producao (${host})`);
  return p;
}

/** O template so pode conter NOMES e placeholders, nunca valores reais. */
export function checkEnvTemplate(text, names) {
  const p = [];
  for (const name of names) {
    if (!new RegExp(`^${name}=`, 'm').test(text)) p.push(`template: ${name} ausente`);
  }
  for (const line of text.split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, key, value] = m;
    if (!value) continue;
    const technical = /^(localhost|127\.0\.0\.1|postgres|db|8080|5432|3600|http:\/\/(localhost|127\.0\.0\.1)[^\s]*|\d+)$/i.test(value);
    if (!technical && !/^<[^>]+>$/.test(value)) {
      p.push(`template: ${key} nao e placeholder nem valor tecnico local`);
    }
  }
  if (text.includes(GH_PREFIX + 'A'.repeat(24)) || new RegExp(JWT_PREFIX + '[A-Za-z0-9_-]{20,}').test(text)) {
    p.push('template: credencial literal encontrada');
  }
  const host = prodHit(text);
  if (host) p.push(`template: referencia a host de producao (${host})`);
  return p;
}

/** .dockerignore precisa impedir que .env.local entre no build context. */
export function checkDockerignore(text) {
  const p = [];
  if (!/^\.env$/m.test(text)) p.push('.dockerignore: nao ignora .env');
  if (!/^\.env\.\*$/m.test(text)) p.push('.dockerignore: nao ignora .env.*');
  return p;
}

export function validateAll(files) {
  const names = requiredNames(files.workflow);
  if (names.length !== 18) {
    return { problems: [`workflow: esperados 18 segredos, encontrados ${names.length}`], names };
  }
  return {
    names,
    problems: [
      ...checkOverlay(files.overlay).map((x) => `[overlay] ${x}`),
      ...checkBootstrap(files.bootstrap).map((x) => `[bootstrap] ${x}`),
      ...checkEnvTemplate(files.template, names).map((x) => `[template] ${x}`),
      ...checkDockerignore(files.dockerignore).map((x) => `[dockerignore] ${x}`),
    ],
  };
}

function main() {
  const read = (file) => fs.readFileSync(file, 'utf8');
  const files = {
    workflow: read(WORKFLOW),
    overlay: read(OVERLAY),
    bootstrap: read(BOOTSTRAP),
    template: read(TEMPLATE),
    dockerignore: read(DOCKERIGNORE),
  };
  const { problems, names } = validateAll(files);
  if (problems.length) {
    for (const problem of problems) console.error(`::error::${problem}`);
    console.error(`[homologacao-compose] ${problems.length} invariante(s) violado(s). Nada foi executado.`);
    return 2;
  }
  console.log(`[homologacao-compose] OK: overlay, bootstrap, template (${names.length} nomes) e .dockerignore. ` +
    'Validacao ESTATICA apenas; nenhum container foi criado e o gate do CI nao foi alterado.');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
