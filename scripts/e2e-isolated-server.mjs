#!/usr/bin/env node
/**
 * QA-01 — ambiente E2E isolado, repetivel e sem segredos.
 *
 * Sobe UM Postgres embarcado (o mesmo binario zonky usado pelo harness),
 * reaplica stubs + baseline + patches + TODAS as migrations + 99-local-final
 * + os tres seeds deterministicios, e expoe em 127.0.0.1 um subconjunto da
 * API Supabase (auth password grant, REST select e RPC). As requisicoes
 * executam SQL de verdade sob `SET LOCAL ROLE authenticated` e
 * `request.jwt.claims`, portanto RLS e funcoes de negocio sao reais — nao
 * ha mock de dados, nem rede externa, nem acesso a producao.
 *
 * O diretorio de dados e descartado a cada execucao: reset e reconstruir.
 * Uso: node scripts/e2e-isolated-server.mjs [--teardown]
 *
 * Nota de divida: o bootstrap do Postgres replica deliberadamente o do
 * harness.mjs. Extrair para um modulo comum e desejavel, mas alteraria o
 * gate de banco que hoje passa 249/249; nao foi feito nesta entrega.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import {
  assertLoopback, buildRpcCall, buildTableQuery, signJwt, verifyJwt,
} from './e2e-isolated-lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const HARNESS = path.join(REPO, 'tests', 'harness');
const NATIVE = path.join(HARNESS, 'node_modules/@embedded-postgres/linux-x64/native');
const BIN = path.join(NATIVE, 'bin');
const LIB = path.join(NATIVE, 'lib');
const DATA = path.join(HARNESS, 'data-e2e');
const ENV_FILE = path.join(REPO, '.env.e2e.generated');
const PGPORT = 55445;
const PORT = 54321;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ADMIN_EMAIL = 'etcsuporte889@gmail.com';
const ADMIN_PASSWORD = 'SenhaTeste123'; // valor de teste local do harness; sem segredo real
const ANON_KEY = 'e2e-isolated-anon-key';
const MARKER = 'QA-01-ISOLATED-E2E';
const ENV = { ...process.env, LD_LIBRARY_PATH: LIB };
const SECRET = randomBytes(32).toString('hex'); // nao persiste, muda a cada execucao

assertLoopback(BASE_URL);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { env: ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} ${args[0]} falhou: ${r.stderr || r.stdout}`);
  return r;
}

function teardown() {
  try {
    if (fs.existsSync(path.join(DATA, 'PG_VERSION'))) {
      run(path.join(BIN, 'pg_ctl'), ['-D', DATA, '-m', 'fast', 'stop']);
    }
  } catch (error) {
    console.warn(`[e2e-isolated] aviso no stop do postgres: ${error.message}`);
  }
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.rmSync(ENV_FILE, { force: true });
  console.log('[e2e-isolated] teardown concluido: dados e .env gerado removidos');
}

if (process.argv.includes('--teardown')) {
  teardown();
  process.exit(0);
}

// --- stub das extensoes de plataforma (identico ao harness) -----------------
for (const base of ['libicuuc', 'libicui18n', 'libicudata']) {
  const link = path.join(LIB, `${base}.so.60`);
  const target = fs.readdirSync(LIB).find((f) => f.startsWith(`${base}.so.60.`));
  if (target && !fs.existsSync(link)) fs.symlinkSync(path.join(LIB, target), link);
}
const extDir = path.join(NATIVE, 'share/postgresql/extension');
fs.mkdirSync(extDir, { recursive: true });
fs.writeFileSync(path.join(extDir, 'pg_cron.control'),
  "comment = 'stub local'\ndefault_version = '1.0'\nrelocatable = false\n");
fs.writeFileSync(path.join(extDir, 'pg_cron--1.0.sql'), `
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigint, schedule text, command text, nodename text, nodeport int,
  database text, username text, active boolean DEFAULT true, jobname text);
CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
  RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN RETURN 1; END $$;
CREATE OR REPLACE FUNCTION cron.schedule(schedule text, command text)
  RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN RETURN 1; END $$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_id bigint)
  RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN RETURN true; END $$;
CREATE OR REPLACE FUNCTION cron.unschedule(job_name text)
  RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN RETURN true; END $$;
`);
fs.writeFileSync(path.join(extDir, 'pg_net.control'),
  "comment = 'stub local'\ndefault_version = '1.0'\nrelocatable = false\n");
fs.writeFileSync(path.join(extDir, 'pg_net--1.0.sql'), `
CREATE SCHEMA IF NOT EXISTS net;
CREATE OR REPLACE FUNCTION net.http_get(url text, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 5000)
  RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN RETURN 1; END $$;
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb,
  params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb,
  timeout_milliseconds integer DEFAULT 5000)
  RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN RETURN 1; END $$;
CREATE OR REPLACE FUNCTION net.http_collect_response(request_id bigint, async boolean DEFAULT true)
  RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RETURN '{}'::jsonb; END $$;
`);

// --- sobe o Postgres e reaplica o historico --------------------------------
teardown();
run(path.join(BIN, 'initdb'), ['-D', DATA, '-U', 'postgres', '--auth=trust', '--encoding=UTF8']);
run(path.join(BIN, 'pg_ctl'), [
  '-D', DATA, '-l', path.join(HARNESS, 'pg-e2e.log'),
  '-o', `-p ${PGPORT} -k /tmp -h 127.0.0.1`, '-w', 'start',
]);
console.log(`[e2e-isolated] postgres embarcado no ar (${PGPORT})`);

const harnessRequire = createRequire(path.join(HARNESS, 'package.json'));
const { Pool } = harnessRequire('pg');
const pool = new Pool({ host: '127.0.0.1', port: PGPORT, user: 'postgres', database: 'postgres', max: 4 });

async function runFile(label, file) {
  let sql = fs.readFileSync(file, 'utf8');
  if (path.basename(file).startsWith('seed-')) {
    sql = sql.replace(/^\s*\\(set|if|else|endif|getenv)\b.*$/gm, '');
    sql = sql.replace(/:'admin_email'/g, `'${ADMIN_EMAIL}'`);
    sql = sql.replace(/:'admin_password'/g, `'${ADMIN_PASSWORD}'`);
  }
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('search_path', '"$user", public, auth, extensions', false)`);
    await c.query(sql);
    await c.query('COMMIT');
  } catch (error) {
    await c.query('ROLLBACK').catch(() => {});
    throw new Error(`FALHOU ${label}: ${error.message}`);
  } finally {
    c.release();
  }
}

let migrationCount = 0;
let discovered;
try {
  const scripts = path.join(REPO, 'docker/local/scripts');
  await runFile('stubs', path.join(HARNESS, 'stubs.sql'));
  await runFile('00-baseline', path.join(scripts, '00-baseline.sql'));
  const files = fs.readdirSync(path.join(REPO, 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const version = file.split('_')[0];
    const before = path.join(scripts, 'patches', `before-${version}.sql`);
    if (fs.existsSync(before)) await runFile(`patch ${path.basename(before)}`, before);
    await runFile(file, path.join(REPO, 'supabase/migrations', file));
    const after = path.join(scripts, 'patches', `after-${version}.sql`);
    if (fs.existsSync(after)) await runFile(`patch ${path.basename(after)}`, after);
    migrationCount++;
  }
  await runFile('99-local-final', path.join(scripts, '99-local-final.sql'));
  for (const seed of ['seed-bil.sql', 'seed-fluxo-teste.sql', 'seed-tecelagem-teste.sql']) {
    await runFile(seed, path.join(scripts, seed));
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS public.e2e_isolation_marker (
    id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now())`);
  await pool.query(
    `INSERT INTO public.e2e_isolation_marker (id) VALUES ($1) ON CONFLICT DO NOTHING`, [MARKER]);

  const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0]?.id ?? null;
  const companyId = await one(
    `SELECT id::text AS id FROM public.companies
      WHERE regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') = '30965938000107' LIMIT 1`);

  const hqRows = (await pool.query(
    `SELECT id::text AS id FROM public.branches
      WHERE company_id = $1 AND is_headquarters LIMIT 1`, [companyId])).rows;
  const hqBranchId = hqRows[0]?.id ?? null;
  const productId = await one(
    `SELECT id::text AS id FROM public.products WHERE code = 'PLUMA-01' LIMIT 1`);

  // QA-02 — fixtures deterministicas do AMBIENTE (nao da suite): os seeds
  // criam apenas a Matriz, mas decide_supply_request exige origem != destino.
  // Alem disso, apply_stock_movement_to_balance() casa o saldo por
  // (empresa, filial, canal, produto, lote); a expedicao grava movimentos SEM
  // lote, entao a origem precisa de um saldo sem lote para nao gerar um
  // INSERT com quantidade negativa (gate estoque_negativo_proibido).
  // Nada disso e dado de cliente: vive apenas no Postgres embarcado e e
  // destruido no teardown.
  if (companyId) {
    await pool.query(
      `INSERT INTO public.branches (company_id, name, code, is_headquarters, is_active)
       SELECT $1, 'Loja QA-02', 'LOJA-QA02', false, true
        WHERE NOT EXISTS (
          SELECT 1 FROM public.branches WHERE company_id = $1 AND code = 'LOJA-QA02'
        )`, [companyId]);
  }
  if (companyId && hqBranchId && productId) {
    await pool.query(
      `INSERT INTO public.stock_balances (
         company_id, branch_id, canal_operacional, product_id,
         product_code, product_name, lot_id, quantity, reserved_qty, unit
       )
       SELECT $1, $2, 'ATACADO_INDUSTRIA'::public.canal_operacional, $3,
              p.code, p.name, NULL, 100, 0, 'UN'
         FROM public.products p WHERE p.id = $3
          AND NOT EXISTS (
            SELECT 1 FROM public.stock_balances sb
             WHERE sb.company_id = $1 AND sb.branch_id = $2
               AND sb.product_id = $3 AND sb.lot_id IS NULL
               AND sb.canal_operacional = 'ATACADO_INDUSTRIA'::public.canal_operacional
          )`, [companyId, hqBranchId, productId]);
  }

  const branches = (await pool.query(
    `SELECT id::text, is_headquarters FROM public.branches WHERE company_id = $1 ORDER BY created_at`,
    [companyId])).rows;
  discovered = {
    companyId,
    adminEmail: ADMIN_EMAIL,
    adminPassword: ADMIN_PASSWORD,
    storeBranchId: branches.find((b) => !b.is_headquarters)?.id ?? branches[0]?.id ?? null,
    cdBranchId: branches.find((b) => b.is_headquarters)?.id ?? branches[0]?.id ?? null,
    productId,
    weavingProductId: await one(`SELECT id::text AS id FROM public.products WHERE code = 'TECIDO-PLANO-01' LIMIT 1`),
    weavingComponentId: await one(`SELECT id::text AS id FROM public.products WHERE code = 'FIO-URD-30' LIMIT 1`),
    weavingLotId: await one(`SELECT id::text AS id FROM public.stock_lots WHERE lot_number = 'FIO-URD-LOTE-TESTE-001' LIMIT 1`),
  };
  if (!companyId || !discovered.productId) {
    throw new Error('seeds deterministicos nao produziram empresa/produto; ambiente incompleto');
  }
  console.log(`[e2e-isolated] replay completo: ${migrationCount} migrations + 3 seeds`);
} catch (error) {
  console.error(`[e2e-isolated] ${error.message}`);
  await pool.end().catch(() => {});
  teardown();
  process.exit(1);
}

// --- arquivo de ambiente efemero (ignorado pelo Git) ------------------------
fs.writeFileSync(ENV_FILE, [
  '# GERADO por scripts/e2e-isolated-server.mjs — NAO versionar, NAO usar em producao.',
  `VITE_SUPABASE_URL=${BASE_URL}`,
  `VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}`,
  `E2E_ISOLATED=1`,
  `E2E_ISOLATED_MARKER=${MARKER}`,
  `E2E_MIGRATIONS=${migrationCount}`,
  `E2E_ADMIN_EMAIL=${discovered.adminEmail}`,
  `E2E_ADMIN_PASSWORD=${discovered.adminPassword}`,
  `E2E_COMPANY_ID=${discovered.companyId}`,
  `E2E_PRODUCT_ID=${discovered.productId}`,
  `E2E_STORE_BRANCH_ID=${discovered.storeBranchId ?? ''}`,
  `E2E_CD_BRANCH_ID=${discovered.cdBranchId ?? ''}`,
  `E2E_WEAVING_PRODUCT_ID=${discovered.weavingProductId ?? ''}`,
  `E2E_WEAVING_COMPONENT_ID=${discovered.weavingComponentId ?? ''}`,
  `E2E_WEAVING_LOT_ID=${discovered.weavingLotId ?? ''}`,
  '',
].join('\n'));

// --- servidor HTTP compativel com o subconjunto usado pela suite -------------
const cryptoSchema = (await pool.query(
  `SELECT n.nspname AS s FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'crypt' AND n.nspname IN ('extensions','public') LIMIT 1`)).rows[0]?.s;
if (!cryptoSchema) throw new Error('pgcrypto/crypt ausente: nao e possivel autenticar contra auth.users');

function send(res, status, payload, extra = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    ...extra,
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function bearer(req) {
  const header = req.headers.authorization ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? verifyJwt(match[1], SECRET) : null;
}

/** Executa SQL como `authenticated`, com as claims que alimentam auth.uid(). */
async function withRls(claims, sql, values) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [claims.sub]);
    await c.query(`SELECT set_config('request.jwt.claim.role', $1, true)`, ['authenticated']);
    await c.query(`SELECT set_config('request.jwt.claim.email', $1, true)`, [claims.email ?? '']);
    await c.query('SET LOCAL ROLE authenticated');
    const result = await c.query(sql, values);
    await c.query('COMMIT');
    return result;
  } catch (error) {
    await c.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    c.release();
  }
}

