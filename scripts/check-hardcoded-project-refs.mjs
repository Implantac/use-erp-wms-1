#!/usr/bin/env node
// SEC-02 — gate estatico. Nenhum identificador de projeto, JWT ou token de
// acesso pode voltar a ser gravado em codigo versionado. Executado no CI.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
// Montado em runtime para que este proprio arquivo nao contenha o literal.
const LEGACY_REF = ['arcuhq', 'diydlvekanychw'].join('');
const PATTERNS = [
  ['ref de projeto legado', new RegExp(LEGACY_REF, 'i')],
  ['JWT embutido', /eyJ[A-Za-z0-9_-]{20,}/],
  ['token de acesso GitHub', /ghp_[A-Za-z0-9]{20,}/],
];
const DIRS = ['supabase', 'src', 'scripts', 'tests', '.github', 'infra', '.lovable', 'docs', 'public'];
const ROOT_FILES = ['.env.example', 'config.toml'];
const EXTS = /\.(sql|ts|tsx|js|mjs|cjs|json|yml|yaml|toml|md|sh|py|example)$/i;
const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'coverage', '.cache', 'vendor', '__pycache__',
]);
// Excecao declarada e auditavel (06/11/2026): unico arquivo autorizado a
// conter a URL e a chave PUBLICA anon do projeto. Todo o restante de public/
// continua varrido. Ver docs/ENVIRONMENT.md secao 0.2. Nunca ampliar esta lista.
const SKIP_FILES = new Set([
  'scripts/check-hardcoded-project-refs.mjs',
  'public/config.js',
]);

const files = [];
function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
    } else if (entry.isFile() && (EXTS.test(entry.name) || entry.name.startsWith('.env'))) {
      files.push(full);
    }
  }
}
for (const dir of DIRS) walk(join(ROOT, dir));
for (const file of ROOT_FILES) {
  const full = join(ROOT, file);
  if (existsSync(full)) files.push(full);
}

const hits = [];
for (const full of files) {
  const rel = relative(ROOT, full).split(sep).join('/');
  if (SKIP_FILES.has(rel)) continue;
  let text;
  try {
    text = readFileSync(full, 'utf8');
  } catch {
    continue;
  }
  for (const [label, pattern] of PATTERNS) {
    if (pattern.test(text)) hits.push(`${rel}: ${label}`);
  }
}

if (hits.length) {
  console.error('SEC-02 FALHOU: credenciais ou referencias de projeto fixas no repositorio:');
  for (const hit of hits) console.error(`  - ${hit}`);
  process.exit(1);
}
console.log(`SEC-02: ${files.length} arquivos verificados, 0 referencias fixas.`);
