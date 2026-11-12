import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261105181200_intercompany_production_release.sql', import.meta.url), 'utf8');
const wms = readFileSync(new URL('../supabase/migrations/20261028140000_stock_lot_unit_expedition.sql', import.meta.url), 'utf8');
const harness = readFileSync(new URL('../tests/harness/harness.mjs', import.meta.url), 'utf8');
const sqlTests = readFileSync(new URL('../tests/harness/intercompany-release-tests.mjs', import.meta.url), 'utf8');
function definition(text, name, delimiter = '$$;') {
  const start = text.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `${name} precisa existir`);
  const end = text.indexOf(delimiter, start);
  assert.notEqual(end, -1, `${name} precisa ter corpo fechado`);
  return text.slice(start, end + delimiter.length);
}

test('LOJ-05A preserva integralmente WMS pick/ship, exceto guarda fiscal e search_path', () => {
  const anchor = "  IF v_order_company <> v_company THEN RAISE EXCEPTION 'forbidden: cross-tenant order'; END IF;";
  for (const [name, delimiter] of [['wms_pick_order_stock', '$function$;'], ['wms_ship_order', '$$;']]) {
    const expected = definition(wms, name, delimiter)
      .replace(anchor, `${anchor}\n  PERFORM public.assert_intercompany_dispatch_ready(p_order_id);`)
      .replace("SET search_path TO 'public'", 'SET search_path = public, pg_temp')
      .replace('SET search_path = public\n', 'SET search_path = public, pg_temp\n');
    assert.equal(definition(migration, name, delimiter), expected);
  }
});

test('LOJ-05A cria pedido pendente e hold exato sem segundo débito físico ou conclusão automática', () => {
  const finalize = definition(migration, 'finalize_intercompany_production');
  assert.match(finalize, /'pending', 'high'/);
  assert.match(finalize, /reserved_qty = reserved_qty \+ v_req.quantity/);
  assert.doesNotMatch(finalize, /INSERT INTO public.stock_movements|UPDATE public.stock_lots|quantity\s*=\s*quantity\s*-/i);
  assert.doesNotMatch(migration, /CREATE TRIGGER[^;]*ON public.production_orders/);
  assert.match(finalize, /v_completion.output_lot_id/);
  assert.match(finalize, /'dispatch_enabled', false/);
});

test('LOJ-05A valida o lastro oficial da OP, ledger, unidades e saldo, sem FIFO genérico', () => {
  const finalize = definition(migration, 'finalize_intercompany_production');
  for (const marker of ['public.pcp_authorized_order', 'public.production_completion_requests',
    'public.stock_movements', "source = 'production_completion'", "v_order.status <> 'completed'",
    'v_completion.produced_quantity < v_req.quantity', 'v_lot.quality_status',
    'v_destination_product.unit', 'v_balance.quantity - v_balance.reserved_qty < v_req.quantity']) {
    assert.ok(finalize.includes(marker), marker);
  }
  assert.doesNotMatch(finalize, /public.wms_reserve_order_stock/);
  assert.match(finalize, /NaN.*Infinity/);
  assert.match(finalize, /Cadastre\/concilie um cliente ativo/);
});

test('LOJ-05A serializa a solicitação e registra chaves únicas sem habilitador fiscal', () => {
  assert.match(migration, /request_id uuid NOT NULL UNIQUE/);
  assert.match(migration, /production_order_id uuid NOT NULL UNIQUE/);
  const finalize = definition(migration, 'finalize_intercompany_production');
  const lock = finalize.indexOf('group_root_company_id = v_company FOR UPDATE');
  const replay = finalize.indexOf('SELECT * INTO v_release');
  const write = finalize.indexOf('INSERT INTO public.orders');
  assert.ok(lock > 0 && replay > lock && write > replay);
  assert.match(migration, /CHECK \(release_status = 'reservada_bloqueada_fiscal'\)/);
  assert.doesNotMatch(migration, /GRANT ALL ON public.intercompany_production_releases|app\..*(enable|override|allow).*intercompany/i);
});

test('LOJ-06 não deixa assinatura antiga receber sem entrega nem faz backfill', () => {
  const receive = definition(migration, 'receive_intercompany_delivery');
  assert.match(receive, /requesting_company_id = v_company FOR UPDATE/);
  assert.match(receive, /USING ERRCODE = '55000'/);
  assert.doesNotMatch(receive, /INSERT INTO|UPDATE public\./i);
  assert.doesNotMatch(migration, /INSERT INTO public.intercompany_production_releases[^;]+SELECT/);
});

test('LOJ-05A bloqueia contornos de pedido/reserva e mantém helper fora da API autenticada', () => {
  const guard = definition(migration, 'guard_intercompany_order_fiscal_freeze');
  assert.match(guard, /assert_intercompany_dispatch_ready\(v_old_order_id\)/);
  assert.match(guard, /assert_intercompany_dispatch_ready\(v_new_order_id\)/);
  for (const table of ['orders', 'order_items', 'stock_reservations', 'stock_lot_unit_allocations']) {
    assert.match(migration, new RegExp(`CREATE TRIGGER guard_intercompany_[^;]+ ON public\\.${table}\\s`));
  }
  assert.match(migration, /REVOKE ALL ON FUNCTION public.intercompany_order_fiscal_blocked\(uuid\) FROM PUBLIC, anon, authenticated, service_role/);
});

test('LOJ-05A protege pisos de saldo e lote comprometidos, inclusive contra pedido não vinculado', () => {
  const hold = definition(migration, 'guard_intercompany_production_hold');
  assert.match(hold, /stock_balance_id = OLD.id/);
  assert.match(hold, /output_lot_id = OLD.id/);
  assert.match(hold, /NEW.reserved_qty < v_held/);
  assert.match(hold, /NEW.remaining_qty < v_held/);
  assert.doesNotMatch(hold, /current_setting|stock_ledger_bypass/);
  assert.match(sqlTests, /pedido comum não pode consumir uma reserva intercompany forjada/);
});

test('LOJ-05A integra SQL real ao harness com rollback, RLS e concorrência observável', () => {
  assert.match(harness, /await runIntercompanyReleaseTests\(/);
  assert.match(sqlTests, /pg_blocking_pids/);
  assert.match(sqlTests, /SET LOCAL ROLE authenticated/);
  assert.match(sqlTests, /test_loj05a_fail_link/);
  assert.match(sqlTests, /controles positivos e negativo/);
  assert.doesNotMatch(sqlTests, /test\.skip|test\.fixme|test\.only/);
});
