// Jornada ao vivo do gerente de produção (PostgreSQL embarcado, sem Docker).
// Aplica baseline + patches + TODAS as migrations + 99-local-final e executa:
// programar -> conflito -> reprogramar -> etapas -> finishing, com isolamento
// entre empresas. Requer deps fora do repo:
//   mkdir -p /tmp/pgtest && cd /tmp/pgtest && npm i embedded-postgres pg
//   NODE_PATH=/tmp/pgtest/node_modules node scripts/live-manager-journey.mjs
// (embedded-postgres/pg resolvidos de /tmp/pgtest/node_modules via NODE_PATH ou rode com cwd lá.)
import { createRequire } from 'node:module';
const require = createRequire('/tmp/pgtest/package.json');
const EmbeddedPostgres = require('embedded-postgres').default;
const pg = require('pg');
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const REPO = process.env.REPO_DIR || new URL('..', import.meta.url).pathname;
const MIGRATIONS_DIR = path.join(REPO, 'supabase/migrations');
const dataDir = process.env.PGDATA_DIR || '/tmp/use-erp-pgtest-data';
const port = 54399;

const embedded = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port,
  persistent: true,
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    await embedded.initialise();
  }
  await embedded.start();
} catch (e) {
  console.error('START FAIL:', e.message);
  process.exit(1);
}

const client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'postgres' });
await client.connect();

// ---------- Supabase stubs ----------
const stubs = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticator NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE supabase_admin NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS graphql;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(auth.jwt() ->> 'role', 'anon')
$$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auth.identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  provider text,
  provider_id text,
  identity_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY, name text, owner uuid, public boolean DEFAULT false,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text, name text, owner uuid,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
  metadata jsonb
);
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT string_to_array(name, '/')
$$;
CREATE OR REPLACE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
CREATE OR REPLACE FUNCTION storage.extension(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(split_part(storage.filename(name), '.', 2), '')
$$;

-- Realtime / pg_cron stubs (a stack real os cria via imagens Supabase)
CREATE TABLE IF NOT EXISTS realtime.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text, event text, payload jsonb, extension text,
  inserted_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
DO $$ BEGIN CREATE PUBLICATION supabase_realtime; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA IF NOT EXISTS cron;
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigserial PRIMARY KEY, schedule text, command text, nodename text, nodeport int,
  database text, username text, active boolean DEFAULT true, jobname text
);
CREATE OR REPLACE FUNCTION cron.schedule(text, text, text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE OR REPLACE FUNCTION cron.schedule(text, text) RETURNS bigint LANGUAGE sql AS $$ SELECT 1::bigint $$;
CREATE OR REPLACE FUNCTION cron.unschedule(bigint) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION cron.unschedule(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

CREATE OR REPLACE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('realtime.topic', true), '')
$$;
CREATE SCHEMA IF NOT EXISTS net;
CREATE OR REPLACE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds int DEFAULT 1000)
RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;
CREATE OR REPLACE FUNCTION net.http_get(url text, params jsonb DEFAULT '{}'::jsonb, headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds int DEFAULT 1000)
RETURNS bigint LANGUAGE sql AS $$ SELECT 0::bigint $$;


GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
`;
await client.query(stubs);
console.log('stubs OK');

// ---------- Baseline + patches (mesma ordem do migrate.sh local) ----------
const SCRIPTS_DIR = path.join(REPO, 'docker/local/scripts');
const PATCHES_DIR = path.join(SCRIPTS_DIR, 'patches');
async function runFile(label, sqlText) {
  // pg_cron não existe no binário embarcado: a extensão é stub (schema cron acima).
  const sql = sqlText
    .replace(/CREATE EXTENSION IF NOT EXISTS pg_cron[^;]*;/gi, '-- pg_cron stubbed')
    .replace(/CREATE EXTENSION IF NOT EXISTS pg_net[^;]*;/gi, '-- pg_net stubbed');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw new Error(`${label}: ${e.message.split('\n')[0]}`);
  }
}
await runFile('00-baseline.sql', readFileSync(path.join(SCRIPTS_DIR, '00-baseline.sql'), 'utf8'));
console.log('baseline OK');

// ---------- Apply migrations ----------
const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
console.log('migrations:', files.length);
const failed = [];
let applied = 0;
for (const f of files) {
  const base = f.replace(/\.sql$/, '');
  const version = base.split('_')[0];
  try {
    const beforePatch = path.join(PATCHES_DIR, `before-${version}.sql`);
    if (existsSync(beforePatch)) await runFile(`before-${version}`, readFileSync(beforePatch, 'utf8'));
    const sql = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    await runFile(f, sql);
    const afterPatch = path.join(PATCHES_DIR, `after-${version}.sql`);
    if (existsSync(afterPatch)) await runFile(`after-${version}`, readFileSync(afterPatch, 'utf8'));
    applied++;
  } catch (e) {
    failed.push({ file: f, error: e.message.split('\n')[0] });
    if (process.env.STOP_ON_FAIL === '1') break;
  }
}
if (failed.length === 0) {
  await runFile('99-local-final.sql', readFileSync(path.join(SCRIPTS_DIR, '99-local-final.sql'), 'utf8'));
  console.log('99-local-final OK');
  // Nota: stock_balances publicada + GENERATED available_qty exigia a
  // correção de replica identity — ela vem da migration
  // 20261019130000_stock_balances_replica_identity_fix.sql (nada mascarado aqui).
}
console.log(`applied=${applied} failed=${failed.length}`);
for (const x of failed.slice(0, 40)) console.log('FAIL', x.file, '::', x.error.slice(0, 220));

await runManagerJourney(client);
await client.end();
await embedded.stop();
console.log(failed.length === 0 ? 'REPLAY: PASS' : 'REPLAY: FAILURES');
process.exit(failed.length === 0 ? 0 : 2);


// ================= Jornada do gerente de produção =================
async function runManagerJourney(client) {
  const results = [];
  const check = (name, cond, extra = '') => {
    results.push([name, !!cond]);
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + String(extra).slice(0, 160) : ''}`);
  };
  const A = '11111111-1111-4111-8111-111111111111';
  const B = '33333333-3333-4333-8333-333333333333';
  const GERENTE = '22222222-2222-4222-8222-222222222222';
  const OUTRO = '44444444-4444-4444-8444-444444444444';
  const MACHINE = '55555555-5555-4555-8555-555555555555';
  const OP1 = '66666666-6666-4666-8666-666666666666';
  const OP2 = '77777777-7777-4777-8777-777777777777';
  const T1 = '2026-10-20T08:00:00-03:00', T2 = '2026-10-20T12:00:00-03:00', T3 = '2026-10-20T16:00:00-03:00', T4 = '2026-10-20T20:00:00-03:00';

  const asUser = async (uid) => client.query(`SET request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}'`);
  const tryRpc = async (sql, params) => {
    try { const r = await client.query(sql, params); return { ok: true, rows: r.rows }; }
    catch (e) { return { ok: false, error: e.message }; }
  };

  // ---------- Setup ----------
  // Seed de harness (superusuário): desliga triggers anti-hijack só na massa inicial.
  await client.query(`SET session_replication_role = 'replica'`);
  await client.query(`INSERT INTO auth.users (id, email) VALUES ($1,'gerente@example.com'),($2,'outro@example.com') ON CONFLICT (id) DO NOTHING`, [GERENTE, OUTRO]);
  await client.query(`INSERT INTO public.companies (id, name, cnpj) VALUES ($1,'BIL Teste','30965938000107'),($2,'Outra Empresa','11111111000191') ON CONFLICT (id) DO NOTHING`, [A, B]);
  await client.query(`INSERT INTO public.user_roles (user_id, company_id, role) VALUES ($1,$2,'manager'),($3,$4,'manager')`, [GERENTE, A, OUTRO, B]);
  // get_user_company_id resolve a empresa por public.profiles (não por user_roles)
  await client.query(`INSERT INTO public.profiles (id, name, email, company_id) VALUES ($1,'Gerente Produção','gerente@example.com',$3),($2,'Outro','outro@example.com',$4) ON CONFLICT (id) DO UPDATE SET company_id = EXCLUDED.company_id`, [GERENTE, OUTRO, A, B]);
  await client.query(`INSERT INTO public.production_machines (id, code, name, company_id) VALUES ($1,'TEAR-01','Tear 01',$2)`, [MACHINE, A]);
  await client.query(`INSERT INTO public.production_orders (id, order_number, product_code, product_name, quantity, unit, status, company_id, estimated_time_minutes)
    VALUES ($1,'OP-1001','ART-01','Tecido teste',100,'m','planned',$3,120),($2,'OP-1002','ART-01','Tecido teste',50,'m','planned',$3,120)`, [OP1, OP2, A]);

  await client.query(`SET session_replication_role = 'origin'`);
  await asUser(GERENTE);

  // ---------- Programação finita ----------
  const s1 = await tryRpc(`SELECT public.schedule_production_order($1,$2,$3,$4,NULL,$5,NULL,NULL,'diurno') AS id`, [OP1, T1, T2, 'sched-op1-0001', MACHINE]);
  check('programar OP-1001 na Tear 01 (08–12h)', s1.ok, s1.error || JSON.stringify(s1.rows));
  const replay = await tryRpc(`SELECT public.schedule_production_order($1,$2,$3,$4,NULL,$5,NULL,NULL,'diurno') AS id`, [OP1, T1, T2, 'sched-op1-0001', MACHINE]);
  const count1 = await client.query(`SELECT count(*)::int c FROM public.production_schedule WHERE production_order_id=$1 AND status<>'cancelled'`, [OP1]);
  check('replay idempotente não duplica janela', replay.ok && count1.rows[0].c === 1, `rows=${count1.rows[0].c}`);

  const conflict = await tryRpc(`SELECT public.schedule_production_order($1,$2,$3,$4,NULL,$5,NULL,NULL,'diurno')`, [OP2, '2026-10-20T10:00:00-03:00', T3, 'sched-op2-0001', MACHINE]);
  check('conflito de máquina sobreposto é rejeitado', !conflict.ok, conflict.error);

  const adjacent = await tryRpc(`SELECT public.schedule_production_order($1,$2,$3,$4,NULL,$5,NULL,NULL,'diurno') AS id`, [OP2, T2, T3, 'sched-op2-0002', MACHINE]);
  check('janela adjacente (12–16h) na mesma máquina é aceita', adjacent.ok, adjacent.error);

  const second = await tryRpc(`SELECT public.schedule_production_order($1,$2,$3,$4,NULL,$5,NULL,NULL,'diurno')`, [OP1, T3, T4, 'sched-op1-0002', MACHINE]);
  check('segunda janela ativa da mesma OP é rejeitada', !second.ok, second.error);

  const tooShort = await tryRpc(`SELECT public.schedule_production_order($1,$2,$3,$4,NULL,$5,NULL,NULL,'diurno')`, [OP2, '2026-10-21T08:00:00-03:00', '2026-10-21T08:30:00-03:00', 'sched-op2-0003', MACHINE]);
  check('janela menor que o tempo estimado é rejeitada', !tooShort.ok, tooShort.error);

  // ---------- Reprogramação ----------
  const sched1 = await client.query(`SELECT id FROM public.production_schedule WHERE production_order_id=$1 AND status='scheduled'`, [OP1]);
  const cancel = await tryRpc(`SELECT public.cancel_production_schedule($1)`, [sched1.rows[0].id]);
  check('cancelar janela programada', cancel.ok, cancel.error);
  const reprogram = await tryRpc(`SELECT public.schedule_production_order($1,$2,$3,$4,NULL,$5,NULL,NULL,'diurno') AS id`, [OP1, T3, T4, 'sched-op1-0003', MACHINE]);
  check('reprogramar OP após cancelamento (16–20h)', reprogram.ok, reprogram.error);

  // ---------- Isolamento entre empresas ----------
  await asUser(OUTRO);
  const cross = await tryRpc(`SELECT public.schedule_production_order($1,$2,$3,$4,NULL,$5,NULL,NULL,'diurno')`, [OP2, '2026-10-22T08:00:00-03:00', '2026-10-22T12:00:00-03:00', 'sched-cross-01', MACHINE]);
  check('usuário de outra empresa não programa OP alheia', !cross.ok, cross.error);
  await asUser(GERENTE);

  // ---------- Execução por etapas (acompanhamento) ----------
  const st = await client.query(`INSERT INTO public.production_steps (name, code, sequence, estimated_time_minutes, company_id)
    VALUES ('Urdimento','URD',1,60,$1),('Tecelagem','TEC',2,120,$1) RETURNING id, code`, [A]);
  const stepUrd = st.rows.find(r => r.code === 'URD').id, stepTec = st.rows.find(r => r.code === 'TEC').id;
  const os = await client.query(`INSERT INTO public.production_order_steps (production_order_id, step_id, sequence, estimated_time_minutes, quantity_pending, company_id, machine_id)
    VALUES ($1,$2,1,60,100,$4,$5),($1,$3,2,120,100,$4,$5) RETURNING id, sequence`, [OP1, stepUrd, stepTec, A, MACHINE]);
  const osUrd = os.rows.find(r => r.sequence === 1).id, osTec = os.rows.find(r => r.sequence === 2).id;

  const outOfOrder = await tryRpc(`SELECT public.record_production_step_progress($1,'progress',10,0,'Operador A')`, [osTec]);
  check('apontar Tecelagem antes de concluir Urdimento é bloqueado', !outOfOrder.ok, outOfOrder.error);

  const start = await tryRpc(`SELECT public.record_production_step_progress($1,'start',0,0,'Operador A',NULL,NULL,$2,NULL,'diurno')`, [osUrd, MACHINE]);
  check('iniciar Urdimento no terminal', start.ok, start.error);
  const opAfterStart = await client.query(`SELECT status FROM public.production_orders WHERE id=$1`, [OP1]);
  check('OP sai de planned para in_progress ao iniciar etapa', opAfterStart.rows[0].status === 'in_progress', opAfterStart.rows[0].status);

  const partial = await tryRpc(`SELECT public.record_production_step_progress($1,'progress',40,0,'Operador A')`, [osUrd]);
  const stepAfterPartial = await client.query(`SELECT status, quantity_produced, quantity_pending FROM public.production_order_steps WHERE id=$1`, [osUrd]);
  check('apontamento parcial 40/100 mantém etapa aberta', partial.ok && stepAfterPartial.rows[0].status !== 'completed' && Number(stepAfterPartial.rows[0].quantity_pending) === 60, JSON.stringify(stepAfterPartial.rows[0]));

  const over = await tryRpc(`SELECT public.record_production_step_progress($1,'progress',61,0,'Operador A')`, [osUrd]);
  check('apontar acima da meta da etapa é rejeitado', !over.ok, over.error);

  const finishUrd = await tryRpc(`SELECT public.record_production_step_progress($1,'progress',58,2,'Operador A')`, [osUrd]);
  const stepUrdDone = await client.query(`SELECT status FROM public.production_order_steps WHERE id=$1`, [osUrd]);
  check('completar Urdimento (98 boas + 2 rejeitadas = meta)', finishUrd.ok && stepUrdDone.rows[0].status === 'completed', finishUrd.error || stepUrdDone.rows[0].status);

  const finishTec = await tryRpc(`SELECT public.record_production_step_progress($1,'complete',95,3,'Operador A')`, [osTec]);
  const opFinal = await client.query(`SELECT status FROM public.production_orders WHERE id=$1`, [OP1]);
  check('concluir última etapa leva OP a finishing (visível no acompanhamento)', finishTec.ok && opFinal.rows[0].status === 'finishing', finishTec.error || opFinal.rows[0].status);

  const lateProgress = await tryRpc(`SELECT public.record_production_step_progress($1,'progress',1,0,'Operador A')`, [osTec]);
  check('apontamento em etapa já concluída é rejeitado', !lateProgress.ok, lateProgress.error);

  const visible = await client.query(`SELECT count(*)::int c FROM public.production_orders WHERE company_id=$1 AND status NOT IN ('completed','cancelled')`, [A]);

  // ================= Parte 2: OP têxtil até a conclusão =================
  const TECIDO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const FIO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const ROUTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const LOTE_FIO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  // Preenche colunas NOT NULL sem default que não informamos (harness resiliente).
  async function insertDyn(table, values) {
    const cols = await client.query(
      `SELECT column_name, data_type, udt_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 AND is_nullable='NO' AND column_default IS NULL`, [table]);
    const merged = { ...values };
    for (const c of cols.rows) {
      if (merged[c.column_name] !== undefined) continue;
      if (c.data_type === 'numeric' || c.data_type === 'integer' || c.data_type === 'double precision') merged[c.column_name] = 0;
      else if (c.data_type === 'boolean') merged[c.column_name] = false;
      else if (c.data_type === 'timestamp with time zone' || c.data_type === 'timestamp without time zone' || c.data_type === 'date') merged[c.column_name] = new Date().toISOString();
      else if (c.data_type === 'uuid') merged[c.column_name] = '00000000-0000-4000-8000-000000000000';
      else merged[c.column_name] = '';
    }
    const keys = Object.keys(merged);
    const params = keys.map(k => merged[k]);
    const r = await client.query(
      `INSERT INTO public.${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, params);
    return r.rows[0];
  }

  await client.query(`SET session_replication_role = 'replica'`);
  await insertDyn('products', { id: TECIDO, company_id: A, code: 'TECIDO-01', name: 'Tecido cru 1,60m', type: 'finished', unit: 'm', item_kind: 'acabado' });
  await insertDyn('products', { id: FIO, company_id: A, code: 'FIO-01', name: 'Fio algodão 30/1', type: 'raw_material', unit: 'kg', item_kind: 'materia_prima' });
  // Regressão 20261019120000: INSERT sem item_kind não pode violar o CHECK.
  const semKind = await client.query(
    `INSERT INTO public.products (company_id, code, name, type, unit, cost_price, sale_price, min_stock, max_stock, reorder_point, lead_time_days)
     VALUES ($1,'AUX-01','Item auxiliar sem tipo explícito','insumo','UN',0,0,0,0,0,0) RETURNING item_kind`, [A]).catch(e => ({ error: e }));
  check('cadastrar produto sem item_kind usa default válido (revenda)', !semKind.error && semKind.rows[0].item_kind === 'revenda', semKind.error?.message || semKind.rows?.[0]?.item_kind);
  await insertDyn('production_routes', { id: ROUTE, company_id: A, code: 'ROT-TECIDO-01', product_id: TECIDO, is_active: true });
  await insertDyn('production_route_steps', { route_id: ROUTE, company_id: A, sequence: 1, step_name: 'Urdimento' });
  await insertDyn('production_route_steps', { route_id: ROUTE, company_id: A, sequence: 2, step_name: 'Tecelagem' });
  await insertDyn('production_bom', { company_id: A, product_id: TECIDO, component_id: FIO, quantity: 0.22, waste_percentage: 5 });
  await insertDyn('stock_lots', { id: LOTE_FIO, company_id: A, product_id: FIO, product_code: 'FIO-01', product_name: 'Fio algodão 30/1', lot_number: 'FIO-LOTE-001', quantity: 100, remaining_qty: 100, status: 'available', quality_status: 'approved', unit_cost: 10 });
  await insertDyn('stock_balances', { company_id: A, product_id: FIO, lot_id: LOTE_FIO, branch_id: null, canal_operacional: 'ATACADO_INDUSTRIA', quantity: 100, reserved_qty: 0 });
  await client.query(`SET session_replication_role = 'origin'`);
  await asUser(GERENTE);

  const created = await tryRpc(`SELECT public.create_textile_production_order($1, 100, 'op-textil-0001', 'high') AS r`, [TECIDO]);
  const op3 = created.rows?.[0]?.r?.production_order_id;
  check('criar OP têxtil via RPC (snapshot + roteiro + etapas)', created.ok && !!op3, created.error || JSON.stringify(created.rows?.[0]?.r).slice(0, 140));
  const createdReplay = await tryRpc(`SELECT public.create_textile_production_order($1, 100, 'op-textil-0001', 'high') AS r`, [TECIDO]);
  check('replay de criação não duplica OP', createdReplay.ok && createdReplay.rows[0].r.idempotent_replay === true, JSON.stringify(createdReplay.rows?.[0]?.r).slice(0, 120));
  const snap = await client.query(`SELECT (technical_snapshot IS NOT NULL) AS has_snap, status FROM public.production_orders WHERE id=$1`, [op3]);
  check('OP nasce planejada com snapshot técnico congelado', snap.rows[0].has_snap && snap.rows[0].status === 'planned', JSON.stringify(snap.rows[0]));

  const reservation = await tryRpc(`SELECT public.reserve_production_materials($1, $2::jsonb, 'reserva-op-textil-01') AS r`,
    [op3, JSON.stringify([{ component_id: FIO, lot_id: LOTE_FIO, quantity: 23 }])]);
  check('reservar 23 kg do lote de fio (BOM 0,22 kg/m + 5% perda)', reservation.ok, reservation.error);
  const balanceAfterReserve = await client.query(`SELECT quantity, reserved_qty FROM public.stock_balances WHERE lot_id=$1`, [LOTE_FIO]);
  check('saldo marca 23 kg reservados sem baixar o físico', Number(balanceAfterReserve.rows[0].quantity) === 100 && Number(balanceAfterReserve.rows[0].reserved_qty) === 23, JSON.stringify(balanceAfterReserve.rows[0]));
  const reservationReplay = await tryRpc(`SELECT public.reserve_production_materials($1, $2::jsonb, 'reserva-op-textil-01') AS r`,
    [op3, JSON.stringify([{ component_id: FIO, lot_id: LOTE_FIO, quantity: 23 }])]);
  const balanceAfterReplay = await client.query(`SELECT reserved_qty FROM public.stock_balances WHERE lot_id=$1`, [LOTE_FIO]);
  check('replay de reserva não reserva em dobro', reservationReplay.ok && Number(balanceAfterReplay.rows[0].reserved_qty) === 23, JSON.stringify(balanceAfterReplay.rows[0]));

  const sched3 = await tryRpc(`SELECT public.schedule_production_order($1,'2026-10-21T08:00:00-03:00','2026-10-21T12:00:00-03:00','sched-op3-0001',NULL,$2,NULL,NULL,'diurno') AS id`, [op3, MACHINE]);
  check('programar OP têxtil na Tear 01', sched3.ok, sched3.error);

  const opSteps = await client.query(`SELECT id, sequence FROM public.production_order_steps WHERE production_order_id=$1 ORDER BY sequence`, [op3]);
  check('roteiro gerou 2 etapas acompanháveis', opSteps.rows.length === 2, `steps=${opSteps.rows.length}`);
  const [os1, os2] = opSteps.rows;
  const p1 = await tryRpc(`SELECT public.record_production_step_progress($1,'progress',98,2,'Operador A')`, [os1.id]);
  check('executar Urdimento da OP têxtil (98 + 2)', p1.ok, p1.error);
  const p2 = await tryRpc(`SELECT public.record_production_step_progress($1,'complete',95,3,'Operador A')`, [os2.id]);
  check('executar Tecelagem da OP têxtil (95 boas + 3 rejeitadas = meta 98)', p2.ok, p2.error);

  const premature = await tryRpc(`SELECT public.complete_production_order($1,'conclusao-op-textil-01',95,5,$2::jsonb,'TECIDO-LOTE-001') AS r`,
    [op3, JSON.stringify([{ component_id: FIO, lot_id: LOTE_FIO, quantity: 23 }])]);
  check('concluir sem qualidade aprovada é bloqueado', !premature.ok, premature.error);

  const insp = await insertDyn('quality_inspections', { company_id: A, production_order_id: op3, inspector: 'Gerente de Produção', approved_quantity: 95, rejected_quantity: 3, status: 'open' });
  const decide = await tryRpc(`SELECT public.decide_production_quality_inspection($1,'approved') AS r`, [insp.id]);
  check('aprovar formalmente a inspeção de qualidade', decide.ok, decide.error);

  const completion = await tryRpc(`SELECT public.complete_production_order($1,'conclusao-op-textil-01',95,5,$2::jsonb,'TECIDO-LOTE-001') AS r`,
    [op3, JSON.stringify([{ component_id: FIO, lot_id: LOTE_FIO, quantity: 23 }])]);
  check('concluir OP têxtil consumindo a própria reserva', completion.ok, completion.error || JSON.stringify(completion.rows?.[0]?.r).slice(0, 160));
  const opFinalState = await client.query(`SELECT status, produced_quantity FROM public.production_orders WHERE id=$1`, [op3]);
  check('OP consta concluída com 95 m produzidos', opFinalState.rows[0].status === 'completed' && Number(opFinalState.rows[0].produced_quantity) === 95, JSON.stringify(opFinalState.rows[0]));
  const outLot = await client.query(`SELECT remaining_qty, quality_status FROM public.stock_lots WHERE company_id=$1 AND lot_number='TECIDO-LOTE-001'`, [A]);
  check('lote de saída gerado com 95 m liberado', outLot.rows.length === 1 && Number(outLot.rows[0].remaining_qty) === 95, JSON.stringify(outLot.rows[0]));
  const inLot = await client.query(`SELECT remaining_qty FROM public.stock_lots WHERE id=$1`, [LOTE_FIO]);
  check('lote de fio baixou 100 -> 77 kg', Number(inLot.rows[0].remaining_qty) === 77, JSON.stringify(inLot.rows[0]));
  const resState = await client.query(`SELECT consumed_qty, status FROM public.production_material_reservations WHERE production_order_id=$1`, [op3]);
  check('reserva consumida pela conclusão (23 kg)', resState.rows.length === 1 && Number(resState.rows[0].consumed_qty) === 23, JSON.stringify(resState.rows[0]));
  const genealogy = await client.query(`SELECT count(*)::int c FROM public.production_lot_genealogy g JOIN public.stock_lots o ON o.id = g.output_lot_id WHERE g.input_lot_id=$1 AND o.lot_number='TECIDO-LOTE-001'`, [LOTE_FIO]);
  check('genealogia fio -> tecido persistida', genealogy.rows[0].c >= 1, `links=${genealogy.rows[0].c}`);
  const movementsBefore = await client.query(`SELECT count(*)::int c FROM public.stock_movements WHERE company_id=$1`, [A]);
  const completionReplay = await tryRpc(`SELECT public.complete_production_order($1,'conclusao-op-textil-01',95,5,$2::jsonb,'TECIDO-LOTE-001') AS r`,
    [op3, JSON.stringify([{ component_id: FIO, lot_id: LOTE_FIO, quantity: 23 }])]);
  const movementsAfter = await client.query(`SELECT count(*)::int c FROM public.stock_movements WHERE company_id=$1`, [A]);
  check('replay de conclusão não duplica movimentos', completionReplay.ok && completionReplay.rows[0].r.idempotent_replay === true && movementsAfter.rows[0].c === movementsBefore.rows[0].c,
    `movs=${movementsBefore.rows[0].c}->${movementsAfter.rows[0].c}`);
  const secondCompletion = await tryRpc(`SELECT public.complete_production_order($1,'conclusao-op-textil-02',95,5,$2::jsonb,'TECIDO-LOTE-002') AS r`,
    [op3, JSON.stringify([{ component_id: FIO, lot_id: LOTE_FIO, quantity: 23 }])]);
  // Semântica real da RPC: conclusão é idempotente POR OP — a 2ª chamada (mesmo
  // com outra chave) devolve replay e não escreve nada de novo.
  const movementsAfterSecond = await client.query(`SELECT count(*)::int c FROM public.stock_movements WHERE company_id=$1`, [A]);
  check('segunda conclusão retorna replay sem duplicar estoque', secondCompletion.ok && secondCompletion.rows[0].r.idempotent_replay === true && movementsAfterSecond.rows[0].c === movementsAfter.rows[0].c,
    secondCompletion.error || `replay=${secondCompletion.rows?.[0]?.r?.idempotent_replay}`);

  // Regressão 20261019140000: OP atrasada gera alerta sem quebrar o UPDATE,
  // e a conclusão não duplica o movimento de entrada do produto acabado.
  await client.query(`UPDATE public.production_orders SET due_date = (CURRENT_DATE - 2)::timestamptz WHERE id=$1`, [OP2]);
  const lateUpdate = await client.query(`UPDATE public.production_orders SET status='waiting_material', updated_at=now() WHERE id=$1 RETURNING status`, [OP2]).catch(e => ({ error: e }));
  const delayAlert = await client.query(`SELECT count(*)::int c FROM public.industrial_alerts WHERE entity_id=$1 AND alert_type='delay' AND status='active'`, [OP2]);
  check('OP atrasada atualiza e gera alerta de atraso (sem uuid=text)', !lateUpdate.error && delayAlert.rows[0].c === 1, lateUpdate.error?.message || `alerts=${delayAlert.rows[0].c}`);
  const inMovements = await client.query(`SELECT count(*)::int c FROM public.stock_movements WHERE company_id=$1 AND direction='in' AND lot_id = (SELECT id FROM public.stock_lots WHERE company_id=$1 AND lot_number='TECIDO-LOTE-001')`, [A]);
  check('conclusão gera exatamente 1 movimento de entrada do lote produzido', inMovements.rows[0].c === 1, `in=${inMovements.rows[0].c}`);

  check('painel de acompanhamento (não-finais) enxerga OPs ativas', visible.rows[0].c === 2, `visible=${visible.rows[0].c}`);


  // ============ Parte 3: pluma -> fio 30 cardado -> malha (produto final) ============
  const PLUMA = 'f1111111-1111-4111-8111-111111111111';
  const FIO30 = 'f2222222-2222-4222-8222-222222222222';
  const MALHA = 'f3333333-3333-4333-8333-333333333333';
  const LOTE_PLUMA = 'f4444444-4444-4444-8444-444444444444';
  const FILATORIO = 'f5555555-5555-4555-8555-555555555555';
  const CIRCULAR = 'f6666666-6666-4666-8666-666666666666';
  const ROT_FIA = 'f7777777-7777-4777-8777-777777777777';
  const ROT_MAL = 'f8888888-8888-4888-8888-888888888888';

  await client.query(`SET session_replication_role = 'replica'`);
  await insertDyn('products', { id: PLUMA, company_id: A, code: 'PLUMA-01', name: 'Algodão em pluma', type: 'raw_material', unit: 'kg', item_kind: 'materia_prima' });
  await insertDyn('products', { id: FIO30, company_id: A, code: 'FIO-30-CARD', name: 'Fio 30/1 cardado', type: 'finished', unit: 'kg', item_kind: 'insumo' });
  await insertDyn('products', { id: MALHA, company_id: A, code: 'MALHA-30', name: 'Malha fio 30 cardada', type: 'finished', unit: 'kg', item_kind: 'acabado' });
  // Linha de fiação cardada + malharia circular: operações do catálogo da empresa
  const stepNames = ['Abertura e Limpeza', 'Cardagem', 'Passador', 'Maçaroqueira', 'Filatório de Anel', 'Malharia Circular', 'Revisão de Malha'];
  for (const [i, name] of stepNames.entries()) {
    await insertDyn('production_steps', { company_id: A, name, code: 'ETP-' + (i + 1), sequence: i + 1, estimated_time_minutes: 60, sector: i < 5 ? 'Fiação' : 'Malharia' });
  }
  await insertDyn('production_routes', { id: ROT_FIA, company_id: A, code: 'ROT-FIA-30', product_id: FIO30, is_active: true });
  await insertDyn('production_routes', { id: ROT_MAL, company_id: A, code: 'ROT-MAL-30', product_id: MALHA, is_active: true });
  for (const [i, name] of stepNames.slice(0, 5).entries()) {
    await insertDyn('production_route_steps', { route_id: ROT_FIA, company_id: A, sequence: i + 1, step_name: name, operation_time_minutes: 60 });
  }
  for (const [i, name] of stepNames.slice(5).entries()) {
    await insertDyn('production_route_steps', { route_id: ROT_MAL, company_id: A, sequence: i + 1, step_name: name, operation_time_minutes: 60 });
  }
  // Estruturas configuradas pelo gerente (rendimentos da empresa, não constantes do sistema)
  await insertDyn('production_bom', { company_id: A, product_id: FIO30, component_id: PLUMA, quantity: 1.18, waste_percentage: 0 });
  await insertDyn('production_bom', { company_id: A, product_id: MALHA, component_id: FIO30, quantity: 1.03, waste_percentage: 0 });
  await insertDyn('production_machines', { id: FILATORIO, code: 'FIL-01', name: 'Filatório 01', company_id: A });
  await insertDyn('production_machines', { id: CIRCULAR, code: 'CIRC-01', name: 'Tear Circular 01', company_id: A });
  await insertDyn('stock_lots', { id: LOTE_PLUMA, company_id: A, product_id: PLUMA, product_code: 'PLUMA-01', product_name: 'Algodão em pluma', lot_number: 'PLUMA-LOTE-001', quantity: 500, remaining_qty: 500, status: 'available', quality_status: 'approved', unit_cost: 8 });
  await insertDyn('stock_balances', { company_id: A, product_id: PLUMA, lot_id: LOTE_PLUMA, branch_id: null, canal_operacional: 'ATACADO_INDUSTRIA', quantity: 500, reserved_qty: 0 });
  await client.query(`SET session_replication_role = 'origin'`);
  await asUser(GERENTE);

  // ---- OP de fiação: 100 kg de fio 30 cardado a partir da pluma ----
  const opFia = await tryRpc(`SELECT public.create_textile_production_order($1, 100, 'op-fiacao-0001', 'high') AS r`, [FIO30]);
  const opFiaId = opFia.rows?.[0]?.r?.production_order_id;
  check('OP de fiação criada (fio 30 cardado, 100 kg)', opFia.ok && !!opFiaId, opFia.error || JSON.stringify(opFia.rows?.[0]?.r).slice(0, 130));
  const fiaSteps = await client.query(`SELECT id, sequence FROM public.production_order_steps WHERE production_order_id=$1 ORDER BY sequence`, [opFiaId]);
  check('roteiro de fiação gerou 5 etapas acompanháveis', fiaSteps.rows.length === 5, `steps=${fiaSteps.rows.length}`);

  const resFia = await tryRpc(`SELECT public.reserve_production_materials($1, $2::jsonb, 'reserva-fiacao-01') AS r`,
    [opFiaId, JSON.stringify([{ component_id: PLUMA, lot_id: LOTE_PLUMA, quantity: 118 }])]);
  check('reservar 118 kg de pluma (1,18 kg/kg de fio configurado)', resFia.ok, resFia.error);
  const schedFia = await tryRpc(`SELECT public.schedule_production_order($1,'2026-10-22T08:00:00-03:00','2026-10-22T16:00:00-03:00','sched-fiacao-01',NULL,$2,NULL,NULL,'diurno') AS id`, [opFiaId, FILATORIO]);
  check('programar fiação no Filatório 01', schedFia.ok, schedFia.error);

  // Metas encadeadas: cada etapa mira a saída boa da anterior (100->97->96->95->94->93)
  const fiaPlan = [[97, 3], [96, 1], [95, 1], [94, 1], [93, 1]];
  let fiaExecOk = true, fiaExecErr = '';
  for (const [i, st] of fiaSteps.rows.entries()) {
    const r = await tryRpc(`SELECT public.record_production_step_progress($1,'progress',$2,$3,'Operador Fiação')`, [st.id, fiaPlan[i][0], fiaPlan[i][1]]);
    if (!r.ok) { fiaExecOk = false; fiaExecErr = r.error; break; }
  }
  check('executar as 5 operações da fiação cardada em sequência', fiaExecOk, fiaExecErr);
  const inspFia = await insertDyn('quality_inspections', { company_id: A, production_order_id: opFiaId, inspector: 'Laboratório', approved_quantity: 93, rejected_quantity: 4, status: 'open' });
  const decFia = await tryRpc(`SELECT public.decide_production_quality_inspection($1,'approved') AS r`, [inspFia.id]);
  check('laboratório aprova o fio 30 (93 kg)', decFia.ok, decFia.error);
  const compFia = await tryRpc(`SELECT public.complete_production_order($1,'conclusao-fiacao-01',93,7,$2::jsonb,'FIO30-LOTE-001') AS r`,
    [opFiaId, JSON.stringify([{ component_id: PLUMA, lot_id: LOTE_PLUMA, quantity: 118 }])]);
  check('concluir fiação: pluma vira lote de fio 30', compFia.ok, compFia.error || JSON.stringify(compFia.rows?.[0]?.r).slice(0, 130));
  const fioLot = await client.query(`SELECT id, remaining_qty FROM public.stock_lots WHERE company_id=$1 AND lot_number='FIO30-LOTE-001'`, [A]);
  check('lote FIO30-LOTE-001 com 93 kg disponível para a malharia', fioLot.rows.length === 1 && Number(fioLot.rows[0].remaining_qty) === 93, JSON.stringify(fioLot.rows[0]));
  const plumaAfter = await client.query(`SELECT remaining_qty FROM public.stock_lots WHERE id=$1`, [LOTE_PLUMA]);
  check('lote de pluma baixou 500 -> 382 kg', Number(plumaAfter.rows[0].remaining_qty) === 382, JSON.stringify(plumaAfter.rows[0]));
  const fioLotId = fioLot.rows[0].id;

  // ---- OP de malharia: 90 kg de malha fio 30 consumindo o fio produzido ----
  const opMal = await tryRpc(`SELECT public.create_textile_production_order($1, 90, 'op-malharia-01', 'high') AS r`, [MALHA]);
  const opMalId = opMal.rows?.[0]?.r?.production_order_id;
  check('OP de malharia criada (malha fio 30, 90 kg)', opMal.ok && !!opMalId, opMal.error || JSON.stringify(opMal.rows?.[0]?.r).slice(0, 130));
  const resTooMuch = await tryRpc(`SELECT public.reserve_production_materials($1, $2::jsonb, 'reserva-malharia-x') AS r`,
    [opMalId, JSON.stringify([{ component_id: FIO30, lot_id: fioLotId, quantity: 95 }])]);
  check('reservar fio acima do produzido (95 > 93 kg) é rejeitado', !resTooMuch.ok, resTooMuch.error);
  const resMal = await tryRpc(`SELECT public.reserve_production_materials($1, $2::jsonb, 'reserva-malharia-01') AS r`,
    [opMalId, JSON.stringify([{ component_id: FIO30, lot_id: fioLotId, quantity: 92.7 }])]);
  check('reservar 92,7 kg do fio 30 (1,03 kg/kg de malha configurado)', resMal.ok, resMal.error);
  const schedMal = await tryRpc(`SELECT public.schedule_production_order($1,'2026-10-23T08:00:00-03:00','2026-10-23T16:00:00-03:00','sched-malharia-01',NULL,$2,NULL,NULL,'diurno') AS id`, [opMalId, CIRCULAR]);
  check('programar malharia no Tear Circular 01', schedMal.ok, schedMal.error);

  const malSteps = await client.query(`SELECT id, sequence FROM public.production_order_steps WHERE production_order_id=$1 ORDER BY sequence`, [opMalId]);
  check('roteiro de malharia gerou 2 etapas acompanháveis', malSteps.rows.length === 2, `steps=${malSteps.rows.length}`);
  const malPlan = [[88, 2], [87, 1]];
  let malExecOk = true, malExecErr = '';
  for (const [i, st] of malSteps.rows.entries()) {
    const r = await tryRpc(`SELECT public.record_production_step_progress($1,'progress',$2,$3,'Operador Malharia')`, [st.id, malPlan[i][0], malPlan[i][1]]);
    if (!r.ok) { malExecOk = false; malExecErr = r.error; break; }
  }
  check('executar malharia circular + revisão (88->87 kg)', malExecOk, malExecErr);
  const prematureMal = await tryRpc(`SELECT public.complete_production_order($1,'conclusao-malharia-01',87,3,$2::jsonb,'MALHA-LOTE-001') AS r`,
    [opMalId, JSON.stringify([{ component_id: FIO30, lot_id: fioLotId, quantity: 92.7 }])]);
  check('concluir malha sem qualidade aprovada é bloqueado', !prematureMal.ok, prematureMal.error);
  const inspMal = await insertDyn('quality_inspections', { company_id: A, production_order_id: opMalId, inspector: 'Laboratório', approved_quantity: 87, rejected_quantity: 2, status: 'open' });
  const decMal = await tryRpc(`SELECT public.decide_production_quality_inspection($1,'approved') AS r`, [inspMal.id]);
  check('laboratório aprova a malha (87 kg)', decMal.ok, decMal.error);
  const compMal = await tryRpc(`SELECT public.complete_production_order($1,'conclusao-malharia-01',87,3,$2::jsonb,'MALHA-LOTE-001') AS r`,
    [opMalId, JSON.stringify([{ component_id: FIO30, lot_id: fioLotId, quantity: 92.7 }])]);
  check('concluir malharia: fio 30 vira malha (produto final)', compMal.ok, compMal.error || JSON.stringify(compMal.rows?.[0]?.r).slice(0, 130));

  const malhaLot = await client.query(`SELECT remaining_qty, quality_status FROM public.stock_lots WHERE company_id=$1 AND lot_number='MALHA-LOTE-001'`, [A]);
  check('PRODUTO FINAL: lote MALHA-LOTE-001 com 87 kg liberado', malhaLot.rows.length === 1 && Number(malhaLot.rows[0].remaining_qty) === 87 && malhaLot.rows[0].quality_status === 'approved', JSON.stringify(malhaLot.rows[0]));
  const fioAfter = await client.query(`SELECT remaining_qty FROM public.stock_lots WHERE id=$1`, [fioLotId]);
  check('lote de fio baixou 93 -> 0,3 kg (consumo real da malharia)', Number(fioAfter.rows[0].remaining_qty) === 0.3, JSON.stringify(fioAfter.rows[0]));

  // Rastreabilidade ponta a ponta: pluma -> fio -> malha
  const chain = await client.query(
    `SELECT (SELECT count(*) FROM public.production_lot_genealogy WHERE input_lot_id=$1 AND output_lot_id=$2)::int AS elo1,
            (SELECT count(*) FROM public.production_lot_genealogy WHERE input_lot_id=$2 AND output_lot_id=(SELECT id FROM public.stock_lots WHERE company_id=$3 AND lot_number='MALHA-LOTE-001'))::int AS elo2`,
    [LOTE_PLUMA, fioLotId, A]);
  check('rastreabilidade pluma -> fio -> malha persistida (2 elos)', chain.rows[0].elo1 >= 1 && chain.rows[0].elo2 >= 1, JSON.stringify(chain.rows[0]));
  // Regressão 20261019160000: setor da OP vem da primeira operação do roteiro.
  const sectors = await client.query(`SELECT product_code, sector FROM public.production_orders WHERE id IN ($1,$2) ORDER BY product_code`, [opFiaId, opMalId]);
  const sectorByProduct = Object.fromEntries(sectors.rows.map(r => [r.product_code, r.sector]));
  check('OP de fiação classificada no setor Fiação (não Tecelagem)', sectorByProduct['FIO-30-CARD'] === 'Fiação', JSON.stringify(sectorByProduct));
  check('OP de malharia classificada no setor Malharia', sectorByProduct['MALHA-30'] === 'Malharia', JSON.stringify(sectorByProduct));
  const opsDone = await client.query(`SELECT count(*)::int c FROM public.production_orders WHERE id IN ($1,$2) AND status='completed'`, [opFiaId, opMalId]);
  check('as duas OPs da cadeia constam concluídas', opsDone.rows[0].c === 2, `done=${opsDone.rows[0].c}`);
  const reservedLeft = await client.query(`SELECT COALESCE(sum(reserved_qty),0) AS r FROM public.stock_balances WHERE company_id=$1`, [A]);
  check('nenhuma reserva fica pendurada ao fim da cadeia', Number(reservedLeft.rows[0].r) === 0, JSON.stringify(reservedLeft.rows[0]));


  // ===== Parte 4: malha crua -> tinturaria/acabamento -> malha tingida (produto final) =====
  const MALHA_TING = 'fa111111-1111-4111-8111-111111111111';
  const CORANTE = 'fa222222-2222-4222-8222-222222222222';
  const LOTE_CORANTE = 'fa333333-3333-4333-8333-333333333333';
  const LOTE_CORANTE_BLOQ = 'fa444444-4444-4444-8444-444444444444';
  const JET = 'fa555555-5555-4555-8555-555555555555';
  const ROT_BEN = 'fa777777-7777-4777-8777-777777777777';

  const malhaCruaLot = await client.query(`SELECT id, remaining_qty FROM public.stock_lots WHERE company_id=$1 AND lot_number='MALHA-LOTE-001'`, [A]);
  const malhaCruaLotId = malhaCruaLot.rows[0].id;
  check('estoque parte da malha crua da etapa anterior (87 kg)', Number(malhaCruaLot.rows[0].remaining_qty) === 87, JSON.stringify(malhaCruaLot.rows[0]));

  await client.query(`SET session_replication_role = 'replica'`);
  await insertDyn('products', { id: MALHA_TING, company_id: A, code: 'MALHA-TING-30', name: 'Malha fio 30 tingida e acabada', type: 'finished', unit: 'kg', item_kind: 'acabado' });
  await insertDyn('products', { id: CORANTE, company_id: A, code: 'CORANTE-AZUL', name: 'Corante reativo azul', type: 'raw_material', unit: 'kg', item_kind: 'insumo' });
  const benSteps = [
    ['Preparação e Purga', 'Tinturaria'], ['Tingimento', 'Tinturaria'], ['Centrifugação', 'Tinturaria'],
    ['Secagem e Estabilização', 'Acabamento'], ['Revisão e Rolagem', 'Acabamento'],
  ];
  for (const [i, [name, sector]] of benSteps.entries()) {
    await insertDyn('production_steps', { company_id: A, name, code: 'BEN-' + (i + 1), sequence: i + 1, estimated_time_minutes: 90, sector });
  }
  await insertDyn('production_routes', { id: ROT_BEN, company_id: A, code: 'ROT-BEN-30', product_id: MALHA_TING, is_active: true });
  for (const [i, [name]] of benSteps.entries()) {
    await insertDyn('production_route_steps', { route_id: ROT_BEN, company_id: A, sequence: i + 1, step_name: name, operation_time_minutes: 90 });
  }
  // Estrutura + receita configuradas: 1,04 kg de malha crua e 0,025 kg de corante por kg acabado
  await insertDyn('production_bom', { company_id: A, product_id: MALHA_TING, component_id: MALHA, quantity: 1.04, waste_percentage: 0 });
  await insertDyn('production_bom', { company_id: A, product_id: MALHA_TING, component_id: CORANTE, quantity: 0.025, waste_percentage: 0 });
  await insertDyn('production_machines', { id: JET, code: 'JET-01', name: 'Jet de Tingimento 01', company_id: A });
  await insertDyn('stock_lots', { id: LOTE_CORANTE, company_id: A, product_id: CORANTE, product_code: 'CORANTE-AZUL', product_name: 'Corante reativo azul', lot_number: 'CORANTE-LOTE-001', quantity: 10, remaining_qty: 10, status: 'available', quality_status: 'approved', unit_cost: 40 });
  await insertDyn('stock_lots', { id: LOTE_CORANTE_BLOQ, company_id: A, product_id: CORANTE, product_code: 'CORANTE-AZUL', product_name: 'Corante reativo azul', lot_number: 'CORANTE-LOTE-BLOQ', quantity: 5, remaining_qty: 5, status: 'available', quality_status: 'quarantine', unit_cost: 40 });
  await insertDyn('stock_balances', { company_id: A, product_id: CORANTE, lot_id: LOTE_CORANTE, branch_id: null, canal_operacional: 'ATACADO_INDUSTRIA', quantity: 10, reserved_qty: 0 });
  // Saldo do lote de malha crua (gerado pela conclusão da malharia)
  const malhaBalance = await client.query(`SELECT id FROM public.stock_balances WHERE company_id=$1 AND lot_id=$2`, [A, malhaCruaLotId]);
  if (malhaBalance.rows.length === 0) {
    await insertDyn('stock_balances', { company_id: A, product_id: MALHA, lot_id: malhaCruaLotId, branch_id: null, canal_operacional: 'ATACADO_INDUSTRIA', quantity: 87, reserved_qty: 0 });
  }
  await client.query(`SET session_replication_role = 'origin'`);
  await asUser(GERENTE);

  // ---- OP de beneficiamento: 80 kg de malha tingida e acabada ----
  const opBen = await tryRpc(`SELECT public.create_textile_production_order($1, 80, 'op-beneficiamento-01', 'high') AS r`, [MALHA_TING]);
  const opBenId = opBen.rows?.[0]?.r?.production_order_id;
  check('OP de beneficiamento criada (malha tingida, 80 kg)', opBen.ok && !!opBenId, opBen.error || JSON.stringify(opBen.rows?.[0]?.r).slice(0, 130));
  const benSector = await client.query(`SELECT sector FROM public.production_orders WHERE id=$1`, [opBenId]);
  check('OP classificada no setor Tinturaria (1ª operação do roteiro)', benSector.rows[0].sector === 'Tinturaria', JSON.stringify(benSector.rows[0]));

  const resBloq = await tryRpc(`SELECT public.reserve_production_materials($1, $2::jsonb, 'reserva-ben-bloq') AS r`,
    [opBenId, JSON.stringify([{ component_id: CORANTE, lot_id: LOTE_CORANTE_BLOQ, quantity: 2 }])]);
  check('reservar corante em quarentena é rejeitado', !resBloq.ok, resBloq.error);
  const resBen = await tryRpc(`SELECT public.reserve_production_materials($1, $2::jsonb, 'reserva-beneficiamento-01') AS r`,
    [opBenId, JSON.stringify([
      { component_id: MALHA, lot_id: malhaCruaLotId, quantity: 83.2 },
      { component_id: CORANTE, lot_id: LOTE_CORANTE, quantity: 2 },
    ])]);
  check('reservar malha crua (83,2 kg) + corante da receita (2 kg)', resBen.ok, resBen.error);
  const schedBen = await tryRpc(`SELECT public.schedule_production_order($1,'2026-10-24T08:00:00-03:00','2026-10-24T16:00:00-03:00','sched-beneficiamento-01',NULL,$2,NULL,NULL,'diurno') AS id`, [opBenId, JET]);
  check('programar tingimento no Jet 01', schedBen.ok, schedBen.error);

  const benOpSteps = await client.query(`SELECT id, sequence FROM public.production_order_steps WHERE production_order_id=$1 ORDER BY sequence`, [opBenId]);
  check('roteiro de beneficiamento gerou 5 etapas acompanháveis', benOpSteps.rows.length === 5, `steps=${benOpSteps.rows.length}`);
  // Metas encadeadas: 80 -> 79 -> 78 -> 77 -> 76 -> 75 kg aprovados
  const benPlan = [[79, 1], [78, 1], [77, 1], [76, 1], [75, 1]];
  let benExecOk = true, benExecErr = '';
  for (const [i, st] of benOpSteps.rows.entries()) {
    const r = await tryRpc(`SELECT public.record_production_step_progress($1,'progress',$2,$3,'Operador Tinturaria')`, [st.id, benPlan[i][0], benPlan[i][1]]);
    if (!r.ok) { benExecOk = false; benExecErr = r.error; break; }
  }
  check('executar preparação -> tingimento -> centrifugação -> secagem -> revisão', benExecOk, benExecErr);

  const prematureBen = await tryRpc(`SELECT public.complete_production_order($1,'conclusao-beneficiamento-01',75,5,$2::jsonb,'MALHA-TING-LOTE-001') AS r`,
    [opBenId, JSON.stringify([
      { component_id: MALHA, lot_id: malhaCruaLotId, quantity: 83.2 },
      { component_id: CORANTE, lot_id: LOTE_CORANTE, quantity: 2 },
    ])]);
  check('concluir beneficiamento sem qualidade (cor/solidez) é bloqueado', !prematureBen.ok, prematureBen.error);
  const inspBen = await insertDyn('quality_inspections', { company_id: A, production_order_id: opBenId, inspector: 'Laboratório', approved_quantity: 75, rejected_quantity: 3, status: 'open', notes: 'Cor aprovada contra padrão do cliente; solidez e toque aprovados' });
  const decBen = await tryRpc(`SELECT public.decide_production_quality_inspection($1,'approved') AS r`, [inspBen.id]);
  check('laboratório aprova cor e acabamento (75 kg)', decBen.ok, decBen.error);
  const compBen = await tryRpc(`SELECT public.complete_production_order($1,'conclusao-beneficiamento-01',75,5,$2::jsonb,'MALHA-TING-LOTE-001') AS r`,
    [opBenId, JSON.stringify([
      { component_id: MALHA, lot_id: malhaCruaLotId, quantity: 83.2 },
      { component_id: CORANTE, lot_id: LOTE_CORANTE, quantity: 2 },
    ])]);
  check('concluir beneficiamento consumindo malha + corante', compBen.ok, compBen.error || JSON.stringify(compBen.rows?.[0]?.r).slice(0, 130));

  const tingLot = await client.query(`SELECT remaining_qty, quality_status, unit_cost FROM public.stock_lots WHERE company_id=$1 AND lot_number='MALHA-TING-LOTE-001'`, [A]);
  check('PRODUTO FINAL TINGIDO: lote MALHA-TING-LOTE-001 com 75 kg liberado', tingLot.rows.length === 1 && Number(tingLot.rows[0].remaining_qty) === 75 && tingLot.rows[0].quality_status === 'approved', JSON.stringify(tingLot.rows[0]));
  const malhaCruaAfter = await client.query(`SELECT remaining_qty FROM public.stock_lots WHERE id=$1`, [malhaCruaLotId]);
  check('malha crua baixou 87 -> 3,8 kg', Number(malhaCruaAfter.rows[0].remaining_qty) === 3.8, JSON.stringify(malhaCruaAfter.rows[0]));
  const coranteAfter = await client.query(`SELECT remaining_qty FROM public.stock_lots WHERE id=$1`, [LOTE_CORANTE]);
  check('corante baixou 10 -> 8 kg (receita consumida)', Number(coranteAfter.rows[0].remaining_qty) === 8, JSON.stringify(coranteAfter.rows[0]));
  const tingGenealogy = await client.query(
    `SELECT count(DISTINCT input_lot_id)::int AS inputs FROM public.production_lot_genealogy WHERE output_lot_id = (SELECT id FROM public.stock_lots WHERE company_id=$1 AND lot_number='MALHA-TING-LOTE-001')`, [A]);
  check('genealogia do tingido liga malha crua + corante (2 insumos)', tingGenealogy.rows[0].inputs === 2, JSON.stringify(tingGenealogy.rows[0]));
  const fullChain = await client.query(
    `SELECT count(*)::int AS elos FROM public.production_lot_genealogy g
      WHERE g.output_lot_id IN (SELECT id FROM public.stock_lots WHERE company_id=$1 AND lot_number IN ('FIO30-LOTE-001','MALHA-LOTE-001','MALHA-TING-LOTE-001'))`, [A]);
  check('cadeia completa pluma->fio->malha->tingido tem 4 elos de genealogia', fullChain.rows[0].elos === 4, JSON.stringify(fullChain.rows[0]));
  const custoUnit = await client.query(`SELECT unit_cost FROM public.stock_lots WHERE company_id=$1 AND lot_number='MALHA-TING-LOTE-001'`, [A]);
  check('custo do lote tingido calculado dos insumos reais (> 0)', Number(custoUnit.rows[0].unit_cost) > 0, JSON.stringify(custoUnit.rows[0]));
  const opsCadeia = await client.query(`SELECT count(*)::int c FROM public.production_orders WHERE company_id=$1 AND status='completed' AND product_code IN ('FIO-30-CARD','MALHA-30','MALHA-TING-30','TECIDO-01')`, [A]);
  check('acompanhamento final: 4 OPs da cadeia concluídas', opsCadeia.rows[0].c === 4, `done=${opsCadeia.rows[0].c}`);


  // ===== Parte 5: vender e expedir a malha tingida (fechamento do ciclo) =====
  const CLIENTE = 'fb111111-1111-4111-8111-111111111111';
  const PED1 = 'fb222222-2222-4222-8222-222222222222';
  const PED2 = 'fb333333-3333-4333-8333-333333333333';
  const tingLotId = (await client.query(`SELECT id FROM public.stock_lots WHERE company_id=$1 AND lot_number='MALHA-TING-LOTE-001'`, [A])).rows[0].id;

  await client.query(`SET session_replication_role = 'replica'`);
  await insertDyn('clients', { id: CLIENTE, company_id: A, name: 'Confecção Exemplo LTDA', trade_name: 'Confecção Exemplo', document_type: 'CNPJ', document: '11222333000181' });
  await insertDyn('orders', { id: PED1, company_id: A, number: 'PV-2026-0001', client_id: CLIENTE, client_name: 'Confecção Exemplo LTDA', date: new Date().toISOString(), subtotal: 3000, discount: 0, shipping: 0, total: 3000, payment_method: 'boleto', payment_condition: '28 dias', status: 'confirmed', priority: 'normal' });
  await insertDyn('order_items', { order_id: PED1, company_id: A, product_id: MALHA_TING, product_code: 'MALHA-TING-30', product_name: 'Malha fio 30 tingida e acabada', quantity: 50, unit_price: 60, discount: 0, total: 3000 });
  await insertDyn('orders', { id: PED2, company_id: A, number: 'PV-2026-0002', client_id: CLIENTE, client_name: 'Confecção Exemplo LTDA', date: new Date().toISOString(), subtotal: 2400, discount: 0, shipping: 0, total: 2400, payment_method: 'boleto', payment_condition: '28 dias', status: 'confirmed', priority: 'normal' });
  await insertDyn('order_items', { order_id: PED2, company_id: A, product_id: MALHA_TING, product_code: 'MALHA-TING-30', product_name: 'Malha fio 30 tingida e acabada', quantity: 40, unit_price: 60, discount: 0, total: 2400 });
  await client.query(`SET session_replication_role = 'origin'`);
  await asUser(GERENTE);

  const reserve1 = await tryRpc(`SELECT public.wms_reserve_order_stock($1) AS r`, [PED1]);
  check('vender 50 kg: reserva de venda separa do saldo disponível', reserve1.ok && Number(reserve1.rows[0].r.total_reserved) === 50, reserve1.error || JSON.stringify(reserve1.rows[0].r).slice(0, 140));
  const balAfterReserve = await client.query(`SELECT quantity, reserved_qty FROM public.stock_balances WHERE company_id=$1 AND product_code='MALHA-TING-30'`, [A]);
  check('saldo: 75 kg físicos, 50 reservados ao pedido', Number(balAfterReserve.rows[0].quantity) === 75 && Number(balAfterReserve.rows[0].reserved_qty) === 50, JSON.stringify(balAfterReserve.rows[0]));

  const pick1 = await tryRpc(`SELECT public.wms_pick_order_stock($1) AS r`, [PED1]);
  check('separação (picking) do pedido PV-2026-0001', pick1.ok && Number(pick1.rows[0].r.lines_picked) === 1, pick1.error || JSON.stringify(pick1.rows[0].r).slice(0, 140));
  const balAfterPick = await client.query(`SELECT quantity, reserved_qty FROM public.stock_balances WHERE company_id=$1 AND product_code='MALHA-TING-30'`, [A]);
  check('picking baixa o saldo: 25 kg físicos, 0 reservados', Number(balAfterPick.rows[0].quantity) === 25 && Number(balAfterPick.rows[0].reserved_qty) === 0, JSON.stringify(balAfterPick.rows[0]));

  const ship1 = await tryRpc(`SELECT public.wms_ship_order($1) AS r`, [PED1]);
  const resv1 = await client.query(`SELECT status FROM public.stock_reservations WHERE order_id=$1`, [PED1]);
  check('expedição marca o pedido como expedido (shipped)', ship1.ok && Number(ship1.rows[0].r.lines_shipped) === 1 && resv1.rows[0].status === 'shipped', ship1.error || JSON.stringify(resv1.rows[0]));

  // Expedição por lote (20261019170000): a reserva nasce amarrada ao lote,
  // o picking baixa o lote e o movimento identifica lote/cliente.
  const resvLotId = await client.query(`SELECT lot_id FROM public.stock_reservations WHERE order_id=$1 AND status='shipped'`, [PED1]);
  check('reserva de venda nasce amarrada ao lote tingido', resvLotId.rows.length === 1 && resvLotId.rows[0].lot_id === tingLotId, JSON.stringify(resvLotId.rows[0]));
  const tingLotAfterShip = await client.query(`SELECT remaining_qty FROM public.stock_lots WHERE id=$1`, [tingLotId]);
  const outMovements = await client.query(`SELECT count(*)::int AS total, count(lot_id)::int AS com_lote, max(batch) AS lote FROM public.stock_movements WHERE company_id=$1 AND source='wms_pick' AND product_id=$2`, [A, MALHA_TING]);
  check('expedição baixa o lote (75 -> 25 kg) e o movimento identifica o lote', Number(tingLotAfterShip.rows[0].remaining_qty) === 25 && outMovements.rows[0].total >= 1 && outMovements.rows[0].com_lote >= 1 && outMovements.rows[0].lote === 'MALHA-TING-LOTE-001',
    `lote_restante=${tingLotAfterShip.rows[0].remaining_qty} movimentos=${outMovements.rows[0].total} com_lote=${outMovements.rows[0].com_lote} batch=${outMovements.rows[0].lote}`);

  // Lote em quarentena nunca é reservado para venda
  const PROD_BLOQ = 'fb444444-4444-4444-8444-444444444444';
  const LOTE_BLOQ_VENDA = 'fb555555-5555-4555-8555-555555555555';
  const PED3 = 'fb666666-6666-4666-8666-666666666666';
  await client.query(`SET session_replication_role = 'replica'`);
  await insertDyn('products', { id: PROD_BLOQ, company_id: A, code: 'TECIDO-BLOQ', name: 'Tecido em quarentena', type: 'finished', unit: 'kg', item_kind: 'acabado' });
  await insertDyn('stock_lots', { id: LOTE_BLOQ_VENDA, company_id: A, product_id: PROD_BLOQ, product_code: 'TECIDO-BLOQ', product_name: 'Tecido em quarentena', lot_number: 'BLOQ-LOTE-001', quantity: 10, remaining_qty: 10, status: 'available', quality_status: 'quarantine', unit_cost: 5 });
  await insertDyn('stock_balances', { company_id: A, product_id: PROD_BLOQ, lot_id: LOTE_BLOQ_VENDA, branch_id: null, canal_operacional: 'ATACADO_INDUSTRIA', quantity: 10, reserved_qty: 0 });
  await insertDyn('orders', { id: PED3, company_id: A, number: 'PV-2026-0003', client_id: CLIENTE, client_name: 'Confecção Exemplo LTDA', date: new Date().toISOString(), subtotal: 300, discount: 0, shipping: 0, total: 300, payment_method: 'boleto', payment_condition: '28 dias', status: 'confirmed', priority: 'normal' });
  await insertDyn('order_items', { order_id: PED3, company_id: A, product_id: PROD_BLOQ, product_code: 'TECIDO-BLOQ', product_name: 'Tecido em quarentena', quantity: 5, unit_price: 60, discount: 0, total: 300 });
  await client.query(`SET session_replication_role = 'origin'`);
  await asUser(GERENTE);
  const reserveBloq = await tryRpc(`SELECT public.wms_reserve_order_stock($1) AS r`, [PED3]);
  check('venda com único lote em quarentena não reserva nada', reserveBloq.ok && Number(reserveBloq.rows[0].r.total_reserved) === 0 && Number(reserveBloq.rows[0].r.items_partial) === 1, reserveBloq.error || JSON.stringify(reserveBloq.rows[0].r).slice(0, 140));

  const reserve2 = await tryRpc(`SELECT public.wms_reserve_order_stock($1) AS r`, [PED2]);
  check('pedido de 40 kg com só 25 em saldo reserva parcial (25 + pendente)', reserve2.ok && Number(reserve2.rows[0].r.items_partial) === 1 && Number(reserve2.rows[0].r.total_reserved) === 25, reserve2.error || JSON.stringify(reserve2.rows[0].r).slice(0, 140));

  await asUser(OUTRO);
  const crossReserve = await tryRpc(`SELECT public.wms_reserve_order_stock($1) AS r`, [PED1]);
  check('usuário de outra empresa não reserva pedido alheio', !crossReserve.ok, crossReserve.error);
  await asUser(GERENTE);


  // ===== Parte 6: Painel do Gerente sobre os dados reais da cadeia =====
  // Mesmas fórmulas de src/lib/pcp/managerMetrics.ts, conferidas em SQL.
  const dash = await client.query(`
    SELECT
      (SELECT count(*) FROM public.production_orders WHERE company_id=$1) AS total_ops,
      (SELECT count(*) FROM public.production_orders WHERE company_id=$1 AND status NOT IN ('completed','cancelled','canceled')) AS open_ops,
      (SELECT count(*) FROM public.production_orders WHERE company_id=$1 AND status='completed' AND completed_date >= now() - interval '30 days') AS completed_30d,
      (SELECT count(*) FROM public.production_orders WHERE company_id=$1 AND status NOT IN ('completed','cancelled','canceled') AND due_date < now()) AS overdue_open,
      (SELECT count(*) FROM public.production_orders o WHERE o.company_id=$1 AND o.status IN ('planned','in_progress','paused','waiting_material')
         AND NOT EXISTS (SELECT 1 FROM public.production_schedule s WHERE s.production_order_id=o.id AND s.company_id=$1 AND s.status IN ('scheduled','in_progress'))) AS unscheduled_open,
      (SELECT COALESCE(sum(remaining_qty),0) FROM public.stock_lots WHERE company_id=$1 AND product_code='PLUMA-01') AS pluma_saldo,
      (SELECT COALESCE(sum(remaining_qty),0) FROM public.stock_lots WHERE company_id=$1 AND product_code='MALHA-TING-30') AS tingido_saldo,
      (SELECT count(*) FROM public.stock_lots WHERE company_id=$1 AND remaining_qty > 0
         AND (lower(COALESCE(quality_status,'')) IN ('blocked','quarantine','rejected','bloqueada','bloqueado','rejeitada','rejeitado','quarentena') OR status <> 'available')) AS blocked_lots,
      (SELECT COALESCE(sum(quantity),0) FROM public.stock_movements WHERE company_id=$1 AND source='wms_pick' AND created_at >= now() - interval '7 days' AND product_code='MALHA-TING-30') AS expedido_7d,
      (SELECT count(DISTINCT o.unit) FROM public.quality_inspections q JOIN public.production_orders o ON o.id=q.production_order_id WHERE q.company_id=$1) AS quality_units
  `, [A]);
  const d = dash.rows[0];
  check('painel: OPs abertas e concluídas (30d) da cadeia', Number(d.open_ops) === 2 && Number(d.completed_30d) === 4, JSON.stringify(d));
  check('painel: 1 OP aberta atrasada (a que ficou aguardando material)', Number(d.overdue_open) === 1, `overdue=${d.overdue_open}`);
  check('painel: nenhuma OP aberta sem programação', Number(d.unscheduled_open) === 0, `unscheduled=${d.unscheduled_open}`);
  const prodUnit = await client.query(`
    SELECT unit, sum(produced_quantity) AS produced, sum(rejected_quantity) AS rejected
      FROM public.production_orders
     WHERE company_id=$1 AND status='completed' AND completed_date >= now() - interval '30 days'
     GROUP BY unit ORDER BY unit`, [A]);
  const prodMap = Object.fromEntries(prodUnit.rows.map(r => [r.unit, r]));
  check('painel: produção por unidade sem somar m com kg (m=95, kg=255)', Number(prodMap['m'].produced) === 95 && Number(prodMap['kg'].produced) === 255 && Number(prodMap['kg'].rejected) === 15, JSON.stringify(prodMap));
  check('painel: saldo de pluma 382 kg e de malha tingida 25 kg (pós-expedição)', Number(d.pluma_saldo) === 382 && Number(d.tingido_saldo) === 25, JSON.stringify({ pluma: d.pluma_saldo, tingido: d.tingido_saldo }));
  check('painel: 2 lotes bloqueados/quarentena com saldo', Number(d.blocked_lots) === 2, `blocked=${d.blocked_lots}`);
  check('painel: expedido em 7 dias = 50 kg de malha tingida', Number(d.expedido_7d) === 50, `expedido=${d.expedido_7d}`);
  check('painel: qualidade com unidades mistas (m e kg) não gera taxa falsa', Number(d.quality_units) === 2, `units=${d.quality_units}`);
  const sectorDone = await client.query(`
    SELECT sector, count(*)::int AS c FROM public.production_orders
     WHERE company_id=$1 AND status='completed' GROUP BY sector ORDER BY sector`, [A]);
  const sectorMap2 = Object.fromEntries(sectorDone.rows.map(r => [r.sector, r.c]));
  check('painel: conclusões por setor (Fiação/Malharia/Tecelagem/Tinturaria = 1 cada)',
    sectorMap2['Fiação'] === 1 && sectorMap2['Malharia'] === 1 && sectorMap2['Tecelagem'] === 1 && sectorMap2['Tinturaria'] === 1, JSON.stringify(sectorMap2));

  // Janela de hoje: cancela a janela ativa da OP-1002 e reprograma para hoje
  const op2Sched = await client.query(`SELECT id FROM public.production_schedule WHERE production_order_id=$1 AND status IN ('scheduled','in_progress') LIMIT 1`, [OP2]);
  if (op2Sched.rows.length > 0) {
    const cancelToday = await tryRpc(`SELECT public.cancel_production_schedule($1)`, [op2Sched.rows[0].id]);
    const todayWindow = await tryRpc(`SELECT public.schedule_production_order($1, now() + interval '1 hour', now() + interval '3 hours', 'sched-hoje-op2', NULL, $2, NULL, NULL, 'diurno')`, [OP2, MACHINE]);
    const windowsToday = await client.query(`SELECT count(*)::int AS c FROM public.production_schedule WHERE company_id=$1 AND status IN ('scheduled','in_progress') AND planned_start <= CURRENT_DATE + interval '1 day' AND planned_end >= CURRENT_DATE`, [A]);
    check('painel: reprogramar para hoje reflete 1 janela no dia', cancelToday.ok && todayWindow.ok && windowsToday.rows[0].c >= 1, todayWindow.error || `windows=${windowsToday.rows[0].c}`);
  } else {
    check('painel: reprogramar para hoje reflete 1 janela no dia', false, 'OP-1002 sem janela ativa para cancelar');
  }

  const failedCount = results.filter(r => !r[1]).length;
  console.log(`MANAGER JOURNEY: ${results.length - failedCount}/${results.length} PASS`);
  if (failedCount > 0) process.exitCode = 3;
}
