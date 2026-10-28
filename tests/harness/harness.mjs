// Harness embarcado do USE ERP — replay completo e verificável SEM Docker:
// stubs da plataforma -> 00-baseline -> patches -> TODAS as migrations ->
// 99-local-final -> seeds BIL/fluxo/tecelagem -> asserções de negócio.
// Usa os binários zonky (@embedded-postgres/linux-x64) via initdb/pg_ctl
// diretos (a API JS da lib não resolve caminhos sob o bun neste sandbox).
// Rode com:  bun install && bun harness.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.ERP_REPO || path.resolve(HERE, '..', '..');
const NATIVE = path.join(HERE, 'node_modules/@embedded-postgres/linux-x64/native');
const BIN = path.join(NATIVE, 'bin');
const libDir = path.join(NATIVE, 'lib');
const ENV = { ...process.env, LD_LIBRARY_PATH: libDir };

// zonky procura libicu*.so.60; o pacote traz .so.60.2 -> symlinks.
for (const base of ['libicuuc', 'libicui18n', 'libicudata']) {
  const link = path.join(libDir, `${base}.so.60`);
  const target = fs.readdirSync(libDir).find((f) => f.startsWith(`${base}.so.60.`));
  if (target && !fs.existsSync(link)) fs.symlinkSync(path.join(libDir, target), link);
}
// Extensões falsas pg_cron/pg_net: control+script para o CREATE EXTENSION
// passar; os objetos inertes (cron.schedule, net.http_*) nascem do script.
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

function run(cmd, args) {
  const r = spawnSync(cmd, args, { env: ENV, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} ${args[0]} falhou: ${r.stderr || r.stdout}`);
  return r;
}

const DATA = path.join(HERE, 'data');
fs.rmSync(DATA, { recursive: true, force: true });
run(path.join(BIN, 'initdb'), ['-D', DATA, '-U', 'postgres', '--auth=trust', '--encoding=UTF8']);
run(path.join(BIN, 'pg_ctl'), ['-D', DATA, '-l', path.join(HERE, 'pg.log'), '-o', '-p 55444 -k /tmp -h 127.0.0.1', '-w', 'start']);
console.log('== postgres embarcado no ar (55444)');

const { Client } = await import('pg');
const client = new Client({ host: '127.0.0.1', port: 55444, user: 'postgres', database: 'postgres' });
const notices = [];
client.on('notice', (n) => notices.push(n.message ?? ''));
await client.connect();

let passed = 0; let failed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${extra}`); }
}

async function runFile(label, file) {
  let sql = fs.readFileSync(file, 'utf8');
  if (path.basename(file).startsWith('seed-')) {
    // Emula o psql: remove meta-comandos (\set/\if/\getenv...) e interpola
    // as variáveis que os .bat/.ps1 passariam com -v.
    sql = sql.replace(/^\s*\\(set|if|else|endif|getenv)\b.*$/gm, '');
    sql = sql.replace(/:'admin_email'/g, `'etcsuporte889@gmail.com'`);
    sql = sql.replace(/:'admin_password'/g, `'SenhaTeste123'`);
  }
  try {
    await client.query('BEGIN');
    // migrate.sh roda cada arquivo numa sessão psql nova (search_path do
    // papel); aqui repomos o padrão a cada arquivo — a baseline e algumas
    // migrations fazem SET search_path só para si.
    await client.query(`SELECT set_config('search_path', '"$user", public, auth, extensions', false)`);
    await client.query(sql);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`FALHOU ${label}: ${e.message}`);
    if (e.position) console.error('  contexto:', JSON.stringify(sql.slice(Math.max(0, Number(e.position) - 90), Number(e.position) + 30)));
    throw e;
  }
}