function sqlError(res, error) {
  const denied = /permission denied|row-level security/i.test(error.message);
  send(res, denied ? 403 : 400, {
    message: error.message, code: error.code ?? 'PGRST000',
    details: null, hint: 'ambiente E2E isolado — SQL real sob RLS',
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE_URL);
  const pathname = url.pathname;
  if (req.method === 'OPTIONS') return send(res, 204, {});

  if (pathname === '/auth/v1/health' && req.method === 'GET') {
    return send(res, 200, {
      ok: true, isolated: true, loopback: true, marker: MARKER,
      migrations: migrationCount, pgPort: PGPORT,
    });
  }

  if (pathname === '/auth/v1/token' && req.method === 'POST') {
    let body;
    try { body = await readJson(req); } catch { return send(res, 400, { message: 'JSON invalido' }); }
    const email = String(body.email ?? '').toLowerCase();
    const password = String(body.password ?? '');
    if (!email || !password) return send(res, 400, { message: 'email/password ausentes', code: 'invalid_grant' });
    try {
      const rows = (await pool.query(
        `SELECT id::text, email FROM auth.users
          WHERE lower(email) = $1 AND ${cryptoSchema}.crypt($2, encrypted_password) = encrypted_password
          LIMIT 1`, [email, password])).rows;
      if (!rows.length) {
        return send(res, 400, { message: 'Invalid login credentials', code: 'invalid_grant' });
      }
      const user = rows[0];
      const token = signJwt({ sub: user.id, email: user.email }, SECRET);
      return send(res, 200, {
        access_token: token, token_type: 'bearer', expires_in: 3600,
        refresh_token: 'e2e-isolated-refresh',
        user: {
          id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email,
          app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {},
          created_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      return sqlError(res, error);
    }
  }

  if (pathname === '/auth/v1/user' && req.method === 'GET') {
    const claims = bearer(req);
    if (!claims) return send(res, 401, { message: 'JWT ausente ou invalido' });
    return send(res, 200, { id: claims.sub, aud: 'authenticated', role: 'authenticated', email: claims.email });
  }

  if (!pathname.startsWith('/rest/v1/')) {
    return send(res, 404, { message: `rota nao suportada no ambiente isolado: ${pathname}` });
  }

  const claims = bearer(req);
  if (!claims) return send(res, 401, { message: 'JWT ausente ou invalido; RLS nao foi aplicada' });

  try {
    const rpc = /^\/rest\/v1\/rpc\/([a-z_][a-z0-9_]*)$/.exec(pathname);
    if (rpc && req.method === 'POST') {
      const body = await readJson(req);
      const fn = rpc[1];
      const metas = (await pool.query(
        `SELECT p.proargnames, p.proretset FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = $1 ORDER BY p.oid`, [fn])).rows;
      if (!metas.length) return send(res, 404, { message: `RPC public.${fn} nao existe no replay` });
      const keys = Object.keys(body ?? {});
      const ordered = metas.sort((a, b) => {
        const score = (m) => (m.proargnames ?? []).filter((n) => keys.includes(n)).length;
        return score(b) - score(a);
      });
      let built;
      for (const meta of ordered) {
        try {
          built = buildRpcCall(fn, body, {
            argnames: meta.proargnames ?? [], retset: meta.proretset,
          });
          break;
        } catch { /* tenta a proxima sobrecarga */ }
      }
      if (!built) return send(res, 400, { message: `argumentos invalidos para public.${fn}` });
      const result = await withRls(claims, built.sql, built.values);
      return send(res, 200, result.rows[0]?.body ?? null);
    }

    const table = /^\/rest\/v1\/([a-z_][a-z0-9_]*)$/.exec(pathname);
    if (table && req.method === 'GET') {
      const single = /vnd\.pgrst\.object\+json/.test(req.headers.accept ?? '');
      const { sql, values } = buildTableQuery(table[1], url.searchParams, single);
      const result = await withRls(claims, sql, values);
      if (single) {
        if (result.rows.length !== 1) {
          return send(res, 406, {
            message: `JSON object requested, multiple (or no) rows returned`,
            code: 'PGRST116', details: `rows=${result.rows.length}`,
          });
        }
        return send(res, 200, result.rows[0]);
      }
      return send(res, 200, result.rows);
    }

    return send(res, 405, { message: `metodo/rota nao suportados: ${req.method} ${pathname}` });
  } catch (error) {
    return sqlError(res, error);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[e2e-isolated] API isolada em ${BASE_URL} (somente loopback)`);
  console.log(`[e2e-isolated] ambiente gerado em ${ENV_FILE}`);
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  await pool.end().catch(() => {});
  teardown();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
for (const signal of ['uncaughtException', 'unhandledRejection']) {
  process.on(signal, (error) => {
    const message = String(error?.message ?? error);
    // O globalTeardown para o Postgres num processo separado; a queda das
    // conexoes do pool e esperada e nao e falha da suite.
    if (/terminating connection|Connection terminated|ECONNRESET/i.test(message)) {
      server.close();
      return;
    }
    console.error(`[e2e-isolated] ${signal}: ${message}`);
    server.close();
    pool.end().catch(() => {}).finally(() => {
      teardown();
      process.exit(1);
    });
  });
}
