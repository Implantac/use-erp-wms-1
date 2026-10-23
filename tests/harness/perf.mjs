// Medição de performance (NÃO é teste de aprovação): Postgres embarcado,
// replay completo, seeds do grupo, VOLUME realista e medição das consultas
// quentes das telas. Rode: bun perf.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = '/home/user/use-erp-wms-1';
const NATIVE = path.join(HERE, 'node_modules/@embedded-postgres/linux-x64/native');
const BIN = path.join(NATIVE, 'bin');
const libDir = path.join(NATIVE, 'lib');
const ENV = { ...process.env, LD_LIBRARY_PATH: libDir };

for (const base of ['libicuuc', 'libicui18n', 'libicudata']) {
  const link = path.join(libDir, `${base}.so.60`);
  const target = fs.readdirSync(libDir).find((f) => f.startsWith(`${base}.so.60.`));
  if (target && !fs.existsSync(link)) fs.symlinkSync(path.join(libDir, target), link);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { env: ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} falhou: ${r.stderr || r.stdout}`);
  return r;
}


// Stubs pg_cron/pg_net (mesma técnica do harness)
const extDir = path.join(NATIVE, 'share/postgresql/extension');
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

const DATA = path.join(HERE, 'data-perf');
fs.rmSync(DATA, { recursive: true, force: true });
run(path.join(BIN, 'initdb'), ['-D', DATA, '-U', 'postgres', '--auth=trust', '--encoding=UTF8']);
run(path.join(BIN, 'pg_ctl'), ['-D', DATA, '-l', path.join(HERE, 'pg-perf.log'), '-o', '-p 55445 -k /tmp -h 127.0.0.1', '-w', 'start']);
console.log('== postgres embarcado (perf) no ar: 55445');

const { Client } = await import('pg');
const client = new Client({ host: '127.0.0.1', port: 55445, user: 'postgres', database: 'postgres' });
client.on('notice', () => {});
await client.connect();
const q = async (sql, params) => (await client.query(sql, params)).rows;

async function runFile(label, file) {
  let sql = fs.readFileSync(file, 'utf8');
  if (path.basename(file).startsWith('seed-')) {
    sql = sql.replace(/^\s*\\(set|if|else|endif|getenv)\b.*$/gm, '');
    sql = sql.replace(/:'admin_email'/g, `'etcsuporte889@gmail.com'`);
    sql = sql.replace(/:'admin_password'/g, `'SenhaTeste123'`);
  }
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('search_path', '"$user", public, auth, extensions', false)`);
    await client.query(sql);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`FALHOU ${label}: ${e.message}`);
    throw e;
  }
}

