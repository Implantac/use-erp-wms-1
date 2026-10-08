#!/usr/bin/env node
// USE ERP — verificação e preparação do ambiente.
// Uso: npm run setup            (verifica tudo)
//      npm run setup -- --migrate  (também aplica as migrations via psql + DATABASE_URL)
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const ok = (m) => console.log(`  ✔ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);
let failed = false;
const fail = (m) => { console.log(`  ✖ ${m}`); failed = true; };

console.log('\nUSE ERP — setup\n');

// 1. Node
const major = Number(process.versions.node.split('.')[0]);
major >= 18 ? ok(`Node ${process.versions.node}`) : fail(`Node ${process.versions.node} — requer 18 ou superior`);

// 2. Dependências
existsSync('node_modules') ? ok('Dependências instaladas') : fail('Dependências ausentes — rode "npm install"');

// 3. Variáveis
const env = {};
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  ok('.env encontrado');
} else fail('.env ausente — rode "cp .env.example .env" e preencha');
Object.assign(env, Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('VITE_') || k === 'DATABASE_URL')));

for (const key of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PROJECT_ID']) {
  env[key] ? ok(`${key} definida`) : fail(`${key} não definida`);
}
if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PROJECT_ID && !env.VITE_SUPABASE_URL.includes(env.VITE_SUPABASE_PROJECT_ID)) {
  warn('VITE_SUPABASE_PROJECT_ID não corresponde à URL informada');
}

// 4. Conexão
if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  try {
    const res = await fetch(`${env.VITE_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/health`, { headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY } });
    res.ok ? ok('Conexão com o Supabase') : fail(`Supabase respondeu ${res.status} — confira URL e chave`);
  } catch (e) { fail(`Não foi possível conectar ao Supabase: ${e.message}`); }
}

// 5. Migrations
const dir = 'supabase/migrations';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
ok(`${files.length} migrations encontradas`);
if (process.argv.includes('--migrate')) {
  if (!env.DATABASE_URL) fail('DATABASE_URL não definida — necessária para --migrate');
  else {
    try { execFileSync('psql', ['--version'], { stdio: 'ignore' }); } catch { fail('psql não encontrado — instale o cliente PostgreSQL ou use "supabase db push"'); }
    if (!failed) {
      for (const f of files) {
        process.stdout.write(`    aplicando ${f}... `);
        try {
          execFileSync('psql', [env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-f', join(dir, f)], { stdio: ['ignore', 'ignore', 'pipe'] });
          console.log('ok');
        } catch (e) { console.log('erro'); fail(`${f}: ${String(e.stderr || e.message).split('\n')[0]}`); break; }
      }
    }
  }
} else {
  warn('Migrations não aplicadas nesta execução. Use "npm run setup -- --migrate" ou "supabase db push" (ver docs/INSTALL.md)');
}

console.log(failed ? '\nSetup com pendências. Corrija os itens ✖ acima.\n' : '\nAmbiente pronto. Rode "npm run dev".\n');
process.exit(failed ? 1 : 0);