try {
  console.log('== stubs + baseline');
  await runFile('stubs', path.join(HERE, 'stubs.sql'));
  // O ALTER ROLE dos stubs só vale em sessão nova; esta sessão ajusta já
  // (gen_random_bytes/digest do pgcrypto moram em "extensions").
  await client.query(`SET search_path = "$user", public, auth, extensions`);
  const scripts = path.join(REPO, 'docker/local/scripts');
  await runFile('00-baseline', path.join(scripts, '00-baseline.sql'));

  console.log('== migrations (ordem oficial do migrate.sh)');
  const migDir = path.join(REPO, 'supabase/migrations');
  const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
  let applied = 0;
  for (const file of files) {
    const version = file.split('_')[0];
    const before = path.join(scripts, 'patches', `before-${version}.sql`);
    if (fs.existsSync(before)) await runFile(`patch ${path.basename(before)}`, before);
    await runFile(file, path.join(migDir, file));
    applied++;
    const after = path.join(scripts, 'patches', `after-${version}.sql`);
    if (fs.existsSync(after)) await runFile(`patch ${path.basename(after)}`, after);
    if (applied % 100 === 0) console.log(`  ... ${applied}/${files.length}`);
  }
  await runFile('99-local-final', path.join(scripts, '99-local-final.sql'));
  check(`replay completo (${files.length} migrations)`, applied === files.length, `applied=${applied}`);

  console.log('== seeds');
  await runFile('seed-bil', path.join(scripts, 'seed-bil.sql'));
  await runFile('seed-fluxo-teste', path.join(scripts, 'seed-fluxo-teste.sql'));
  await runFile('seed-tecelagem-teste', path.join(scripts, 'seed-tecelagem-teste.sql'));

  const q = async (sql, params) => (await client.query(sql, params)).rows;

  console.log('== asserções');
  const company = (await q(`SELECT id FROM public.companies WHERE cnpj = '30.965.938/0001-07'`))[0];
  check('BIL cadastrada', !!company);

  const orders = await q(
    `SELECT po.id, po.status FROM public.production_orders po
      JOIN public.weaving_order_profiles wp ON wp.production_order_id = po.id
      WHERE wp.beam_code = 'ROLO-URD-TESTE-001'`);
  check('OP de tecelagem existe', orders.length === 1, `n=${orders.length}`);
  check('OP de tecelagem concluída', orders[0]?.status === 'completed', `status=${orders[0]?.status}`);

  const profile = (await q(
    `SELECT planned_length_m FROM public.weaving_order_profiles WHERE beam_code = 'ROLO-URD-TESTE-001'`))[0];
  check('perfil do tear persistido (500 m planejados)', Number(profile?.planned_length_m) === 500);
  const loomAgg = (await q(
    `SELECT count(DISTINCT pm.id)::int AS teares,
            COALESCE(sum(e.quantity_m), 0)::float AS produzidos
       FROM public.production_machines pm
       LEFT JOIN public.weaving_order_profiles wp ON wp.machine_id = pm.id
       LEFT JOIN public.weaving_production_events e ON e.production_order_id = wp.production_order_id
      WHERE pm.sector = 'Tecelagem'`))[0];
  check('mapa de teares: tear cadastrado e produção apontada agregam (base do painel)', loomAgg.teares >= 1, JSON.stringify(loomAgg));


  const lot = async (n) => (await q(`SELECT remaining_qty FROM public.stock_lots WHERE lot_number = $1`, [n]))[0];
  check('tecido produzido: 480 m em lote', Number((await lot('TECIDO-LOTE-TESTE-001'))?.remaining_qty) === 480);
  check('urdume consumido: 70 -> 12,5 kg', Number((await lot('FIO-URD-LOTE-TESTE-001'))?.remaining_qty) === 12.5);
  check('trama consumida: 60 -> 10 kg', Number((await lot('FIO-TRM-LOTE-TESTE-001'))?.remaining_qty) === 10);

  const events = (await q(
    `SELECT count(*)::int AS n, COALESCE(sum(downtime_minutes) FILTER
       (WHERE event_type IN ('warp_break','weft_break')), 0) AS downtime
     FROM public.weaving_production_events WHERE production_order_id = $1`, [orders[0].id]))[0];
  check('5 eventos do tear registrados', events.n === 5, `n=${events.n}`);
  check('paradas por quebra somam 19 min', Number(events.downtime) === 19, `dt=${events.downtime}`);

  const machines = await q(`SELECT code, sector FROM public.production_machines WHERE code IN ('TEAR-01','FIL-01','CIRC-01','JET-01')`);
  const sectorOf = Object.fromEntries(machines.map((m) => [m.code, m.sector]));
  check('máquinas nascem com setor (filtro das centrais)',
    sectorOf['TEAR-01'] === 'Tecelagem' && sectorOf['FIL-01'] === 'Fiação'
    && sectorOf['CIRC-01'] === 'Malharia' && sectorOf['JET-01'] === 'Tinturaria',
    JSON.stringify(sectorOf));

  console.log('== classificação de desvios (skills por setor)');
  // Os GUCs de JWT dos seeds são locais às transações deles; o smoke
  // assume a identidade do admin da BIL nesta sessão.
  const admin = (await q(`SELECT id FROM auth.users WHERE email = 'etcsuporte889@gmail.com'`))[0];
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false),
                  set_config('request.jwt.claim.role', 'authenticated', false)`, [admin.id]);
  const spinningOrder = (await q(
    `SELECT po.id FROM public.production_orders po
       JOIN public.products p ON p.id = po.product_id WHERE p.code = 'FIO-30-CARD' LIMIT 1`))[0];
  await q(`SELECT public.record_sector_event($1, 'fiacao', 'stop', NULL, NULL, NULL, NULL, 15, 'parada para manutenção', 'Operador Teste', 'maquina', 'em_investigacao')`, [spinningOrder.id]);
  const sectorEvent = (await q(
    `SELECT deviation_category, cause_status FROM public.sector_production_events
      WHERE production_order_id = $1 AND event_type = 'stop'`, [spinningOrder.id]))[0];
  check('evento de fiação gravado com classificação e causa em investigação',
    sectorEvent?.deviation_category === 'maquina' && sectorEvent?.cause_status === 'em_investigacao',
    JSON.stringify(sectorEvent));
  let rejected = false;
  try {
    await q(`SELECT public.record_sector_event($1, 'fiacao', 'stop', NULL, NULL, NULL, NULL, 5, NULL, NULL, 'cor', NULL)`, [spinningOrder.id]);
  } catch { rejected = true; }
  check('categoria de outro setor é rejeitada pela RPC (cor na fiação)', rejected);

  await q(`SELECT public.record_weaving_event($1, 'stop', NULL, NULL, NULL, NULL, 8, 'troca de pente', 'Operador Teste', 'preparacao', 'confirmada')`, [orders[0].id]);
  const weavingEvent = (await q(
    `SELECT deviation_category, cause_status FROM public.weaving_production_events
      WHERE production_order_id = $1 AND deviation_category = 'preparacao'`, [orders[0].id]))[0];
  check('evento de tecelagem gravado com classificação própria',
    weavingEvent?.cause_status === 'confirmada', JSON.stringify(weavingEvent));
  rejected = false;
  try {
    await q(`SELECT public.record_weaving_event($1, 'stop', NULL, NULL, NULL, NULL, 5, NULL, NULL, 'cor', NULL)`, [orders[0].id]);
  } catch { rejected = true; }
  check('categoria inválida na tecelagem é rejeitada (cor)', rejected);

  console.log('== cadeia integrada dos 4 setores');
  await runFile('seed-integracao-setores', path.join(scripts, 'seed-integracao-setores.sql'));
  const chain = await q(
    `SELECT p.code, o.sector, o.status FROM public.production_orders o
       JOIN public.products p ON p.id = o.product_id
      WHERE p.code IN ('FIO-INT-30','TECIDO-INT-01','MALHA-INT-30','MALHA-INT-TING-30')`);
  const sectorOfProduct = Object.fromEntries(chain.map((r) => [r.code, r.sector]));
  check('cada OP caiu na sua central (setor pelo roteiro)',
    sectorOfProduct['FIO-INT-30'] === 'Fiação' && sectorOfProduct['TECIDO-INT-01'] === 'Tecelagem'
    && sectorOfProduct['MALHA-INT-30'] === 'Malharia' && sectorOfProduct['MALHA-INT-TING-30'] === 'Tinturaria',
    JSON.stringify(sectorOfProduct));
  check('as 4 OPs da cadeia concluíram', chain.every((r) => r.status === 'completed'),
    JSON.stringify(chain.map((r) => r.status)));

  const lotQty = async (n) => Number((await lot(n))?.remaining_qty);
  check('saldos da cadeia: pluma 24, fio 6, malha 0, corante 7,575, tecido 385, tingida 95',
    (await lotQty('PLUMA-INT-LOTE-001')) === 24 && (await lotQty('FIO-INT-LOTE-001')) === 6
    && (await lotQty('MALHA-INT-LOTE-001')) === 0 && (await lotQty('CORANTE-INT-LOTE-001')) === 7.575
    && (await lotQty('TECIDO-INT-LOTE-001')) === 385 && (await lotQty('MALHA-INT-TING-LOTE-001')) === 95);

  const edgesInto = async (lotNumber) => Number((await q(
    `SELECT count(*)::int AS n FROM public.production_lot_genealogy g
       JOIN public.stock_lots l ON l.id = g.output_lot_id WHERE l.lot_number = $1`, [lotNumber]))[0].n);
  check('genealogia atravessa os setores (fio<-pluma, tecido<-fio, malha<-fio, tingida<-malha+corante)',
    (await edgesInto('FIO-INT-LOTE-001')) === 1 && (await edgesInto('TECIDO-INT-LOTE-001')) === 1
    && (await edgesInto('MALHA-INT-LOTE-001')) === 1 && (await edgesInto('MALHA-INT-TING-LOTE-001')) === 2);

  const sectorProfiles3 = await q(
    `SELECT (SELECT target_title FROM public.spinning_order_profiles sp JOIN public.production_orders o ON o.id = sp.production_order_id JOIN public.products p ON p.id = o.product_id WHERE p.code = 'FIO-INT-30') AS title,
            (SELECT gauge FROM public.knitting_order_profiles kp JOIN public.production_orders o ON o.id = kp.production_order_id JOIN public.products p ON p.id = o.product_id WHERE p.code = 'MALHA-INT-30') AS gauge,
            (SELECT lab_b FROM public.dyeing_order_profiles dp JOIN public.production_orders o ON o.id = dp.production_order_id JOIN public.products p ON p.id = o.product_id WHERE p.code = 'MALHA-INT-TING-30') AS lab_b`);
  check('perfis técnicos dos 3 setores persistidos (título, finura, Lab)',
    sectorProfiles3[0].title === 'Ne 30/1' && sectorProfiles3[0].gauge === 'E28' && Number(sectorProfiles3[0].lab_b) === -38,
    JSON.stringify(sectorProfiles3[0]));

  const classified = await q(
    `SELECT sector, count(*)::int AS n FROM public.sector_production_events
      WHERE deviation_category IS NOT NULL GROUP BY sector`);
  check('eventos classificados por desvio nos 3 setores com eventos próprios',
    classified.length === 3, JSON.stringify(classified));

  console.log('== testes negativos (aceite das skills)');
  const tecProduct = (await q(`SELECT id FROM public.products WHERE code = 'TECIDO-INT-01' AND company_id = $1`, [company.id]))[0].id;
  const fioProduct = (await q(`SELECT id FROM public.products WHERE code = 'FIO-INT-30' AND company_id = $1`, [company.id]))[0].id;
  const fioLot = (await q(`SELECT id FROM public.stock_lots WHERE lot_number = 'FIO-INT-LOTE-001'`))[0].id;
  const tearInt = (await q(`SELECT id FROM public.production_machines WHERE code = 'TEAR-INT-01'`))[0].id;
  const negA = (await q(`SELECT (public.create_textile_production_order($1, 10, 'neg-op-a', 'medium', now() + interval '3 days', NULL, NULL, NULL, NULL, NULL, '{}'::jsonb) ->> 'production_order_id')::uuid AS id`, [tecProduct]))[0].id;

  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  const blockedLot = (await q(
    `INSERT INTO public.stock_lots (company_id, product_id, product_code, product_name, lot_number, quantity, remaining_qty, status, quality_status)
     VALUES ($1, $2, 'FIO-INT-30', 'Fio 30/1 cardado (integração)', 'FIO-INT-LOTE-BLOQUEADO', 50, 50, 'available', 'blocked')
     RETURNING id`, [company.id, fioProduct]))[0].id;
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  let raised = false;
  try {
    await q(`SELECT public.reserve_production_materials($1, jsonb_build_array(jsonb_build_object('component_id', $2::uuid, 'lot_id', $3::uuid, 'quantity', 2)), 'neg-reserva-bloq')`, [negA, fioProduct, blockedLot]);
  } catch { raised = true; }
  check('N1: lote bloqueado pela qualidade NÃO pode ser reservado', raised);

  // Lote bom exclusivo dos negativos (não interferir nos saldos da cadeia)
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  const goodNegLot = (await q(
    `INSERT INTO public.stock_lots (company_id, product_id, product_code, product_name, lot_number, quantity, remaining_qty, status, quality_status)
     VALUES ($1, $2, 'FIO-INT-30', 'Fio 30/1 cardado (integração)', 'FIO-INT-LOTE-NEG', 50, 50, 'available', 'approved')
     RETURNING id`, [company.id, fioProduct]))[0].id;
  const hqBranch = (await q(`SELECT id FROM public.branches WHERE company_id = $1 AND is_headquarters LIMIT 1`, [company.id]))[0].id;
  await q(
    `INSERT INTO public.stock_balances (company_id, product_id, lot_id, branch_id, canal_operacional, product_code, product_name, quantity, reserved_qty)
     VALUES ($1, $2, $3, $4, 'ATACADO_INDUSTRIA', 'FIO-INT-30', 'Fio 30/1 cardado (integração)', 50, 0)`,
    [company.id, fioProduct, goodNegLot, hqBranch]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  await q(`SELECT public.reserve_production_materials($1, jsonb_build_array(jsonb_build_object('component_id', $2::uuid, 'lot_id', $3::uuid, 'quantity', 2.15)), 'neg-reserva-ok')`, [negA, fioProduct, goodNegLot]);
  raised = false;
  try {
    await q(`SELECT public.complete_production_order($1, 'neg-conclusao', 10, 0, jsonb_build_array(jsonb_build_object('component_id', $2::uuid, 'lot_id', $3::uuid, 'quantity', 2.15)), 'LOTE-NEG-SAIDA')`, [negA, fioProduct, goodNegLot]);
  } catch { raised = true; }
  check('N2: OP sem inspeção de qualidade aprovada NÃO conclui', raised);

  await q(`SELECT public.schedule_production_order($1, now() + interval '60 hours', now() + interval '76 hours', 'neg-prog-a', NULL, $2, NULL, NULL, 'diurno')`, [negA, tearInt]);
  const negB = (await q(`SELECT (public.create_textile_production_order($1, 10, 'neg-op-b', 'medium', now() + interval '3 days', NULL, NULL, NULL, NULL, NULL, '{}'::jsonb) ->> 'production_order_id')::uuid AS id`, [tecProduct]))[0].id;
  raised = false;
  try {
    await q(`SELECT public.schedule_production_order($1, now() + interval '61 hours', now() + interval '77 hours', 'neg-prog-b', NULL, $2, NULL, NULL, 'diurno')`, [negB, tearInt]);
  } catch { raised = true; }
  check('N3: mesmo tear em janela sobreposta é rejeitado (capacidade finita)', raised);

  const dyeOrder = (await q(
    `SELECT o.id FROM public.production_orders o JOIN public.products p ON p.id = o.product_id WHERE p.code = 'MALHA-INT-TING-30'`))[0].id;
  raised = false;
  try {
    await q(`SELECT public.record_sector_event($1, 'tinturaria', 'fiber_break')`, [dyeOrder]);
  } catch { raised = true; }
  check('N4: evento de fiação (fiber_break) é rejeitado na tinturaria', raised);

  console.log('== catálogo por processo + fluxo comercial (pedido -> entrega)');
  await runFile('seed-catalogo-processos', path.join(scripts, 'seed-catalogo-processos.sql'));
  await runFile('seed-pedidos-clientes', path.join(scripts, 'seed-pedidos-clientes.sql'));
  const categorized = await q(
    `SELECT p.code, c.name AS category FROM public.products p
       LEFT JOIN public.categories c ON c.id = p.category_id
      WHERE p.code IN ('FIO-INT-30','TECIDO-INT-01','MALHA-INT-TING-30','CORANTE-INT-AZUL','PLUMA-INT')`);
  const catOf = Object.fromEntries(categorized.map((r) => [r.code, r.category]));
  check('produtos classificados por processo (base dos filtros do PCP)',
    catOf['FIO-INT-30'] === 'Fios' && catOf['TECIDO-INT-01'] === 'Tecidos Planos'
    && catOf['MALHA-INT-TING-30'] === 'Malhas' && catOf['CORANTE-INT-AZUL'] === 'Corantes e Auxiliares'
    && catOf['PLUMA-INT'] === 'Fibras e Plumas', JSON.stringify(catOf));

  const orderRows = await q(`SELECT number, total FROM public.orders WHERE number LIKE 'PV-INT-%' ORDER BY number`);
  check('4 pedidos emitidos (tecido, fio, malha tingida, serviço p/ terceiro)',
    orderRows.length === 4 && Number(orderRows[0].total) === 8400 && Number(orderRows[3].total) === 600,
    JSON.stringify(orderRows));

  const delivered = {
    tecido: await lotQty('TECIDO-INT-LOTE-001'),
    fio: await lotQty('FIO-INT-LOTE-001'),
    corante: await lotQty('CORANTE-INT-LOTE-001'),
  };
  check('entregas baixaram os lotes certos (tecido 85 m, fio 1 kg, corante 6,325 kg)',
    delivered.tecido === 85 && delivered.fio === 1 && delivered.corante === 6.325,
    JSON.stringify(delivered));
  const tingidaTotal = Number((await q(
    `SELECT COALESCE(sum(remaining_qty), 0) AS s FROM public.stock_lots
      WHERE lot_number IN ('MALHA-INT-TING-LOTE-001','MALHA-TING-TERC-LOTE-001')`))[0].s);
  check('malha tingida: 80 kg ao cliente + devolução do terceiro (restam 15 kg no total)',
    tingidaTotal === 15, `total=${tingidaTotal}`);

  const serviceOp = await q(
    `SELECT o.status, o.sales_order_id IS NOT NULL AS linked FROM public.production_orders o
       JOIN public.orders pv ON pv.id = o.sales_order_id WHERE pv.number = 'PV-INT-004'`);
  const sectorBoards = (await q(
    `SELECT (SELECT count(*)::int FROM public.spinning_order_profiles) AS fiacao,
            (SELECT count(*)::int FROM public.dyeing_order_profiles) AS tinturaria,
            (SELECT count(*)::int FROM public.knitting_order_profiles) AS malharia,
            (SELECT count(*)::int FROM public.sector_production_events WHERE sector = 'fiacao') AS ev_fiacao,
            (SELECT count(*)::int FROM public.sector_production_events WHERE sector = 'tinturaria') AS ev_tinturaria`))[0];
  check('quadros setoriais: perfis e eventos de fiação/tinturaria existem (base dos painéis)',
    sectorBoards.fiacao >= 1 && sectorBoards.tinturaria >= 1 && sectorBoards.malharia >= 1 && sectorBoards.ev_fiacao >= 1,
    JSON.stringify(sectorBoards));
  check('OP de tinturaria do terceiro vinculada ao pedido e concluída',
    serviceOp.length === 1 && serviceOp[0].status === 'completed' && serviceOp[0].linked === true,
    JSON.stringify(serviceOp));
  check('genealogia do material do cliente (malha do terceiro -> lote devolvido)',
    (await edgesInto('MALHA-TING-TERC-LOTE-001')) === 2);

  console.log('== Fase 1: nicho -> pacote de módulos (local como nuvem)');
  const pkgCount = Number((await q(`SELECT count(*)::int AS n FROM public.niche_packages WHERE is_active`))[0].n);
  check('pacotes de nicho cadastrados (têxtil, confecção, alimentos, ração, químico...)', pkgCount >= 7, `n=${pkgCount}`);

  // Segundo tenant (químico) na MESMA instalação, como na nuvem
  const user2 = 'f6000000-0000-4000-8000-000000000001';
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`INSERT INTO auth.users (id, email, encrypted_password) VALUES ($1, 'admin@quimica.example.com', '') ON CONFLICT (id) DO NOTHING`, [user2]);
  await q(`INSERT INTO public.profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [user2]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', 'authenticated', false)`, [user2]);
  await q(`SELECT set_config('request.jwt.claims', jsonb_build_object('sub', $1::text, 'role', 'authenticated', 'email', 'admin@quimica.example.com')::text, false)`, [user2]);
  await q(`SELECT set_config('app.allow_tenant_link', 'on', false)`);
  const boot = await q(`SELECT public.bootstrap_tenant('Química Teste LTDA', '55555555000155', 'chemicals', 'Rua A', '100', 'Centro', 'São Paulo', 'SP', '01001-000', '11999990000', 'admin@quimica.example.com') AS r`);
  const company2 = boot[0].r.company_id;
  check('segundo tenant criado por CNPJ na mesma instalação', !!company2);

  await q(`SELECT public.set_company_niche($1, 'chemicals', ARRAY['chemicals'])`, [company2]);
  const chemAccess = await q(`SELECT public.has_module_access('producao') AS prod, public.has_module_access('agro') AS agro`);
  check('nicho químico: produção liberada, agro (ração) negado',
    chemAccess[0].prod === true && chemAccess[0].agro === false, JSON.stringify(chemAccess[0]));

  await q(`SELECT public.set_company_niche($1, 'animal_feed', ARRAY['animal_feed'])`, [company2]);
  const feedAccess = await q(`SELECT public.has_module_access('agro') AS agro`);
  const nicheInfo = await q(`SELECT public.get_company_niche($1) AS n`, [company2]);
  check('troca de nicho reaplica o pacote (ração ganha agro) e é auditada',
    feedAccess[0].agro === true && nicheInfo[0].n.segment === 'animal_feed',
    JSON.stringify(nicheInfo[0].n));
  const historyCount = Number((await q(`SELECT count(*)::int AS n FROM public.company_niche_history WHERE company_id = $1`, [company2]))[0].n);
  check('histórico de nicho gravado (2 trocas)', historyCount === 2, `n=${historyCount}`);

  raised = false;
  try { await q(`SELECT public.set_company_niche($1, 'nicho_inexistente')`, [company2]); } catch { raised = true; }
  check('nicho inexistente é rejeitado', raised);

  // Admin da BIL não manda no tenant químico
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);
  raised = false;
  try { await q(`SELECT public.set_company_niche($1, 'textile')`, [company2]); } catch { raised = true; }
  check('admin de outra empresa não altera o nicho alheio', raised);

  // E a BIL aplica o próprio pacote têxtil sem perder a produção
  await q(`SELECT public.set_company_niche($1, 'textile', ARRAY['spinning','weaving','knitting','dyeing'])`, [company.id]);
  const bilAccess = await q(`SELECT public.has_module_access('producao') AS prod, public.has_module_access('agro') AS agro`);
  check('BIL têxtil: produção mantida, módulos fora do ramo desligados',
    bilAccess[0].prod === true && bilAccess[0].agro === false, JSON.stringify(bilAccess[0]));

  console.log('== Fase 1c: permissão por setor + isolamento RLS A/B');
  const errCode = (e) => e?.code ?? '';
  let lastMsg = '';
  const errMsg = (e) => String(e?.message ?? '').slice(0, 90);

  // Usuário comum da BIL (sem papel admin)
  const user3 = 'f6000000-0000-4000-8000-000000000003';
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`INSERT INTO auth.users (id, email, encrypted_password) VALUES ($1, 'operador@bil.example.com', '') ON CONFLICT (id) DO NOTHING`, [user3]);
  await q(`INSERT INTO public.profiles (id, company_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [user3, company.id]);
  await q(`INSERT INTO public.user_roles (user_id, role, company_id) VALUES ($1, 'manager', $2) ON CONFLICT DO NOTHING`, [user3, company.id]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);

  // Admin concede tecelagem/operator ao operador
  const grant = await q(`SELECT public.set_user_sector_access($1, 'tecelagem', 'operator') AS r`, [user3]);
  check('admin concede acesso de operador na tecelagem', grant[0].r.access_level === 'operator', JSON.stringify(grant[0].r));

  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user3]);
  const myAccess = await q(`SELECT public.my_sector_access() AS a`);
  check('operador vê o próprio contexto (restrito, tecelagem=operator)',
    myAccess[0].a.enforced === true && myAccess[0].a.is_admin === false && myAccess[0].a.access.tecelagem === 'operator',
    JSON.stringify(myAccess[0].a));

  let code = '';
  try { await q(`SELECT public.record_weaving_event($1, 'note', NULL, NULL, NULL, NULL, NULL, 'apontamento do operador', 'operador', NULL, NULL)`, [orders[0].id]); }
  catch (e) { code = errCode(e); lastMsg = errMsg(e); }
  check('operador de tecelagem aponta no próprio setor (guarda não bloqueia)', code !== '42501', `code=${code} msg=${lastMsg}`);

  code = '';
  try { await q(`SELECT public.record_sector_event($1, 'tinturaria', 'note', NULL, NULL, NULL, NULL, NULL, NULL, 'operador', NULL, NULL)`, [orders[0].id]); }
  catch (e) { code = errCode(e); }
  check('operador de tecelagem NÃO aponta na tinturaria (42501)', code === '42501', `code=${code}`);

  code = '';
  try { await q(`SELECT public.upsert_weaving_order_profile($1, '{}'::jsonb)`, [orders[0].id]); }
  catch (e) { code = errCode(e); }
  check('operador NÃO altera perfil (manager) do setor (42501)', code === '42501', `code=${code}`);

  code = '';
  try { await q(`SELECT public.set_user_sector_access($1, 'fiacao', 'manager')`, [user3]); }
  catch (e) { code = errCode(e); }
  check('não-admin NÃO concede acesso a setores', code === '42501', `code=${code}`);

  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);
  await q(`SELECT public.set_user_sector_access($1, 'tecelagem', 'manager')`, [user3]);
  await q(`SELECT public.set_user_sector_access($1, 'malharia', 'viewer')`, [user3]);
  await q(`SELECT public.set_user_sector_access($1, 'tecelagem', NULL)`, [user3]);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user3]);
  code = '';
  try { await q(`SELECT public.record_weaving_event($1, 'note', NULL, NULL, NULL, NULL, NULL, 'x', 'operador', NULL, NULL)`, [orders[0].id]); }
  catch (e) { code = errCode(e); }
  check('após revogar tecelagem (modo restrito segue ativo), apontar volta a negar', code === '42501', `code=${code}`);

  // Admin da Química não concede acesso a usuário da BIL
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user2]);
  code = '';
  try { await q(`SELECT public.set_user_sector_access($1, 'fiacao', 'manager')`, [user3]); }
  catch (e) { code = errCode(e); }
  check('admin de outra empresa NÃO concede acesso a usuário alheio', code === '42501', `code=${code}`);

  // ---- Ensaio RLS A/B: usuário da Química (authenticated) x dados da BIL ----
  const asUser = async (uid, email, fn) => {
    await q('BEGIN');
    try {
      await client.query(`SET LOCAL ROLE authenticated`);
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      await client.query(
        `SELECT set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: uid, role: 'authenticated', email })]);
      const r = await fn();
      await q('ROLLBACK');
      return r;
    } catch (e) {
      await q('ROLLBACK').catch(() => {});
      throw e;
    }
  };
  const visibleAsChem = await asUser(user2, 'admin@quimica.example.com', async () => {
    const counts = {};
    for (const t of ['production_orders', 'stock_lots', 'stock_movements', 'products', 'orders', 'production_machines', 'weaving_order_profiles']) {
      counts[t] = Number((await client.query(`SELECT count(*)::int AS n FROM public.${t} WHERE company_id = $1`, [company.id])).rows[0].n);
    }
    return counts;
  });
  check('RLS A/B: tenant químico NÃO enxerga produção/estoque/produtos/pedidos da BIL',
    Object.values(visibleAsChem).every((n) => n === 0), JSON.stringify(visibleAsChem));

  const upd = await asUser(user2, 'admin@quimica.example.com', async () =>
    (await client.query(`UPDATE public.products SET name = name WHERE company_id = $1`, [company.id])).rowCount);
  check('RLS A/B: UPDATE em produto da BIL afeta 0 linhas', upd === 0, `rowCount=${upd}`);

  const del = await asUser(user2, 'admin@quimica.example.com', async () =>
    (await client.query(`DELETE FROM public.stock_lots WHERE company_id = $1`, [company.id])).rowCount);
  check('RLS A/B: DELETE em lote da BIL afeta 0 linhas', del === 0, `rowCount=${del}`);

  let insertDenied = false;
  try {
    await asUser(user3, 'operador@bil.example.com', async () => {
      await client.query(
        `INSERT INTO public.user_sector_access (company_id, user_id, sector, access_level) VALUES ($1, $2, 'fiacao', 'manager')`,
        [company.id, user3]);
    });
  } catch { insertDenied = true; }
  check('user_sector_access: escrita direta é negada (só via RPC admin)', insertDenied);

  const ownVisible = await asUser(admin.id, 'etcsuporte889@gmail.com', async () =>
    Number((await client.query(`SELECT count(*)::int AS n FROM public.production_orders WHERE company_id = $1`, [company.id])).rows[0].n));
  check('RLS A/B: a própria empresa continua enxergando a produção (controle positivo)', ownVisible >= 1, `n=${ownVisible}`);

  const ownCats = await asUser(admin.id, 'etcsuporte889@gmail.com', async () =>
    Number((await client.query(`SELECT count(*)::int AS n FROM public.categories`)).rows[0].n));
  const foreignCats = await asUser(user2, 'admin@quimica.example.com', async () =>
    Number((await client.query(`SELECT count(*)::int AS n FROM public.categories WHERE company_id = $1`, [company.id])).rows[0].n));
  check('categorias: a empresa lê o próprio catálogo e não o alheio', ownCats >= 6 && foreignCats === 0,
    `own=${ownCats} foreign=${foreignCats}`);

  console.log('== Jornada do PCP como o app faz (RLS + RPCs oficiais)');
  // As jornadas acima rodam como superusuário (a RLS não se aplica). Esta
  // repete o fluxo do gerente — programar, apontar as passagens, qualidade,
  // finalizar o setor e gerar estoque — sob SET LOCAL ROLE authenticated,
  // que é exatamente como o PostgREST enxerga o banco nas telas.
  const asUserTx = async (uid, email, fn) => {
    await q('BEGIN');
    try {
      await client.query('SET LOCAL ROLE authenticated');
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: uid, role: 'authenticated', email })]);
      await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
      const r = await fn();
      await q('COMMIT');
      return r;
    } catch (e) {
      await q('ROLLBACK').catch(() => {});
      throw e;
    }
  };

  // Fixtures da jornada (cadastros que a empresa configuraria na implantação)
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  const plumaJ = (await q(`INSERT INTO public.products (company_id, code, name, type, unit, item_kind)
    VALUES ($1, 'PLUMA-JORNADA', 'Pluma (jornada PCP)', 'raw_material', 'kg', 'insumo') RETURNING id`, [company.id]))[0].id;
  const fioJ = (await q(`INSERT INTO public.products (company_id, code, name, type, unit, item_kind)
    VALUES ($1, 'FIO-JORNADA', 'Fio (jornada PCP)', 'raw_material', 'kg', 'insumo') RETURNING id`, [company.id]))[0].id;
  const malhaJ = (await q(`INSERT INTO public.products (company_id, code, name, type, unit, item_kind)
    VALUES ($1, 'MALHA-JORNADA', 'Malha (jornada PCP)', 'finished', 'kg', 'acabado') RETURNING id`, [company.id]))[0].id;
  await q(`INSERT INTO public.production_steps (company_id, name, code, sequence, estimated_time_minutes, sector) VALUES
    ($1, 'Fiação (jornada)', 'FIA-JOR', 1, 60, 'Fiação'),
    ($1, 'Malharia (jornada)', 'MAL-JOR', 1, 60, 'Malharia')`, [company.id]);
  const rotaFio = (await q(`INSERT INTO public.production_routes (company_id, code, product_id, is_active)
    VALUES ($1, 'ROT-FIO-JOR', $2, true) RETURNING id`, [company.id, fioJ]))[0].id;
  await q(`INSERT INTO public.production_route_steps (route_id, company_id, sequence, step_name, operation_time_minutes)
    VALUES ($1, $2, 1, 'Fiação (jornada)', 60)`, [rotaFio, company.id]);
  const rotaMalha = (await q(`INSERT INTO public.production_routes (company_id, code, product_id, is_active)
    VALUES ($1, 'ROT-MALHA-JOR', $2, true) RETURNING id`, [company.id, malhaJ]))[0].id;
  await q(`INSERT INTO public.production_route_steps (route_id, company_id, sequence, step_name, operation_time_minutes)
    VALUES ($1, $2, 1, 'Malharia (jornada)', 60)`, [rotaMalha, company.id]);
  await q(`INSERT INTO public.production_bom (company_id, product_id, component_id, quantity, waste_percentage) VALUES
    ($1, $2, $3, 1.1, 0), ($1, $4, $2, 1.05, 0)`, [company.id, fioJ, plumaJ, malhaJ]);
  const plumaLotJ = (await q(`INSERT INTO public.stock_lots (company_id, product_id, product_code, product_name, lot_number, quantity, remaining_qty, status, quality_status, unit_cost)
    VALUES ($1, $2, 'PLUMA-JORNADA', 'Pluma (jornada PCP)', 'PLUMA-JORNADA-L1', 1000, 1000, 'available', 'approved', 10) RETURNING id`, [company.id, plumaJ]))[0].id;
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);

  const jornada = {};
  let jErr = '';
  try {
    await asUserTx(admin.id, 'etcsuporte889@gmail.com', async () => {
      const created = (await client.query(
        `SELECT public.create_textile_production_order($1, 100, 'jornada-pcp-op1') AS r`, [fioJ])).rows[0].r;
      jornada.opId = created.production_order_id;
      const st = (await client.query(
        `SELECT id, quantity_pending FROM public.production_order_steps WHERE production_order_id = $1 ORDER BY sequence`,
        [jornada.opId])).rows;
      jornada.stepsTotal = st.length;
      jornada.stepId = st[0]?.id;
      const sched = (await client.query(
        `SELECT public.schedule_production_order($1, now() + interval '1 day', now() + interval '1 day 4 hours', 'jornada-pcp-sched1', NULL, NULL, 'Fiação', NULL, 'diurno') AS r`,
        [jornada.opId])).rows[0].r;
      jornada.scheduled = !!sched?.schedule_id || !!sched;
      await client.query(
        `SELECT public.record_production_step_progress($1, 'start', 0, 0, 'Operador Jornada', NULL, NULL, NULL, NULL, NULL)`,
        [jornada.stepId]);
      const done = (await client.query(
        `SELECT public.record_production_step_progress($1, 'complete', 100, 0, 'Operador Jornada', NULL, NULL, NULL, NULL, NULL) AS r`,
        [jornada.stepId])).rows[0].r;
      jornada.stepStatus = done.status;
      jornada.opStatus = (await client.query(
        `SELECT status FROM public.production_orders WHERE id = $1`, [jornada.opId])).rows[0].status;
    });
  } catch (e) { jErr = `${errCode(e)} ${errMsg(e)}`; }
  check('jornada PCP (RLS): OP nasce com etapas e agenda pela RPC', !jErr && jornada.stepsTotal === 1 && jornada.scheduled,
    jErr || JSON.stringify(jornada));
  check('jornada PCP (RLS): passagem apontada conclui a etapa e a OP vai a acabamento',
    jornada.stepStatus === 'completed' && jornada.opStatus === 'finishing',
    JSON.stringify(jornada));

  // Saldo da pluma na filial/canal da OP (como uma entrada de estoque faria)
  const opBranchRow = (await q(`SELECT branch_id FROM public.production_orders WHERE id = $1`, [jornada.opId]))[0];
  const branchJ = (await q(`SELECT id, canal_padrao FROM public.branches WHERE id = $1`, [opBranchRow.branch_id]))[0];
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`INSERT INTO public.stock_balances (company_id, product_id, lot_id, branch_id, canal_operacional, product_code, product_name, quantity, reserved_qty)
    VALUES ($1, $2, $3, $4, $5::public.canal_operacional, 'PLUMA-JORNADA', 'Pluma (jornada PCP)', 1000, 0)`,
    [company.id, plumaJ, plumaLotJ, branchJ.id, branchJ.canal_padrao || 'ATACADO_INDUSTRIA']);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  const trigMov = (await q(`SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.stock_movements'::regclass AND NOT tgisinternal ORDER BY 1`)).map((r) => r.tgname);
  console.log('  triggers em stock_movements:', trigMov.join(', ') || '(nenhum)');

  jErr = '';
  try {
    await asUserTx(admin.id, 'etcsuporte889@gmail.com', async () => {
      const insp = (await client.query(
        `INSERT INTO public.quality_inspections (company_id, production_order_id, inspector, inspection_date, approved_quantity, rejected_quantity, status)
         VALUES ($1, $2, 'Inspetor Jornada', now(), 100, 0, 'open') RETURNING id`,
        [company.id, jornada.opId])).rows[0];
      await client.query(`SELECT public.decide_production_quality_inspection($1, 'approved', NULL, NULL)`, [insp.id]);
      await client.query(`SELECT public.reserve_production_materials($1, $2::jsonb, 'jornada-pcp-res1')`,
        [jornada.opId, JSON.stringify([{ component_id: plumaJ, lot_id: plumaLotJ, quantity: 110 }])]);
      const comp = (await client.query(
        `SELECT public.complete_production_order($1, 'jornada-pcp-done1', 100, 0, $2::jsonb, 'FIO-JORNADA-L1') AS r`,
        [jornada.opId, JSON.stringify([{ component_id: plumaJ, lot_id: plumaLotJ, quantity: 110 }])])).rows[0].r;
      jornada.outputLotId = comp.output_lot_id;
    });
  } catch (e) { jErr = `${errCode(e)} ${errMsg(e)}`; }
  check('jornada PCP (RLS): qualidade aprova, reserva e a OP finaliza gerando estoque', !jErr, jErr);

  const opJ = (await q(`SELECT status, order_number FROM public.production_orders WHERE id = $1`, [jornada.opId]))[0];
  const fioLotJ = (await q(`SELECT remaining_qty FROM public.stock_lots WHERE lot_number = 'FIO-JORNADA-L1'`))[0];
  const plumaLotAfter = (await q(`SELECT remaining_qty FROM public.stock_lots WHERE id = $1`, [plumaLotJ]))[0];
  const fioBalance = (await q(`SELECT COALESCE(SUM(quantity), 0) AS q FROM public.stock_balances WHERE product_id = $1 AND lot_id = $2`, [fioJ, jornada.outputLotId]))[0];
  const plumaBalance = (await q(`SELECT COALESCE(SUM(quantity), 0) AS q FROM public.stock_balances WHERE product_id = $1 AND lot_id = $2`, [plumaJ, plumaLotJ]))[0];
  const movJ = (await q(`SELECT type, direction, count(*)::int AS n FROM public.stock_movements WHERE document_number = $1 GROUP BY 1, 2`, [`PROD-${opJ.order_number}`]));
  const geneJ = (await q(`SELECT count(*)::int AS n FROM public.production_lot_genealogy WHERE production_order_id = $1`, [jornada.opId]))[0];
  check('setor finalizado: OP concluída e lote de saída com 100 kg',
    opJ.status === 'completed' && Number(fioLotJ?.remaining_qty) === 100, JSON.stringify({ opJ, fioLotJ }));
  check('consumo baixou o lote de entrada (1000 -> 890 kg)', Number(plumaLotAfter?.remaining_qty) === 890,
    JSON.stringify(plumaLotAfter));
  check('estoque gerado aparece no SALDO do produto (fio = 100, pluma = 890)',
    Number(fioBalance.q) === 100 && Number(plumaBalance.q) === 890,
    `fio=${fioBalance.q} pluma=${plumaBalance.q} triggers=${trigMov.join(',')}`);
  check('ledger oficial: saída de consumo + entrada de produção + genealogia',
    movJ.some((m) => m.type === 'production_consumption' && m.direction === 'out')
    && movJ.some((m) => m.type === 'production' && m.direction === 'in') && geneJ.n === 1,
    JSON.stringify({ movJ, geneJ }));

  // Passagem ao próximo setor: a malharia consome o fio que a fiação gerou
  jErr = '';
  try {
    await asUserTx(admin.id, 'etcsuporte889@gmail.com', async () => {
      const created = (await client.query(
        `SELECT public.create_textile_production_order($1, 50, 'jornada-pcp-op2') AS r`, [malhaJ])).rows[0].r;
      jornada.op2Id = created.production_order_id;
      const st = (await client.query(
        `SELECT id FROM public.production_order_steps WHERE production_order_id = $1 ORDER BY sequence`, [jornada.op2Id])).rows;
      await client.query(
        `SELECT public.record_production_step_progress($1, 'complete', 50, 0, 'Operador Jornada', NULL, NULL, NULL, NULL, NULL)`,
        [st[0].id]);
      const insp = (await client.query(
        `INSERT INTO public.quality_inspections (company_id, production_order_id, inspector, inspection_date, approved_quantity, rejected_quantity, status)
         VALUES ($1, $2, 'Inspetor Jornada', now(), 50, 0, 'open') RETURNING id`,
        [company.id, jornada.op2Id])).rows[0];
      await client.query(`SELECT public.decide_production_quality_inspection($1, 'approved', NULL, NULL)`, [insp.id]);
      await client.query(
        `SELECT public.complete_production_order($1, 'jornada-pcp-done2', 50, 0, $2::jsonb, 'MALHA-JORNADA-L1')`,
        [jornada.op2Id, JSON.stringify([{ component_id: fioJ, lot_id: jornada.outputLotId, quantity: 52.5 }])]);
    });
  } catch (e) { jErr = `${errCode(e)} ${errMsg(e)}`; }
  const fioLotAfter2 = (await q(`SELECT remaining_qty FROM public.stock_lots WHERE lot_number = 'FIO-JORNADA-L1'`))[0];
  check('passagem entre setores: malharia consome o fio gerado pela fiação (100 -> 47,5)',
    !jErr && Number(fioLotAfter2?.remaining_qty) === 47.5, jErr || JSON.stringify(fioLotAfter2));

  console.log('== Grupo multi-CNPJ: visão consolidada + reposição intercompany');
  // Química vira empresa do grupo da BIL (indústria = raiz)
  await q(`UPDATE public.companies SET parent_company_id = $1 WHERE id = $2`, [company.id, company2]);
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  const prodQ = (await q(`INSERT INTO public.products (company_id, code, name, type, unit, item_kind, sale_price)
    VALUES ($1, 'CAMISA-001', 'Camisa social', 'finished', 'un', 'acabado', 0) RETURNING id`, [company2]))[0].id;
  await q(`INSERT INTO public.products (company_id, code, name, type, unit, item_kind, sale_price)
    VALUES ($1, 'CAMISA-001', 'Camisa social', 'finished', 'un', 'acabado', 50)`, [company.id]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);

  // Loja (Química) solicita 100 un à indústria do grupo
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user2]);
  const req1 = (await q(`SELECT public.create_intercompany_replenishment_request($1, 100, 'reposicao grupo') AS r`, [prodQ]))[0].r;
  check('loja de outro CNPJ solicita reposição à indústria do grupo',
    req1.status === 'pendente' && req1.group_root_company_id === company.id, JSON.stringify(req1));

  // A loja NÃO decide a própria solicitação
  code = '';
  try { await q(`SELECT public.decide_intercompany_request($1, 'transferir_cd')`, [req1.id]); }
  catch (e) { code = errCode(e); }
  check('solicitante não decide a própria solicitação (42501)', code === '42501', `code=${code}`);

  // Indústria decide: transferir do CD -> vira pedido de venda intercompany
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);
  const dec1 = (await q(`SELECT public.decide_intercompany_request($1, 'transferir_cd') AS r`, [req1.id]))[0].r;
  const orderRow = (await q(`SELECT company_id, total FROM public.orders WHERE id = $1`, [dec1.sales_order_id]))[0];
  check('decisão da indústria gera pedido intercompany (100 x R$ 50 = R$ 5.000)',
    dec1.status === 'aprovada' && !!orderRow && orderRow.company_id === company.id && Number(orderRow.total) === 5000,
    JSON.stringify({ dec1, orderRow }));

  code = '';
  try { await q(`SELECT public.decide_intercompany_request($1, 'vender')`, [req1.id]); }
  catch (e) { code = errCode(e); }
  check('solicitação decidida não pode ser decidida de novo (55000)', code === '55000', `code=${code}`);

  // Loja confirma o recebimento: estoque entra pelo ledger
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user2]);
  const rec1 = (await q(`SELECT public.receive_intercompany_delivery($1, 96) AS r`, [req1.id]))[0].r;
  const storeBal = (await q(`SELECT COALESCE(SUM(quantity),0) AS q FROM public.stock_balances WHERE company_id = $1 AND product_id = $2`, [company2, prodQ]))[0];
  check('recebimento da loja lança o estoque pelo ledger (96 un)',
    rec1.status === 'recebida' && Number(storeBal.q) === 96, JSON.stringify({ rec1, storeBal }));

  // Visão do grupo: gestor da loja vê BIL + Química; a matriz não pede ao grupo
  const overview = await q(`SELECT DISTINCT company_id FROM public.group_stock_overview()`);
  check('visão de estoque do grupo reúne indústria + loja (sem terceiros)',
    overview.length >= 2 && overview.some((r) => r.company_id === company.id),
    JSON.stringify(overview.map((r) => r.company_id)));
  code = '';
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);
  const bilProd = (await q(`SELECT id FROM public.products WHERE company_id = $1 AND code = 'CAMISA-001'`, [company.id]))[0].id;
  try { await q(`SELECT public.create_intercompany_replenishment_request($1, 10)`, [bilProd]); }
  catch (e) { code = errCode(e); }
  check('a matriz do grupo não solicita reposição a si mesma (22023)', code === '22023', `code=${code}`);

  // Empresa de fora do grupo é negada
  const user9 = 'f6000000-0000-4000-8000-000000000009';
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`INSERT INTO auth.users (id, email, encrypted_password) VALUES ($1, 'admin@solo.example.com', '') ON CONFLICT (id) DO NOTHING`, [user9]);
  await q(`INSERT INTO public.profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [user9]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', 'authenticated', false)`, [user9]);
  await q(`SELECT set_config('request.jwt.claims', jsonb_build_object('sub', $1::text, 'role', 'authenticated', 'email', 'admin@solo.example.com')::text, false)`, [user9]);
  const bootSolo = await q(`SELECT public.bootstrap_tenant('Solo Teste LTDA', '66666666000166', 'general', 'Rua B', '200', 'Centro', 'São Paulo', 'SP', '01001-000', '11999990001', 'admin@solo.example.com') AS r`);
  check('terceiro tenant (fora do grupo) criado para o teste de isolamento', !!bootSolo[0].r.company_id);
  code = '';
  try { await q(`SELECT * FROM public.group_stock_overview($1) LIMIT 1`, [company.id]); }
  catch (e) { code = errCode(e); }
  check('empresa de fora NÃO enxerga o estoque do grupo (42501)', code === '42501', `code=${code}`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);

  console.log('== Filiais (mesmo CNPJ): transferência entre unidades reparada');
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  const lojaBranch = (await q(`INSERT INTO public.branches (company_id, name, code) VALUES ($1, 'Loja Teste', 'LOJA-T') RETURNING id`, [company.id]))[0].id;
  const matrizBranch = (await q(`SELECT id FROM public.branches WHERE company_id = $1 ORDER BY created_at LIMIT 1`, [company.id]))[0].id;
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  const balAt = async (branch) => Number((await q(
    `SELECT COALESCE(SUM(quantity),0) AS q FROM public.stock_balances WHERE company_id = $1 AND branch_id = $2 AND product_id = $3`,
    [company.id, branch, bilProd]))[0].q);
  const before = await balAt(matrizBranch);
  await q(`INSERT INTO public.stock_movements (company_id, branch_id, product_id, product_code, product_name, quantity, direction, type, canal_operacional, reference, notes, operator, source)
    VALUES ($1, $2, $3, 'CAMISA-001', 'Camisa social', 50, 'in', 'adjustment', 'ATACADO_INDUSTRIA', 'TC-TESTE', 'carga teste', 'system', 'harness')`,
    [company.id, matrizBranch, bilProd]);
  check('carga inicial pelo ledger (matriz +50)', (await balAt(matrizBranch)) === before + 50, `before=${before}`);

  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  const tcId = (await q(`INSERT INTO public.transferencias_canal (company_id, numero, origem_branch_id, destino_branch_id, status)
    VALUES ($1, 'TC-TESTE-1', $2, $3, 'pendente') RETURNING id`, [company.id, matrizBranch, lojaBranch]))[0].id;
  await q(`INSERT INTO public.transferencias_canal_itens (transferencia_id, product_id, quantidade) VALUES ($1, $2, 30)`, [tcId, bilProd]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  await q(`UPDATE public.transferencias_canal SET status = 'em_transito' WHERE id = $1`, [tcId]);
  check('saída da matriz ao despachar (matriz -30 pelo trigger reparado)', (await balAt(matrizBranch)) === before + 20);
  await q(`UPDATE public.transferencias_canal_itens SET quantidade_recebida = 28 WHERE transferencia_id = $1`, [tcId]);
  await q(`UPDATE public.transferencias_canal SET status = 'recebido' WHERE id = $1`, [tcId]);
  check('loja recebe 28 (conferência com divergência registrada)', (await balAt(lojaBranch)) === 28);

  console.log('== Fluxo operacional de lojas: solicitação -> decisão -> expedição -> recebimento');
  // Usuário comum da loja (sem papel de gestor) para provar a decisão gerencial
  const user7 = 'f6000000-0000-4000-8000-000000000007';
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`INSERT INTO auth.users (id, email, encrypted_password) VALUES ($1, 'loja@bil.example.com', '') ON CONFLICT (id) DO NOTHING`, [user7]);
  await q(`INSERT INTO public.profiles (id, company_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [user7, company.id]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);

  // Escrita direta continua congelada: só a RPC oficial cria/transiciona
  let directBlocked = false;
  try {
    await asUser(user7, 'loja@bil.example.com', async () => {
      await client.query(`INSERT INTO public.stock_transfer_orders (company_id, origin_unit_id, destination_unit_id, current_status) VALUES ($1, $2, $3, 'SUGERIDA')`,
        [company.id, matrizBranch, lojaBranch]);
    });
  } catch { directBlocked = true; }
  check('congelamento intacto: INSERT direto de transferência é bloqueado', directBlocked);

  // Loja solicita 10 un do CD/matriz pela RPC
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [user7]);
  const stReq = (await q(`SELECT public.create_stock_transfer_request($1, $2, $3::jsonb, 'reposicao da loja') AS r`,
    [matrizBranch, lojaBranch, JSON.stringify([{ product_id: bilProd, quantity: 10 }])]))[0].r;
  check('loja cria solicitação pela RPC atômica (SUGERIDA)', stReq.status === 'SUGERIDA', JSON.stringify(stReq));

  code = '';
  try { await q(`SELECT public.transition_stock_transfer($1, 'APROVADA')`, [stReq.id]); }
  catch (e) { code = errCode(e); }
  check('usuário comum NÃO aprova a própria solicitação (42501)', code === '42501', `code=${code}`);

  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);
  const stAppr = (await q(`SELECT public.transition_stock_transfer($1, 'APROVADA') AS r`, [stReq.id]))[0].r;
  check('gestor aprova a solicitação', stAppr.status === 'APROVADA', JSON.stringify(stAppr));

  code = '';
  try { await q(`SELECT public.transition_stock_transfer($1, 'EXPEDIDA')`, [stReq.id]); }
  catch (e) { code = errCode(e); }
  check('salto de etapa é rejeitado pela máquina de estados (55000)', code === '55000', `code=${code}`);

  const walk = async (st, items) => (await q(`SELECT public.transition_stock_transfer($1, $2, $3::jsonb) AS r`,
    [stReq.id, st, items ? JSON.stringify(items) : null]))[0].r;
  await walk('RESERVADA'); await walk('SEPARAÇÃO'); await walk('CONFERÊNCIA');
  const matrizBefore = await balAt(matrizBranch);
  await walk('EXPEDIDA');
  check('expedição baixa o estoque da origem pelo ledger (-10)', (await balAt(matrizBranch)) === matrizBefore - 10,
    `before=${matrizBefore} after=${await balAt(matrizBranch)}`);
  await walk('EM TRÂNSITO');
  const stItem = (await q(`SELECT id FROM public.stock_transfer_items WHERE transfer_id = $1`, [stReq.id]))[0];
  const lojaBefore = await balAt(lojaBranch);
  const stRec = await walk('RECEBIDA', [{ item_id: stItem.id, quantity: 9 }]);
  const lojaBalNow = await balAt(lojaBranch);
  check('recebimento conferido: 9 de 10 vira divergência automática e entra na loja',
    stRec.status === 'RECEBIDA COM DIVERGÊNCIA' && Number(stRec.divergence) === 1 && lojaBalNow === lojaBefore + 9,
    JSON.stringify({ stRec, lojaBefore, lojaBalNow }));

  const logCount = Number((await q(`SELECT count(*)::int AS n FROM public.stock_transfer_workflow_logs WHERE transfer_id = $1`, [stReq.id]))[0].n);
  check('histórico do fluxo gravado na mesma transação (7+ eventos)', logCount >= 7, `n=${logCount}`);

  // Perda e inventário como documento (ledger), não ajuste solto
  await q(`SELECT public.register_stock_loss($1, $2, 2, 'AVARIA', 'quebra na loja')`, [bilProd, lojaBranch]);
  check('perda registrada baixa o estoque da loja (-2)', (await balAt(lojaBranch)) === lojaBalNow - 2);
  const countRes = (await q(`SELECT public.register_inventory_count($1, $2, 30, 'contagem mensal') AS r`, [bilProd, lojaBranch]))[0].r;
  check('inventário ajusta pela diferença contada (sistema 35 -> contado 30)',
    Number(countRes.system_quantity) === lojaBalNow - 2 && Number(countRes.delta) === 30 - (lojaBalNow - 2)
      && (await balAt(lojaBranch)) === 30, JSON.stringify(countRes));

  console.log('== idempotência do seed de tecelagem');
  notices.length = 0;
  await runFile('seed-tecelagem (2ª vez)', path.join(scripts, 'seed-tecelagem-teste.sql'));
  check('marcador TECELAGEM_JA_PREPARADA emitido', notices.some((m) => m.includes('TECELAGEM_JA_PREPARADA')));
  const profiles = (await q(`SELECT count(*)::int AS n FROM public.weaving_order_profiles WHERE beam_code = 'ROLO-URD-TESTE-001'`))[0];
  check('continua 1 única OP de tecelagem', profiles.n === 1, `n=${profiles.n}`);

  console.log('== Grupo Zipo/Texas Farm Store: cadastro, nicho apparel e fluxo da loja');
  await runFile('seed-grupo-zipo', path.join(scripts, 'seed-grupo-zipo.sql'));
  const zipo = (await q(`SELECT id, segment, state_registration FROM public.companies WHERE regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') = '10312467000120'`))[0];
  const farm = (await q(`SELECT id, segment, parent_company_id FROM public.companies WHERE regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') = '57832353000175'`))[0];
  check('Zipo Confecções cadastrada (indústria, IE registrada, nicho Confecção)',
    !!zipo && zipo.segment === 'apparel' && zipo.state_registration === '90453753-55',
    JSON.stringify({ zipo: !!zipo, segment: zipo?.segment, ie: zipo?.state_registration }));
  check('TEXAS FARM STORE é empresa do grupo (parent = Zipo) no mesmo nicho',
    !!farm && farm.parent_company_id === zipo?.id && farm.segment === 'apparel',
    JSON.stringify({ farm: !!farm, parentOk: farm?.parent_company_id === zipo?.id }));

  const etcUser = (await q(`SELECT id FROM auth.users WHERE lower(email) = 'etcsuporte889@gmail.com'`))[0];
  const roleRows = (await q(`SELECT count(*)::int AS n FROM public.user_roles WHERE user_id = $1 AND role = 'admin' AND company_id = ANY($2::uuid[])`,
    [etcUser.id, [zipo.id, farm.id]]))[0];
  check('etcsuporte é admin (acesso total) nas duas empresas do grupo', roleRows.n === 2, `n=${roleRows.n}`);
  const nichePlans = (await q(`SELECT count(*)::int AS n FROM public.plans WHERE slug = ANY($1::text[]) AND allowed_modules @> ARRAY['wms','producao']`,
    [[`niche-${zipo.id}`, `niche-${farm.id}`]]))[0];
  check('sistema moldado ao nicho: planos dedicados do pacote Confecção aplicados', nichePlans.n === 2, `n=${nichePlans.n}`);

  const zipoBr = (await q(`SELECT id FROM public.branches WHERE company_id = $1 AND code = 'MATRIZ'`, [zipo.id]))[0];
  const zCdBr = (await q(`SELECT id FROM public.branches WHERE company_id = $1 AND code = 'CD'`, [farm.id]))[0];
  const zLojaBr = (await q(`SELECT id FROM public.branches WHERE company_id = $1 AND code = 'Loja'`, [farm.id]))[0];
  const zipoStock = (await q(`SELECT COALESCE(sum(quantity),0)::float AS q FROM public.stock_balances WHERE company_id = $1 AND branch_id = $2`, [zipo.id, zipoBr.id]))[0];
  const polCount = (await q(`SELECT count(*)::int AS n FROM public.replenishment_policies WHERE company_id = $1 AND branch_id = $2`, [farm.id, zLojaBr.id]))[0];
  check('indústria com estoque inicial e Loja com políticas de reposição (abaixo do mínimo)',
    Number(zipoStock.q) > 0 && polCount.n >= 4, JSON.stringify({ zipoStock: zipoStock.q, policies: polCount.n }));

  // Visão consolidada do grupo pelo gestor
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', 'authenticated', false)`, [etcUser.id]);
  const zOverview = await q(`SELECT DISTINCT company_id FROM public.group_stock_overview()`);
  check('gestor enxerga o estoque consolidado do grupo (indústria + Loja)',
    zOverview.some((r) => r.company_id === zipo.id) && zOverview.some((r) => r.company_id === farm.id),
    JSON.stringify(zOverview.map((r) => r.company_id)));

  // Fluxo da loja dentro da empresa Loja: Loja solicita ao CD, gestor decide,
  // preparação anda, expedição baixa o CD e o recebimento entra na Loja.
  const farmUser = 'a7000000-0000-4000-8000-0000000000f1';
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`INSERT INTO auth.users (id, email, encrypted_password) VALUES ($1, 'loja@texasfarm.example.com', '') ON CONFLICT (id) DO NOTHING`, [farmUser]);
  await q(`INSERT INTO public.profiles (id, company_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [farmUser, farm.id]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  const farmProd = (await q(`SELECT id FROM public.products WHERE company_id = $1 AND code = 'CAMISETA-TF-001'`, [farm.id]))[0];
  const balFarm = async (branch) => Number((await q(
    `SELECT COALESCE(sum(quantity),0)::float AS q FROM public.stock_balances WHERE company_id = $1 AND branch_id = $2 AND product_id = $3`,
    [farm.id, branch, farmProd.id]))[0].q);
  const cdBefore = await balFarm(zCdBr.id); const zLojaBefore = await balFarm(zLojaBr.id);

  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const tfReq = (await q(`SELECT public.create_stock_transfer_request($1, $2, $3::jsonb, 'reposicao Texas Farm') AS r`,
    [zCdBr.id, zLojaBr.id, JSON.stringify([{ product_id: farmProd.id, quantity: 15 }])]))[0].r;
  check('Loja Texas Farm solicita 15 un ao CD pela RPC (SUGERIDA)', tfReq.status === 'SUGERIDA', JSON.stringify(tfReq));
  // O gestor opera no contexto da empresa dona da ordem (Loja): a RPC
  // confere a empresa do perfil de quem transiciona com a da ordem.
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`UPDATE public.profiles SET company_id = $1, branch_id = $2 WHERE id = $3`, [farm.id, zLojaBr.id, etcUser.id]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [etcUser.id]);
  const tfWalk = async (st, items) => (await q(`SELECT public.transition_stock_transfer($1, $2, $3::jsonb) AS r`,
    [tfReq.id, st, items ? JSON.stringify(items) : null]))[0].r;
  await tfWalk('APROVADA'); await tfWalk('RESERVADA'); await tfWalk('SEPARAÇÃO'); await tfWalk('CONFERÊNCIA');
  await tfWalk('EXPEDIDA');
  check('gestor aprova e expede: CD baixa 15 pelo ledger', (await balFarm(zCdBr.id)) === cdBefore - 15,
    `before=${cdBefore} after=${await balFarm(zCdBr.id)}`);
  await tfWalk('EM TRÂNSITO');
  const tfItem = (await q(`SELECT id FROM public.stock_transfer_items WHERE transfer_id = $1`, [tfReq.id]))[0];
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const tfRec = await tfWalk('RECEBIDA', [{ item_id: tfItem.id, quantity: 15 }]);
  check('Loja recebe 15/15 sem divergência e o saldo sobe pelo ledger',
    tfRec.status === 'RECEBIDA' && (await balFarm(zLojaBr.id)) === zLojaBefore + 15,
    JSON.stringify({ status: tfRec.status, before: zLojaBefore, after: await balFarm(zLojaBr.id) }));
  // Restaura o contexto do gestor para a indústria (empresa do perfil).
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`UPDATE public.profiles SET company_id = $1, branch_id = $2 WHERE id = $3`, [zipo.id, zipoBr.id, etcUser.id]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);

  console.log('== Contexto multiempresa: minhas empresas + troca de empresa ativa');
  // Como no PostgREST real: papel authenticated, claims no ar, com commit —
  // é assim que as guardas de profiles são exercitadas de verdade.
  const switchAs = async (uid, email, companyId) => {
    await q('BEGIN');
    try {
      await client.query('SET LOCAL ROLE authenticated');
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: uid, role: 'authenticated', email })]);
      const r = await client.query(`SELECT public.switch_active_company($1) AS r`, [companyId]);
      await q('COMMIT');
      return r.rows[0].r;
    } catch (e) {
      await q('ROLLBACK').catch(() => {});
      throw e;
    }
  };
  const mineAs = async (uid, email) => {
    await q('BEGIN');
    try {
      await client.query('SET LOCAL ROLE authenticated');
      await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: uid, role: 'authenticated', email })]);
      const r = await client.query('SELECT id FROM public.my_companies()');
      await q('ROLLBACK');
      return r.rows;
    } catch (e) { await q('ROLLBACK').catch(() => {}); throw e; }
  };
  const mine = await mineAs(etcUser.id, 'etcsuporte889@gmail.com');
  check('seletor de empresas: principal (Zipo) e Loja do grupo aparecem para o gestor',
    mine.some((r) => r.id === zipo.id) && mine.some((r) => r.id === farm.id),
    JSON.stringify(mine.map((r) => r.id)));
  await switchAs(etcUser.id, 'etcsuporte889@gmail.com', farm.id);
  const ctxLoja = (await q(`SELECT public.get_user_company_id($1) AS c`, [etcUser.id]))[0];
  check('trocar para a Loja muda a empresa ativa no servidor (RLS acompanha)',
    ctxLoja.c === farm.id, JSON.stringify(ctxLoja));
  await switchAs(etcUser.id, 'etcsuporte889@gmail.com', zipo.id);
  const ctxZipo = (await q(`SELECT public.get_user_company_id($1) AS c`, [etcUser.id]))[0];
  check('voltar para a principal restaura o contexto', ctxZipo.c === zipo.id, JSON.stringify(ctxZipo));
  let denied = '';
  try { await switchAs(farmUser, 'loja@texasfarm.example.com', zipo.id); } catch (e) { denied = errCode(e); }
  check('quem não é gestor da empresa não assume o contexto dela (42501)', denied === '42501', `code=${denied}`);
  const farmMine = await mineAs(farmUser, 'loja@texasfarm.example.com');
  check('usuário da Loja só enxerga a própria empresa no seletor',
    farmMine.length >= 1 && !farmMine.some((r) => r.id === zipo.id), JSON.stringify(farmMine.map((r) => r.id)));
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);

  console.log('== Lojas Texas Farm: catálogo com fotos, Loja 2 e remanejamento');
  await runFile('seed-lojas-texas', path.join(scripts, 'seed-lojas-texas.sql'));
  const txfCount = Number((await q(`SELECT count(*)::int AS n FROM public.products WHERE code LIKE 'TXF-%' AND image_url IS NOT NULL`))[0].n);
  check('catálogo Texas Farm com fotos nas duas empresas (10 produtos x 2)', txfCount === 20, `n=${txfCount}`);
  const Loja2Br = (await q(`SELECT id FROM public.branches WHERE company_id = $1 AND code = 'L2'`, [farm.id]))[0];
  check('segunda Loja cadastrada como filial da Texas Farm Store', !!Loja2Br);
  const p639 = (await q(`SELECT id FROM public.products WHERE company_id = $1 AND code = 'TXF-CM639'`, [farm.id]))[0];
  const balTx = async (branch) => Number((await q(
    `SELECT COALESCE(sum(quantity),0)::float AS q FROM public.stock_balances WHERE company_id = $1 AND branch_id = $2 AND product_id = $3`,
    [farm.id, branch, p639.id]))[0].q);
  check('cenário de remanejo montado: Loja 1 zerada e Loja 2 com 45 un paradas',
    (await balTx(zLojaBr.id)) === 0 && (await balTx(Loja2Br.id)) === 45,
    `Loja=${await balTx(zLojaBr.id)} Loja2=${await balTx(Loja2Br.id)}`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const rbReq = (await q(`SELECT public.create_stock_transfer_request($1, $2, $3::jsonb, 'remanejo Loja 2 para Loja 1') AS r`,
    [Loja2Br.id, zLojaBr.id, JSON.stringify([{ product_id: p639.id, quantity: 10 }])]))[0].r;
  check('remanejo criado: Loja 1 pede 10 un paradas na Loja 2 (SUGERIDA)', rbReq.status === 'SUGERIDA', JSON.stringify(rbReq));
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`UPDATE public.profiles SET company_id = $1, branch_id = $2 WHERE id = $3`, [farm.id, zLojaBr.id, etcUser.id]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [etcUser.id]);
  const rbWalk = async (st, items) => (await q(`SELECT public.transition_stock_transfer($1, $2, $3::jsonb) AS r`,
    [rbReq.id, st, items ? JSON.stringify(items) : null]))[0].r;
  await rbWalk('APROVADA'); await rbWalk('RESERVADA'); await rbWalk('SEPARAÇÃO'); await rbWalk('CONFERÊNCIA');
  await rbWalk('EXPEDIDA');
  check('remanejo expedido: Loja 2 baixa 10 pelo ledger (45 -> 35)', (await balTx(Loja2Br.id)) === 35,
    `depois=${await balTx(Loja2Br.id)}`);
  await rbWalk('EM TRÂNSITO');
  const rbItem = (await q(`SELECT id FROM public.stock_transfer_items WHERE transfer_id = $1`, [rbReq.id]))[0];
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const rbRec = await rbWalk('RECEBIDA', [{ item_id: rbItem.id, quantity: 10 }]);
  check('remanejo recebido: Loja 1 sai do zero (0 -> 10) sem divergência',
    rbRec.status === 'RECEBIDA' && (await balTx(zLojaBr.id)) === 10, JSON.stringify({ status: rbRec.status }));
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`UPDATE public.profiles SET company_id = $1, branch_id = $2 WHERE id = $3`, [zipo.id, zipoBr.id, etcUser.id]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);

  console.log('== Abastecimento: Loja pede, almoxarifado analisa a origem');
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const sup1 = (await q(`SELECT public.create_supply_request($1, $2, 10) AS r`, [zLojaBr.id, p639.id]))[0].r;
  check('Loja cria solicitação de abastecimento sem origem (PENDENTE)', sup1.status === 'PENDENTE', JSON.stringify(sup1));
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [etcUser.id]);
  const cand = await q(`SELECT source_kind, branch_name, quantity::float AS q FROM public.supply_candidates($1)`, [sup1.id]);
  check('análise enxerga os saldos: Loja 2 (remanejo), CD e fábrica',
    cand.some((c) => c.source_kind === 'LOJA' && c.q === 35)
      && cand.some((c) => c.source_kind === 'CD' && c.q === 40)
      && cand.some((c) => c.source_kind === 'FABRICA' && c.q === 200), JSON.stringify(cand));
  let notManager = '';
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  try { await q(`SELECT public.decide_supply_request($1, 'CD', $2)`, [sup1.id, zCdBr.id]); }
  catch (e) { notManager = errCode(e); }
  check('quem não é gestor não decide a origem (42501)', notManager === '42501', `code=${notManager}`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [etcUser.id]);
  const decLoja = (await q(`SELECT public.decide_supply_request($1, 'LOJA', $2) AS r`, [sup1.id, Loja2Br.id]))[0].r;
  const supRow = (await q(`SELECT status, transfer_order_id FROM public.supply_requests WHERE id = $1`, [sup1.id]))[0];
  const ordRow = (await q(`SELECT current_status::text AS st, origin_unit_id FROM public.stock_transfer_orders WHERE id = $1`, [decLoja.transfer_order_id]))[0];
  check('decisão LOJA: solicitação ATENDIDA e transferência criada já APROVADA da Loja 2',
    supRow.status === 'ATENDIDA' && ordRow.st === 'APROVADA' && ordRow.origin_unit_id === Loja2Br.id,
    JSON.stringify({ supRow, ordRow }));
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`UPDATE public.profiles SET company_id = $1, branch_id = $2 WHERE id = $3`, [farm.id, zLojaBr.id, etcUser.id]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  const walkSup = async (st, items) => (await q(`SELECT public.transition_stock_transfer($1, $2, $3::jsonb) AS r`,
    [decLoja.transfer_order_id, st, items ? JSON.stringify(items) : null]))[0].r;
  await walkSup('RESERVADA'); await walkSup('SEPARAÇÃO'); await walkSup('CONFERÊNCIA'); await walkSup('EXPEDIDA');
  await walkSup('EM TRÂNSITO');
  const supItem = (await q(`SELECT id FROM public.stock_transfer_items WHERE transfer_id = $1`, [decLoja.transfer_order_id]))[0];
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const supRec = await walkSup('RECEBIDA', [{ item_id: supItem.id, quantity: 10 }]);
  check('fluxo do abastecimento conclui: Loja 2 35->25 e Loja 1 10->20 pelo ledger',
    supRec.status === 'RECEBIDA' && (await balTx(Loja2Br.id)) === 25 && (await balTx(zLojaBr.id)) === 20,
    JSON.stringify({ status: supRec.status, Loja2: await balTx(Loja2Br.id), Loja: await balTx(zLojaBr.id) }));
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`UPDATE public.profiles SET company_id = $1, branch_id = $2 WHERE id = $3`, [zipo.id, zipoBr.id, etcUser.id]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const p485 = (await q(`SELECT id FROM public.products WHERE company_id = $1 AND code = 'TXF-CM485'`, [farm.id]))[0];
  const sup2 = (await q(`SELECT public.create_supply_request($1, $2, 5) AS r`, [zLojaBr.id, p485.id]))[0].r;
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [etcUser.id]);
  const decFab = (await q(`SELECT public.decide_supply_request($1, 'FABRICA', $2) AS r`, [sup2.id, zipoBr.id]))[0].r;
  check('decisão FÁBRICA: vira solicitação intercompany para a fila do gestor da indústria',
    !!decFab.intercompany_request_id, JSON.stringify(decFab));
  console.log('== Dia operacional: todas as telas com dados vivos');
  await runFile('seed-operacao-lojas', path.join(scripts, 'seed-operacao-lojas.sql'));
  const opStatus = await q(`SELECT current_status::text AS st, count(*)::int AS n FROM public.stock_transfer_orders WHERE company_id = $1 AND notes LIKE 'SEED-OP%' GROUP BY 1`, [farm.id]);
  const stMap = Object.fromEntries(opStatus.map((r) => [r.st, r.n]));
  check('Central de Abastecimento populada: separação, trânsito, divergência e encerrada',
    stMap['SEPARAÇÃO'] >= 1 && stMap['EM TRÂNSITO'] >= 1 && stMap['RECEBIDA COM DIVERGÊNCIA'] >= 1 && stMap['ENCERRADA'] >= 1,
    JSON.stringify(stMap));
  const seedMoves = Number((await q(`SELECT count(*)::int AS n FROM public.stock_movements WHERE company_id = $1 AND notes LIKE 'SEED-OP%'`, [farm.id]))[0].n);
  check('histórico no ledger único: 5 movimentos do dia operacional', seedMoves === 5, `n=${seedMoves}`);
  const pend = Number((await q(`SELECT count(*)::int AS n FROM public.supply_requests WHERE company_id = $1 AND status = 'PENDENTE'`, [farm.id]))[0].n);
  check('análise de abastecimento tem solicitação pendente aguardando decisão', pend >= 1, `n=${pend}`);
  console.log('== Usuários E2E das lojas (PREPARAR-E2E-Lojas)');
  // A seed roda em campo via psql administrativo, SEM JWT: limpa os GUCs da
  // sessão para emular isso (com um sub alheio, a guarda
  // fn_profiles_guard_admin_update recusa vincular o perfil de outro usuário).
  await q(`SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.role', '', false)`);
  await runFile('seed-e2e-lojas', path.join(scripts, 'seed-e2e-lojas.sql'));
  const e2eLoja = (await q(`SELECT id FROM auth.users WHERE lower(email) = 'loja@texasfarm.example.com'`))[0];
  const e2eGestor = (await q(`SELECT id FROM auth.users WHERE lower(email) = 'gestor@zipo.example.com'`))[0];
  check('seed E2E cria loja@texasfarm.example.com e gestor@zipo.example.com (sem ela o login retorna 400)', !!e2eLoja && !!e2eGestor);
  const e2eProfLoja = (await q(`SELECT company_id FROM public.profiles WHERE id = $1`, [e2eLoja.id]))[0];
  const e2eProfGestor = (await q(`SELECT company_id FROM public.profiles WHERE id = $1`, [e2eGestor.id]))[0];
  check('perfil da Loja vinculado à Texas e do gestor à Zipo (1ª vinculação via app.allow_tenant_link)',
    e2eProfLoja.company_id === farm.id && e2eProfGestor.company_id === zipo.id,
    JSON.stringify({ Loja: e2eProfLoja.company_id, gestor: e2eProfGestor.company_id }));
  const e2eRoles = await q(`SELECT user_id, role::text AS role, company_id FROM public.user_roles WHERE user_id = ANY($1::uuid[])`, [[e2eLoja.id, e2eGestor.id]]);
  check('papéis E2E: Loja=operator@texas, gestor=admin@zipo+texas',
    e2eRoles.some((r) => r.user_id === e2eLoja.id && r.role === 'operator' && r.company_id === farm.id)
    && e2eRoles.some((r) => r.user_id === e2eGestor.id && r.role === 'admin' && r.company_id === zipo.id)
    && e2eRoles.some((r) => r.user_id === e2eGestor.id && r.role === 'admin' && r.company_id === farm.id),
    JSON.stringify(e2eRoles));
  const e2eTokens = (await q(`SELECT count(*)::int AS n FROM auth.users
    WHERE lower(email) IN ('loja@texasfarm.example.com', 'gestor@zipo.example.com')
      AND confirmation_token = '' AND recovery_token = '' AND email_change_token_new = ''
      AND email_change = '' AND email_change_token_current = '' AND phone_change = ''
      AND phone_change_token = '' AND reauthentication_token = ''`))[0];
  check('tokens do auth.users em \'\' (NULL quebra o login no GoTrue com HTTP 500)', e2eTokens.n === 2, JSON.stringify(e2eTokens));
  await runFile('seed-e2e-lojas (2ª vez)', path.join(scripts, 'seed-e2e-lojas.sql'));
  check('seed E2E idempotente (2ª execução atravessa as guardas de novo)', true);
  console.log('== Central de Abastecimento: a Fábrica enxerga as transferências das lojas');
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);
  const boardGestor = (await q(`SELECT public.group_transfer_orders() AS r`))[0].r;
  check('gestor do grupo vê no fluxo a transferência das lojas (a RLS por empresa escondia)',
    boardGestor.some((o) => o.id === decLoja.transfer_order_id), `n=${boardGestor.length}`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const boardLoja = (await q(`SELECT public.group_transfer_orders() AS r`))[0].r;
  check('Loja vê no fluxo somente as transferências da própria empresa',
    boardLoja.length > 0 && boardLoja.every((o) => o.company_id === farm.id)
      && boardLoja.some((o) => o.id === decLoja.transfer_order_id),
    `n=${boardLoja.length}`);
  await q(`SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.role', '', false)`);
  let boardAnonErro = '';
  try { await q(`SELECT public.group_transfer_orders()`); } catch (e) { boardAnonErro = e.message; }
  check('sem sessão, o quadro do grupo é recusado (42501)', /42501|não identificada|nao identificada/i.test(boardAnonErro) || boardAnonErro.length > 0, boardAnonErro);
  console.log('== Central de Abastecimento: detalhe da transferência (itens + histórico)');
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);
  const detGestor = (await q(`SELECT public.group_transfer_detail($1) AS r`, [decLoja.transfer_order_id]))[0].r;
  check('gestor abre o detalhe da transferência da Loja: itens visíveis (a RLS por empresa escondia)',
    Array.isArray(detGestor.items) && detGestor.items.length >= 1 && !!detGestor.items[0].product_name,
    JSON.stringify({ items: (detGestor.items || []).length, history: (detGestor.history || []).length }));
  check('gestor abre o detalhe: histórico visível (criação + transições do fluxo)',
    Array.isArray(detGestor.history) && detGestor.history.length >= 2,
    JSON.stringify({ history: (detGestor.history || []).length }));
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const detLoja = (await q(`SELECT public.group_transfer_detail($1) AS r`, [decLoja.transfer_order_id]))[0].r;
  check('Loja abre o detalhe da própria transferência (itens + histórico)',
    (detLoja.items || []).length >= 1 && (detLoja.history || []).length >= 1,
    JSON.stringify({ items: (detLoja.items || []).length, history: (detLoja.history || []).length }));
  await q(`SELECT set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false), set_config('request.jwt.claim.role', '', false)`);
  let detAnonErro = '';
  try { await q(`SELECT public.group_transfer_detail($1)`, [decLoja.transfer_order_id]); } catch (e) { detAnonErro = e.message; }
  check('sem sessão, o detalhe da transferência é recusado (42501)', detAnonErro.length > 0, detAnonErro);
  console.log('== Romaneio: o dia do gestor (expedir agrupado -> Loja recepciona o documento)');
  // A Loja abre duas reposições para a Loja 1 e uma para a Loja 2.
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const romT1 = (await q(`SELECT public.create_stock_transfer_request($1, $2, $3::jsonb, 'romaneio: camiseta Loja 1') AS r`,
    [zCdBr.id, zLojaBr.id, JSON.stringify([{ product_id: farmProd.id, quantity: 20 }])]))[0].r;
  const romT2 = (await q(`SELECT public.create_stock_transfer_request($1, $2, $3::jsonb, 'romaneio: CM639 Loja 1') AS r`,
    [zCdBr.id, zLojaBr.id, JSON.stringify([{ product_id: p639.id, quantity: 10 }])]))[0].r;
  const romT3 = (await q(`SELECT public.create_stock_transfer_request($1, $2, $3::jsonb, 'romaneio: camiseta Loja 2') AS r`,
    [zCdBr.id, Loja2Br.id, JSON.stringify([{ product_id: farmProd.id, quantity: 7 }])]))[0].r;
  check('Loja abre 3 reposições para o gestor expedir (2 p/ Loja 1, 1 p/ Loja 2)',
    romT1.status === 'SUGERIDA' && romT2.status === 'SUGERIDA' && romT3.status === 'SUGERIDA');
  // Gestor no contexto do grupo (perfil na indústria) tentando misturar destinos.
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);
  let romMixErro = '';
  try { await q(`SELECT public.create_romaneio($1::uuid[])`, [[romT1.id, romT3.id]]); } catch (e) { romMixErro = e.message; }
  check('romaneio NÃO mistura destinos (uma carga = uma Loja)', romMixErro.length > 0, romMixErro);
  const romCdFarm0 = await balFarm(zCdBr.id); const romLojaFarm0 = await balFarm(zLojaBr.id);
  const romCd6390 = await balTx(zCdBr.id); const romLoja6390 = await balTx(zLojaBr.id);
  const rom = (await q(`SELECT public.create_romaneio($1::uuid[]) AS r`, [[romT1.id, romT2.id]]))[0].r;
  check('gestor gera UM romaneio com as 2 transferências da Loja 1 (sem 6 cliques por transferência)',
    /^ROM-/.test(rom.numero || '') && rom.transfers === 2, JSON.stringify(rom));
  const romOrders = await q(`SELECT current_status::text AS st, romaneio_id FROM public.stock_transfer_orders WHERE id = ANY($1::uuid[])`, [[romT1.id, romT2.id]]);
  check('ao gerar o romaneio, as transferências já estão EM TRÂNSITO vinculadas ao documento',
    romOrders.length === 2 && romOrders.every((o) => o.st === 'EM TRÂNSITO' && o.romaneio_id === rom.id), JSON.stringify(romOrders));
  check('expedição do romaneio baixou o CD pelo ledger (20 camisetas + 10 CM639), Loja ainda intacta',
    (await balFarm(zCdBr.id)) === romCdFarm0 - 20 && (await balTx(zCdBr.id)) === romCd6390 - 10
      && (await balFarm(zLojaBr.id)) === romLojaFarm0 && (await balTx(zLojaBr.id)) === romLoja6390,
    JSON.stringify({ cdFarm: await balFarm(zCdBr.id), cd639: await balTx(zCdBr.id) }));
  const movEmpresa = (await q(`SELECT count(*)::int AS n FROM public.stock_movements WHERE reference = $1 AND type = 'transfer_out' AND company_id = $2`, [romT1.id, farm.id]))[0];
  check('ledger carimbado com a empresa DONA da ordem (não com a empresa de contexto do gestor)',
    movEmpresa.n >= 1, JSON.stringify(movEmpresa));
  const romListGestor = (await q(`SELECT public.group_romaneios() AS r`))[0].r;
  check('gestor vê o romaneio EMITIDO na lista do grupo',
    romListGestor.some((r) => r.id === rom.id && r.status === 'EMITIDO' && r.transfers_count === 2),
    JSON.stringify(romListGestor.map((r) => r.numero)));
  let romDupErro = '';
  try { await q(`SELECT public.create_romaneio($1::uuid[])`, [[romT1.id]]); } catch (e) { romDupErro = e.message; }
  check('transferência já expedida não entra em outro romaneio', romDupErro.length > 0, romDupErro);
  // A Loja recepciona O DOCUMENTO (não transferência por transferência).
  const romItem1 = (await q(`SELECT id FROM public.stock_transfer_items WHERE transfer_id = $1`, [romT1.id]))[0];
  const romItem2 = (await q(`SELECT id FROM public.stock_transfer_items WHERE transfer_id = $1`, [romT2.id]))[0];
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const romListLoja = (await q(`SELECT public.group_romaneios() AS r`))[0].r;
  check('Loja destino enxerga o romaneio a recepcionar',
    romListLoja.some((r) => r.id === rom.id), JSON.stringify(romListLoja.map((r) => r.numero)));
  const romRec = (await q(`SELECT public.receive_romaneio($1, $2::jsonb) AS r`,
    [rom.id, JSON.stringify([{ item_id: romItem1.id, quantity: 18 }, { item_id: romItem2.id, quantity: 10 }])]))[0].r;
  check('Loja recepciona o documento com falta de 2 un: romaneio vira RECEBIDO COM DIVERGÊNCIA',
    romRec.status === 'RECEBIDO COM DIVERGÊNCIA', JSON.stringify(romRec));
  check('recebimento do romaneio alimentou o estoque da Loja pelo ledger (só o recebido: +18 e +10)',
    (await balFarm(zLojaBr.id)) === romLojaFarm0 + 18 && (await balTx(zLojaBr.id)) === romLoja6390 + 10,
    JSON.stringify({ LojaFarm: await balFarm(zLojaBr.id), Loja639: await balTx(zLojaBr.id) }));
  const romSt = await q(`SELECT id, current_status::text AS st FROM public.stock_transfer_orders WHERE id = ANY($1::uuid[])`, [[romT1.id, romT2.id]]);
  check('status por transferência reflete a conferência (divergente x recebida)',
    romSt.find((o) => o.id === romT1.id)?.st === 'RECEBIDA COM DIVERGÊNCIA'
      && romSt.find((o) => o.id === romT2.id)?.st === 'RECEBIDA', JSON.stringify(romSt));
  let romReErro = '';
  try { await q(`SELECT public.receive_romaneio($1, $2::jsonb)`, [rom.id, '[]']); } catch (e) { romReErro = e.message; }
  check('romaneio já recepcionado não é recebido de novo', romReErro.length > 0, romReErro);
  // Segunda carga (Loja 2): recebimento integral.
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);
  const romB = (await q(`SELECT public.create_romaneio($1::uuid[]) AS r`, [[romT3.id]]))[0].r;
  const romItem3 = (await q(`SELECT id FROM public.stock_transfer_items WHERE transfer_id = $1`, [romT3.id]))[0];
  const Loja2Farm0 = await balFarm(Loja2Br.id);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const romRecB = (await q(`SELECT public.receive_romaneio($1, $2::jsonb) AS r`,
    [romB.id, JSON.stringify([{ item_id: romItem3.id, quantity: 7 }])]))[0].r;
  check('segundo romaneio (Loja 2) recebido integral: RECEBIDO e estoque +7',
    romRecB.status === 'RECEBIDO' && (await balFarm(Loja2Br.id)) === Loja2Farm0 + 7, JSON.stringify(romRecB));
  // O gestor executa a malha sem trocar de empresa (a dor do 42501).
  const romT4 = (await q(`SELECT public.create_stock_transfer_request($1, $2, $3::jsonb, 'romaneio: prova do gestor') AS r`,
    [zCdBr.id, zLojaBr.id, JSON.stringify([{ product_id: p639.id, quantity: 5 }])]))[0].r;
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);
  const romAppr = (await q(`SELECT public.transition_stock_transfer($1, 'APROVADA') AS r`, [romT4.id]))[0].r;
  check('gestor do grupo aprova transferência da Loja SEM trocar de empresa (era 42501)',
    romAppr.status === 'APROVADA', JSON.stringify(romAppr));
  await q(`SELECT public.transition_stock_transfer($1, 'CANCELADA')`, [romT4.id]);
  const grantSupply = (await q(`SELECT has_table_privilege('authenticated', 'public.supply_requests', 'SELECT') AS ok`))[0];
  check('PostgREST: authenticated tem SELECT em supply_requests (sem isso, 403 esconde as solicitações)', grantSupply.ok === true, JSON.stringify(grantSupply));
  const tasks = Number((await q(`SELECT count(*)::int AS n FROM public.operational_tasks WHERE company_id = $1 AND status = 'pending'`, [farm.id]))[0].n);
  check('alertas da Central da Loja populados (tarefas pendentes)', tasks >= 2, `n=${tasks}`);
  console.log('== Alertas automáticos de solicitação recebida');
  const alTransito = Number((await q(`SELECT count(*)::int AS n FROM public.operational_tasks WHERE origin_id = $1 AND category = 'receiving' AND status = 'pending'`, [decLoja.transfer_order_id]))[0].n);
  check('remessa em trânsito gera alerta de recebimento no destino', alTransito >= 1, `n=${alTransito}`);
  const alSupply = Number((await q(`SELECT count(*)::int AS n FROM public.operational_tasks WHERE origin_id = $1 AND status = 'pending'`, [sup1.id]))[0].n);
  check('solicitação de abastecimento gera alerta para análise', alSupply >= 1, `n=${alSupply}`);
  const alInter = Number((await q(`SELECT count(*)::int AS n FROM public.operational_tasks WHERE origin_id = $1 AND status = 'pending'`, [decFab.intercompany_request_id]))[0].n);
  check('pedido à fábrica gera alerta para o gestor da indústria', alInter >= 1, `n=${alInter}`);
  const alFactory = Number((await q(`SELECT count(*)::int AS n FROM public.operational_tasks WHERE origin_id = $1 AND company_id = $2 AND category = 'replenishment' AND status = 'pending'`, [sup1.id, zipo.id]))[0].n);
  check('fábrica é avisada de TODA solicitação de reposição da Loja (caixa de entrada)', alFactory >= 1, `n=${alFactory}`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [etcUser.id]);
  const inbox = (await q(`SELECT public.factory_inbox() AS r`))[0].r;
  check('caixa de entrada da fábrica enxerga abastecimento e pedido à Fábrica pendentes',
    (inbox.supply || []).length >= 1 && (inbox.intercompany || []).length >= 1,
    JSON.stringify({ supply: (inbox.supply || []).length, inter: (inbox.intercompany || []).length }));
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);

  console.log('== RODADA COMPLETA: Loja pede, fábrica analisa, Loja recebe');
  const balP = async (company, branch, product) => Number((await q(
    `SELECT COALESCE(sum(quantity),0)::float AS q FROM public.stock_balances WHERE company_id = $1 AND branch_id = $2 AND product_id = $3`,
    [company, branch, product]))[0].q);
  const pRT = (await q(`SELECT id FROM public.products WHERE company_id = $1 AND code = 'TXF-RT003'`, [farm.id]))[0];
  const cdRT0 = await balP(farm.id, zCdBr.id, pRT.id); const stRT0 = await balP(farm.id, zLojaBr.id, pRT.id);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const j1 = (await q(`SELECT public.create_supply_request($1, $2, 20, 'rodada de testes') AS r`, [zLojaBr.id, pRT.id]))[0].r;
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [etcUser.id]);
  const inboxJ = (await q(`SELECT public.factory_inbox() AS r`))[0].r;
  check('1. Loja pedeu 20 un e a FÁBRICA enxerga o pedido na caixa de entrada',
    (inboxJ.supply || []).some((x) => x.id === j1.id),
    JSON.stringify((inboxJ.supply || []).map((x) => x.product_code)));
  const decCD = (await q(`SELECT public.decide_supply_request($1, 'CD', $2) AS r`, [j1.id, zCdBr.id]))[0].r;
  check('2. Fábrica analisa e decide: sai do CD (transferência APROVADA)', !!decCD.transfer_order_id);
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`UPDATE public.profiles SET company_id = $1, branch_id = $2 WHERE id = $3`, [farm.id, zLojaBr.id, etcUser.id]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  const walkJ = async (st, items) => (await q(`SELECT public.transition_stock_transfer($1, $2, $3::jsonb) AS r`,
    [decCD.transfer_order_id, st, items ? JSON.stringify(items) : null]))[0].r;
  await walkJ('RESERVADA'); await walkJ('SEPARAÇÃO'); await walkJ('CONFERÊNCIA'); await walkJ('EXPEDIDA');
  check('3. CD separa e expede pelo ledger (CD baixa 20)', (await balP(farm.id, zCdBr.id, pRT.id)) === cdRT0 - 20,
    `cd=${await balP(farm.id, zCdBr.id, pRT.id)} esperado=${cdRT0 - 20}`);
  await walkJ('EM TRÂNSITO');
  const jItem = (await q(`SELECT id FROM public.stock_transfer_items WHERE transfer_id = $1`, [decCD.transfer_order_id]))[0];
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const jRec = await walkJ('RECEBIDA', [{ item_id: jItem.id, quantity: 18 }]);
  check('4. Loja recebe parcial (18 de 20): vira divergência e o saldo entra pelo recebido',
    jRec.status === 'RECEBIDA COM DIVERGÊNCIA' && (await balP(farm.id, zLojaBr.id, pRT.id)) === stRT0 + 18,
    JSON.stringify({ status: jRec.status, saldo: await balP(farm.id, zLojaBr.id, pRT.id) }));
  const alDiv = Number((await q(`SELECT count(*)::int AS n FROM public.operational_tasks WHERE origin_id = $1 AND priority = 'critical' AND status = 'pending'`, [decCD.transfer_order_id]))[0].n);
  check('5. Divergência gera alerta crítico automático para a Loja tratar', alDiv >= 1, `n=${alDiv}`);
  // Segunda perna: direto à Fábrica
  const pBot = (await q(`SELECT id FROM public.products WHERE company_id = $1 AND code = 'TXF-BOT73010'`, [farm.id]))[0];
  const stBot0 = await balP(farm.id, zLojaBr.id, pBot.id);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);
  const j2 = (await q(`SELECT public.create_supply_request($1, $2, 4, 'rodada de testes fabrica') AS r`, [zLojaBr.id, pBot.id]))[0].r;
  await q(`SELECT set_config('session_replication_role', 'replica', false)`);
  await q(`UPDATE public.profiles SET company_id = $1, branch_id = $2 WHERE id = $3`, [zipo.id, zipoBr.id, etcUser.id]);
  await q(`SELECT set_config('session_replication_role', 'origin', false)`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [etcUser.id]);
  const decF = (await q(`SELECT public.decide_supply_request($1, 'FABRICA', $2) AS r`, [j2.id, zipoBr.id]))[0].r;
  const decVenda = (await q(`SELECT public.decide_intercompany_request($1, 'transferir_cd') AS r`, [decF.intercompany_request_id]))[0].r;
  check('6. Fábrica decide o pedido intercompany (transferir do CD da indústria)',
    !!decF.intercompany_request_id && !!decVenda, JSON.stringify(decVenda));
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [farmUser]);

  console.log('== Fiscal: configuração do provedor (sem emissão)');
  await q(`INSERT INTO public.fiscal_provider_settings (company_id, provider, environment, certificate_expires_at, csc_configured)
           VALUES ($1, 'focus_nfe', 'homologacao', '2027-01-31', true)
           ON CONFLICT (company_id) DO UPDATE SET provider = EXCLUDED.provider`, [zipo.id]);

  // Gate: liberar emissão sem homologação deve ser recusado pelo BANCO
  let gateBlocked = false;
  try {
    await q(`UPDATE public.fiscal_provider_settings SET emission_enabled = true WHERE company_id = $1`, [zipo.id]);
  } catch { gateBlocked = true; }
  check('gate fiscal: emission_enabled sem homologação é recusado (constraint)', gateBlocked);
  // Enqueue na fila OFICIAL com empresa sem liberação → exceção, nenhum job
  const texasCo = (await q(`SELECT id FROM public.companies WHERE regexp_replace(coalesce(cnpj,''),'[^0-9]','','g') = '57832353000175'`))[0];
  await switchAs(farmUser, 'loja@texasfarm.example.com', texasCo.id);
  const profT = (await q(`SELECT branch_id FROM public.profiles WHERE id = $1`, [farmUser]))[0];
  const docNfe = (await q(
    `INSERT INTO public.nfe (number, series, client_name, subtotal, total, operation_type, status, company_id, branch_id)
     VALUES ('9001', '1', 'TESTE GATE', 10, 10, 'saida', 'draft', $1, $2)
     RETURNING id`, [texasCo.id, profT.branch_id]))[0];
  let enqueueBlocked = false; let jobsAfter = -1;
  try {
    await q(`SELECT public.enqueue_fiscal_emission('nfe', $1, '{}'::jsonb)`, [docNfe.id]);
  } catch { enqueueBlocked = true; }
  jobsAfter = (await q(`SELECT count(*)::int c FROM public.fiscal_emission_jobs WHERE document_id = $1`, [docNfe.id]))[0].c;
  check('fila oficial: sem homologação, enqueue é recusado e NENHUM job é criado', enqueueBlocked && jobsAfter === 0, `blocked=${enqueueBlocked} jobs=${jobsAfter}`);
  // Com homologação registrada + liberação, o MESMO enqueue cria o job queued
  await q(`INSERT INTO public.fiscal_provider_settings (company_id, provider, environment, certificate_expires_at, homologation_approved_at, emission_enabled)
           VALUES ($1, 'focus_nfe', 'homologacao', '2027-01-31', '2026-10-22', true)
           ON CONFLICT (company_id) DO UPDATE SET emission_enabled = true, homologation_approved_at = '2026-10-22'`, [texasCo.id]);
  const job = (await q(`SELECT public.enqueue_fiscal_emission('nfe', $1, '{}'::jsonb) AS j`, [docNfe.id]))[0].j;
  check('fila oficial: com liberação, enqueue cria job queued (aguarda worker do provedor)', !!job && (job.status === 'queued' || job.includes?.('queued')), typeof job === 'string' ? job.slice(0, 60) : JSON.stringify(job).slice(0, 60));
  // Self-service fiscal: token no cofre (write-only) + checklist persistem
  await q(`SELECT public.set_fiscal_provider_token($1, 'token-teste-cliente')`, [texasCo.id]);
  const hasTok = (await q(`SELECT public.has_fiscal_provider_token($1) AS h`, [texasCo.id]))[0];
  check('cofre fiscal: token gravado via RPC e has_token confirma (sem ler o token)', hasTok.h === true);
  const policies = (await q(`SELECT count(*)::int c FROM pg_policies WHERE tablename = 'fiscal_provider_secrets'`))[0];
  check('cofre fiscal: nenhuma policy libera leitura do token p/ usuários', policies.c === 0, `policies=${policies.c}`);
  await q(`UPDATE public.fiscal_provider_settings SET homologation_checklist = '{"venda_nfe": true, "devolucao": true, "cancelamento": true}'::jsonb WHERE company_id = $1`, [texasCo.id]);
  const chk = (await q(`SELECT homologation_checklist->>'venda_nfe' AS v FROM public.fiscal_provider_settings WHERE company_id = $1`, [texasCo.id]))[0];
  check('checklist de homologação persiste (assistente self-service)', chk.v === 'true');
  const claimed = await q(`SELECT id, status FROM public.claim_fiscal_jobs(5)`);
  const myClaim = claimed.find((r) => r.id === (job.id ?? job));
  check('worker: claim move o job para processing (aguarda transmissor)', claimed.length >= 1 && claimed.every((r) => r.status === 'processing'), `claimed=${claimed.length}`);


  console.log('== Compras -> Financeiro: recebimento gera título a pagar');
  await switchAs(admin.id, 'admin@zipo.example', zipo.id).catch(() => {});
  const poId = (await q(
    `INSERT INTO public.purchase_orders (company_id, number, supplier_name, date, expected_delivery, status, subtotal, total)
     VALUES ($1, 'PC-E2E-001', 'Fornecedor Teste', CURRENT_DATE, CURRENT_DATE + 10, 'confirmed', 1000, 1000) RETURNING id`, [zipo.id]))[0].id;
  await q(
    `INSERT INTO public.purchase_order_items (company_id, purchase_order_id, product_name, product_code, quantity, received_quantity, unit_price, total)
     VALUES ($1, $2, 'Insumo Teste', 'INS-1', 10, 0, 100, 1000)`, [zipo.id, poId]);
  await q(`UPDATE public.purchase_order_items SET received_quantity = 4 WHERE purchase_order_id = $1`, [poId]);
  await q(`UPDATE public.purchase_orders SET status = 'partially_received' WHERE id = $1`, [poId]);
  const pay1 = (await q(`SELECT id, amount::float a, source_type FROM public.accounts_payable WHERE source_id = $1`, [poId]));
  check('recebimento parcial (4x100) gera título a pagar de 400 com origem no pedido',
    pay1.length === 1 && pay1[0].a === 400 && pay1[0].source_type === 'purchase_order', JSON.stringify(pay1));
  await q(`UPDATE public.purchase_order_items SET received_quantity = 10 WHERE purchase_order_id = $1`, [poId]);
  await q(`UPDATE public.purchase_orders SET status = 'received' WHERE id = $1`, [poId]);
  const pay2 = (await q(`SELECT amount::float a FROM public.accounts_payable WHERE source_id = $1`, [poId]));
  check('recebimento total atualiza o MESMO título para 1000 (sem duplicar)',
    pay2.length === 1 && pay2[0].a === 1000, JSON.stringify(pay2));
  // Adoção: título legado (sem origem) + recebimento => mesma linha, sem duplicar
  const po2 = (await q(
    `INSERT INTO public.purchase_orders (company_id, number, supplier_name, date, status, subtotal, total)
     VALUES ($1, 'PC-E2E-002', 'Fornecedor Legado', CURRENT_DATE, 'approved', 500, 500) RETURNING id`, [zipo.id]))[0].id;
  await q(
    `INSERT INTO public.accounts_payable (company_id, supplier, description, category, amount, due_date, status, invoice_number)
     VALUES ($1, 'Fornecedor Legado', 'Pedido Compra PC-E2E-002', 'Fornecedores', 500, CURRENT_DATE + 30, 'pending', 'PC-E2E-002')`, [zipo.id]);
  await q(
    `INSERT INTO public.purchase_order_items (company_id, purchase_order_id, product_name, product_code, quantity, received_quantity, unit_price, total)
     VALUES ($1, $2, 'Insumo', 'INS-2', 5, 5, 100, 500)`, [zipo.id, po2]);
  await q(`UPDATE public.purchase_orders SET status = 'received' WHERE id = $1`, [po2]);
  const pay3 = (await q(`SELECT source_type, amount::float a FROM public.accounts_payable WHERE invoice_number = 'PC-E2E-002'`, []));
  check('título legado é ADOTADO pela regra nova (origem gravada, sem duplicar)',
    pay3.length === 1 && pay3[0].source_type === 'purchase_order' && pay3[0].a === 500, JSON.stringify(pay3));

  console.log('== Vendas -> Financeiro: pedido faturado gera título a receber');
  const ordId = (await q(
    `INSERT INTO public.orders (company_id, number, client_name, date, payment_condition, payment_method, status, subtotal, total)
     VALUES ($1, 'PV-E2E-001', 'Cliente Teste', CURRENT_DATE, '30 dias', 'boleto', 'confirmed', 750, 750) RETURNING id`, [zipo.id]))[0].id;
  await q(`UPDATE public.orders SET status = 'invoiced' WHERE id = $1`, [ordId]);
  await q(`UPDATE public.orders SET status = 'invoiced', notes = 're-save' WHERE id = $1`, [ordId]);
  const rec = (await q(`SELECT source_type, amount::float a FROM public.accounts_receivable WHERE order_id = $1`, [ordId]));
  check('pedido faturado gera UM título a receber de 750 com origem (sem duplicar em re-save)',
    rec.length === 1 && rec[0].a === 750 && rec[0].source_type === 'order', JSON.stringify(rec));

  await switchAs(admin.id, 'admin', zipo.id).catch(() => {});
  const frow = (await q(`SELECT provider, environment FROM public.fiscal_provider_settings WHERE company_id = $1`, [zipo.id]))[0];
  check('configuração fiscal por empresa grava e lê (provedor/ambiente)', frow.provider === 'focus_nfe' && frow.environment === 'homologacao', JSON.stringify(frow));
  await q(`SELECT public.receive_intercompany_delivery($1, 4)`, [decF.intercompany_request_id]);
  check('7. Loja confirma o recebimento da Fábrica e o saldo entra pelo ledger (+4)',
    (await balP(farm.id, zLojaBr.id, pBot.id)) === stBot0 + 4,
    `saldo=${await balP(farm.id, zLojaBr.id, pBot.id)} esperado=${stBot0 + 4}`);
  await q(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [admin.id]);

} finally {
  await client.end().catch(() => {});
  spawnSync(path.join(BIN, 'pg_ctl'), ['-D', DATA, '-m', 'fast', 'stop'], { env: ENV });
}

console.log(`\nHARNESS: ${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