try {
  const scripts = path.join(REPO, 'docker/local/scripts');
  await runFile('stubs', path.join(HERE, 'stubs.sql'));
  await client.query(`SET search_path = "$user", public, auth, extensions`);
  await runFile('00-baseline', path.join(scripts, '00-baseline.sql'));
  const migDir = path.join(REPO, 'supabase/migrations');
  const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const version = file.split('_')[0];
    const before = path.join(scripts, 'patches', `before-${version}.sql`);
    if (fs.existsSync(before)) await runFile('patch', before);
    await runFile(file, path.join(migDir, file));
    const after = path.join(scripts, 'patches', `after-${version}.sql`);
    if (fs.existsSync(after)) await runFile('patch', after);
  }
  await runFile('99-local-final', path.join(scripts, '99-local-final.sql'));
  console.log(`== replay: ${files.length} migrations`);
  await runFile('seed-grupo-zipo', path.join(scripts, 'seed-grupo-zipo.sql'));
  await runFile('seed-lojas-texas', path.join(scripts, 'seed-lojas-texas.sql'));
  console.log('== seeds do grupo aplicados');

  const zipo = (await q(`SELECT id FROM public.companies WHERE regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') = '10312467000120'`))[0];
  const branches = await q(`SELECT id, company_id FROM public.branches LIMIT 12`);
  const branchIds = branches.map((b) => b.id);
  if (!zipo || branchIds.length < 2) throw new Error('grupo/branches não encontrados após seeds');

  const SCALE = Number(process.env.PERF_SCALE || 1);
  const N_PROD = 2000 * SCALE, N_BAL = 30000 * SCALE, N_TRF = 4000 * SCALE,
        N_OP = 3000 * SCALE, N_EVT = 15000 * SCALE, N_PO = 2000 * SCALE;
  console.log(`== gerando volume x${SCALE} (produtos ${N_PROD}, saldos ${N_BAL}, transferências ${N_TRF}, OPs ${N_OP}, eventos ${N_EVT}, compras ${N_PO})...`);
  await client.query(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`
    INSERT INTO public.products (id, company_id, name, code, sale_price, cost_price, min_stock)
    SELECT gen_random_uuid(), $1, 'Produto PERF ' || g, 'PERF-' || g, 100, 60, 5
    FROM generate_series(1, ${N_PROD}) g`, [zipo.id]);
  const perfProducts = await q(`SELECT id FROM public.products WHERE code LIKE 'PERF-%'`);
  await q(`
    INSERT INTO public.stock_balances (company_id, branch_id, product_id, product_code, product_name, quantity, canal_operacional)
    SELECT $1, br.arr[1 + (g % array_length(br.arr, 1))], p.id, p.code, p.name, (g % 50), 'VAREJO_PDV'
    FROM generate_series(1, ${N_BAL}) g
    CROSS JOIN (SELECT array_agg(id) AS arr FROM public.branches) br
    JOIN public.products p ON p.code = 'PERF-' || (1 + (g % ${N_PROD}))`, [zipo.id]);
  const statuses = ['SUGERIDA', 'APROVADA', 'SEPARAÇÃO', 'EXPEDIDA', 'EM TRÂNSITO', 'RECEBIDA', 'ENCERRADA'];
  await q(`
    INSERT INTO public.stock_transfer_orders (id, company_id, origin_unit_id, destination_unit_id, current_status, created_at)
    SELECT gen_random_uuid(), $1,
           br.arr[1 + (g % array_length(br.arr, 1))],
           br.arr[1 + ((g + 3) % array_length(br.arr, 1))],
           (ARRAY['SUGERIDA','APROVADA','SEPARAÇÃO','EXPEDIDA','EM TRÂNSITO','RECEBIDA','ENCERRADA'])[1 + (g % 7)]::public.transfer_workflow_status,
           now() - (g % 90) * interval '1 day'
    FROM generate_series(1, ${N_TRF}) g
    CROSS JOIN (SELECT array_agg(id) AS arr FROM public.branches) br`, [zipo.id]);
  await q(`
    INSERT INTO public.stock_transfer_items (transfer_id, product_id, requested_qty, shipped_qty, received_qty)
    SELECT t.id, (SELECT id FROM public.products WHERE code = 'PERF-' || (1 + (abs(hashtext(t.id::text)) % 2000))),
           5, 5, 5
    FROM public.stock_transfer_orders t
    WHERE t.created_at > now() - interval '91 days'`, []);
  await q(`
    INSERT INTO public.production_orders (id, company_id, order_number, status, due_date, start_date, created_at, product_id, product_code, product_name, quantity)
    SELECT gen_random_uuid(), $1, 'OP-PERF-' || g,
           (ARRAY['planned','in_progress','in_progress','completed'])[1 + (g % 4)],
           CURRENT_DATE - (g % 60), CURRENT_DATE - (g % 90), now() - (g % 90) * interval '1 day',
           p.id, p.code, p.name, 100
    FROM generate_series(1, ${N_OP}) g
    JOIN public.products p ON p.code = 'PERF-' || (1 + (g % ${N_PROD}))`, [zipo.id]).catch((e) => console.log('  (production_orders volume parcial:', e.message.slice(0, 120), ')'));
  await q(`
    INSERT INTO public.sector_production_events (company_id, production_order_id, sector, event_type, quantity, occurred_at)
    SELECT $1, (SELECT id FROM public.production_orders WHERE order_number = 'OP-PERF-' || (1 + (g % ${N_OP}))),
           (ARRAY['fiacao','malharia','tinturaria'])[1 + (g % 3)], 'start', (g % 20),
           now() - (g % 30) * interval '1 day'
    FROM generate_series(1, ${N_EVT}) g`, [zipo.id]).catch((e) => console.log('  (sector events parcial:', e.message.slice(0, 80), ')'));
  await q(`
    INSERT INTO public.purchase_orders (company_id, number, supplier_name, date, expected_delivery, status, subtotal, total, created_at)
    SELECT $1, 'PC-PERF-' || g, 'Fornecedor PERF', CURRENT_DATE - (g % 90),
           CURRENT_DATE + (g % 30), (ARRAY['confirmed','received','partially_received','pending_approval'])[1 + (g % 4)],
           1000, 1000, now() - (g % 90) * interval '1 day'
    FROM generate_series(1, ${N_PROD}) g`, [zipo.id]);
  await client.query(`SELECT set_config('session_replication_role', 'origin', false)`);
  await client.query('ANALYZE');
  const counts = (await q(`
    SELECT (SELECT count(*) FROM public.stock_balances) saldos,
           (SELECT count(*) FROM public.stock_transfer_orders) transferencias,
           (SELECT count(*) FROM public.products) produtos`))[0];
  console.log('== volume:', JSON.stringify(counts));

  async function measure(label, sql, params) {
    const times = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      await client.query(sql, params);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    console.log(`  ${label}: ${times[1].toFixed(1)} ms (mediana de 3)`);
    return times[1];
  }

  console.log('== consultas quentes (como as telas chamam)');
  const b0 = branchIds[0];
  await measure('NetworkToday: 4 contagens de transferências por status', `
    SELECT count(*) FROM public.stock_transfer_orders
     WHERE company_id = $1 AND current_status IN ('RESERVADA','SEPARAÇÃO','CONFERÊNCIA','EXPEDIDA')`, [zipo.id]);
  await measure('Fila do dia: transferências EM TRÂNSITO p/ uma unidade', `
    SELECT id, current_status, created_at FROM public.stock_transfer_orders
     WHERE destination_unit_id = $1 AND current_status = 'EM TRÂNSITO'
     ORDER BY created_at DESC LIMIT 50`, [b0]);
  await measure('Produtos: busca por nome/código (ilike)', `
    SELECT id, name, code FROM public.products
     WHERE company_id = $1 AND (name ILIKE '%camiseta%' OR code ILIKE '%camiseta%') LIMIT 5`, [zipo.id]);
  await measure('Produção: OPs abertas da empresa', `
    SELECT id, order_number, status, due_date FROM public.production_orders
     WHERE company_id = $1 AND status NOT IN ('completed','cancelled','canceled')
     ORDER BY due_date LIMIT 500`, [zipo.id]);
  await measure('Produção: eventos de setor de hoje', `
    SELECT production_order_id FROM public.sector_production_events
     WHERE company_id = $1 AND occurred_at >= date_trunc('day', now())`, [zipo.id]);
  await measure('Compras: pedidos recentes', `
    SELECT * FROM public.purchase_orders WHERE company_id = $1
     ORDER BY created_at DESC LIMIT 500`, [zipo.id]);
  await measure('Estoque: saldos de uma unidade', `
    SELECT product_id, quantity FROM public.stock_balances
     WHERE branch_id = $1 LIMIT 1000`, [b0]);
  const adminRow = (await q(`SELECT id FROM auth.users WHERE email = 'etcsuporte889@gmail.com'`))[0];
  if (adminRow) {
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', 'authenticated', false)`, [adminRow.id]);
    await measure('factory_inbox() (caixa da Fábrica)', `SELECT public.factory_inbox()`, []);
  } else {
    console.log('  factory_inbox(): usuário admin não encontrado p/ medir com contexto');
  }
  console.log('== medição concluída (índices candidatos no docs/PERFORMANCE.md)');
} finally {
  await client.end().catch(() => {});
  run(path.join(BIN, 'pg_ctl'), ['-D', DATA, '-m', 'fast', 'stop']);
}
