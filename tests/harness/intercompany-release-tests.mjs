// LOJ-05A: SQL real em Postgres descartável, sob o papel authenticated.
// Fixtures deliberadamente inválidas são controles negativos, nunca backfill.
// Este módulo não recebe URL/credencial de banco externo: herda a conexão
// loopback do harness e usa as RPCs oficiais para criar/concluir cada OP.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function runIntercompanyReleaseTests({
  client, Client, check, asUserTx, rootCompanyId, rootAdminId,
  storeCompanyId, storeAdminId, outsiderCompanyId, outsiderAdminId,
  sourceProductId, destinationProductId, componentId, componentLotId,
  legacyRequestId, legacyOrderId,
}) {
  console.log('== LOJ-05A: OP concluída -> pedido pendente/reserva; fiscal fechado');
  const q = async (sql, args = []) => (await client.query(sql, args)).rows;
  const root = (fn) => asUserTx(rootAdminId, 'etcsuporte889@gmail.com', fn);
  const store = (fn) => asUserTx(storeAdminId, 'admin@quimica.example.com', fn);
  const rpc = (id) => q('SELECT public.finalize_intercompany_production($1) AS r', [id]).then((r) => r[0].r);
  const captureFailure = async (name, fn, expectedCode, pattern) => {
    let error;
    try { await fn(); } catch (e) { error = e; }
    check(`LOJ-05A: ${name}`, error?.code === expectedCode && (!pattern || pattern.test(error.message)),
      error ? `${error.code} ${error.message}` : 'a chamada indevidamente teve sucesso');
  };
  const snapshot = async (req) => (await q(`SELECT jsonb_build_object(
    'request', (SELECT to_jsonb(r) FROM public.intercompany_replenishment_requests r WHERE id = $1),
    'orders', (SELECT count(*) FROM public.orders WHERE number = 'IC-PROD-' || $1::text),
    'items', (SELECT count(*) FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE number = 'IC-PROD-' || $1::text)),
    'releases', (SELECT count(*) FROM public.intercompany_production_releases WHERE request_id = $1),
    'reservations', (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.id), '[]') FROM public.stock_reservations r
      WHERE order_id IN (SELECT id FROM public.orders WHERE number = 'IC-PROD-' || $1::text)),
    'balances', (SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.id), '[]') FROM public.stock_balances b WHERE company_id = $2 AND product_id = $3),
    'lots', (SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.id), '[]') FROM public.stock_lots l WHERE company_id = $2 AND product_id = $3),
    'ledger_count', (SELECT count(*) FROM public.stock_movements),
    'all_orders', (SELECT count(*) FROM public.orders),
    'all_reservations', (SELECT count(*) FROM public.stock_reservations),
    'clients_count', (SELECT count(*) FROM public.clients),
    'fiscal_count', (SELECT count(*) FROM public.fiscal_emission_jobs),
    'receivable_count', (SELECT count(*) FROM public.accounts_receivable)
  ) AS state`, [req.id, rootCompanyId, sourceProductId]))[0].state;
  const rejectedUnchanged = async (name, req, fn, code, pattern) => {
    const before = await snapshot(req);
    await captureFailure(name, fn, code, pattern);
    check(`LOJ-05A: ${name} não deixa efeitos parciais`,
      JSON.stringify(await snapshot(req)) === JSON.stringify(before));
  };
  const create = async (quantity = 4, notes = 'LOJ05A') => {
    const req = await store(async () => (await q(
      'SELECT public.create_intercompany_replenishment_request($1, $2, $3) AS r',
      [destinationProductId, quantity, notes]))[0].r);
    const op = await root(async () => (await q('SELECT public.produce_intercompany_request($1) AS r', [req.id]))[0].r);
    assert.ok(op.production_order_id, 'a fixture precisa de OP realmente criada');
    return { ...req, opId: op.production_order_id, quantity };
  };
  const complete = async (req, produced = req.quantity, rejected = 0) => root(async () => {
    const steps = await q('SELECT id FROM public.production_order_steps WHERE production_order_id = $1 ORDER BY sequence', [req.opId]);
    assert.ok(steps.length > 0, 'OP deve conter etapas oficiais');
    for (const step of steps) {
      await q(`SELECT public.record_production_step_progress($1, 'complete', $2, $3, 'LOJ05A', NULL, NULL, NULL, NULL, NULL)`,
        [step.id, produced, rejected]);
    }
    const inspection = (await q(`INSERT INTO public.quality_inspections
      (company_id, production_order_id, inspector, inspection_date, approved_quantity, rejected_quantity, status)
      VALUES ($1, $2, 'LOJ05A', now(), $3, $4, 'open') RETURNING id`,
    [rootCompanyId, req.opId, produced, rejected]))[0];
    await q(`SELECT public.decide_production_quality_inspection($1, 'approved', NULL, NULL)`, [inspection.id]);
    // FIO-JORNADA tem 1,1 kg de PLUMA-JORNADA por kg de fio, sem perda de BOM.
    const done = (await q(`SELECT public.complete_production_order($1, $2, $3, $4, $5::jsonb, $6) AS r`,
      [req.opId, `loj05a-complete-${req.id}`, produced, rejected,
        JSON.stringify([{ component_id: componentId, lot_id: componentLotId, quantity: (produced + rejected) * 1.1 }]),
        `LOJ05A-${req.id}`]))[0].r;
    assert.equal(done.status, 'completed');
    assert.equal(done.idempotent_replay, false);
    Object.assign(req, { lotId: done.output_lot_id, completionId: done.completion_id });
    return req;
  });
  const patchAndReject = async (name, req, patch, restore, code = '23514', pattern) => {
    await patch();
    try { await rejectedUnchanged(name, req, () => root(() => rpc(req.id)), code, pattern); }
    finally { await restore(); }
  };

  const grants = (await q(`SELECT
    has_function_privilege('authenticated', 'public.finalize_intercompany_production(uuid)', 'EXECUTE') AS caller,
    has_function_privilege('anon', 'public.finalize_intercompany_production(uuid)', 'EXECUTE') AS anon,
    has_function_privilege('authenticated', 'public.intercompany_order_fiscal_blocked(uuid)', 'EXECUTE') AS private_helper,
    has_table_privilege('authenticated', 'public.intercompany_production_releases', 'SELECT') AS can_read,
    has_table_privilege('authenticated', 'public.intercompany_production_releases', 'INSERT, UPDATE, DELETE') AS can_write,
    has_table_privilege('service_role', 'public.intercompany_production_releases', 'INSERT, UPDATE, DELETE') AS service_write`))[0];
  check('LOJ-05A: grants mínimos, helper privado e sem escrita direta autenticada/service_role',
    grants.caller && !grants.anon && !grants.private_helper && grants.can_read && !grants.can_write && !grants.service_write,
    JSON.stringify(grants));

  const req = await create();
  await rejectedUnchanged('OP ainda planejada é recusada', req, () => root(() => rpc(req.id)), '55000', /concluída/);
  await complete(req);
  check('LOJ-05A: concluir OP não cria pedido nem disponibilização automaticamente',
    (await q('SELECT sales_order_id FROM public.intercompany_replenishment_requests WHERE id = $1', [req.id]))[0].sales_order_id === null
      && Number((await q('SELECT count(*) AS n FROM public.intercompany_production_releases WHERE request_id = $1', [req.id]))[0].n) === 0);

  // Identidade sem papel gerencial na raiz; um admin de OUTRA empresa não serve.
  const operator = randomUUID();
  await q(`SET session_replication_role = replica`);
  try {
    await q(`INSERT INTO auth.users (id, email, encrypted_password) VALUES ($1, 'operator-loj05a@useerp.test', '')`, [operator]);
    await q(`INSERT INTO public.profiles (id, company_id) VALUES ($1, $2)`, [operator, rootCompanyId]);
    await q(`INSERT INTO public.user_roles (user_id, company_id, role) VALUES ($1, $2, 'operator'), ($1, $3, 'admin')`,
      [operator, rootCompanyId, outsiderCompanyId]);
  } finally { await q(`SET session_replication_role = origin`); }
  for (const [name, uid, email] of [
    ['operador da raiz (admin apenas em outro tenant)', operator, 'operator-loj05a@useerp.test'],
    ['gestor da loja solicitante', storeAdminId, 'admin@quimica.example.com'],
    ['gestor de tenant externo', outsiderAdminId, 'admin@solo.example.com'],
  ]) {
    await rejectedUnchanged(`${name} não disponibiliza na indústria`, req,
      () => asUserTx(uid, email, () => rpc(req.id)), '42501');
  }
  await captureFailure('sessão sem identidade não disponibiliza', async () => {
    // Claims vazias representam ausência de identidade. sub='' no JSON é
    // um UUID malformado (22P02), não um usuário anônimo válido do stub.
    await q('BEGIN');
    try {
      await q('SET LOCAL ROLE authenticated');
      await q(`SELECT set_config('request.jwt.claim.sub', '', true),
        set_config('request.jwt.claims', '{}', true), set_config('request.jwt.claim.role', 'authenticated', true)`);
      await rpc(req.id);
    } finally { await q('ROLLBACK'); }
  }, '42501', /autenticado/);
  await captureFailure('id de solicitação nulo é recusado pelo contrato', () => root(() => rpc(null)), '22023', /Solicitação/);
  await captureFailure('anon não pode executar a RPC', async () => {
    await q('BEGIN');
    try { await q('SET LOCAL ROLE anon'); await rpc(req.id); }
    finally { await q('ROLLBACK'); }
  }, '42501', /permission denied/);

  const before = await snapshot(req);
  const release = await root(() => rpc(req.id));
  const after = await snapshot(req);
  const persisted = (await q(`SELECT r.*, o.status AS order_status, o.company_id AS seller,
    o.branch_id AS order_branch, o.canal_operacional AS order_canal, o.total,
    i.quantity AS item_quantity, i.product_id AS item_product, i.unit_price,
    s.lot_id AS reserved_lot, s.reserved_qty, s.picked_qty, s.status AS reservation_status,
    p.branch_id AS production_branch, public.pcp_order_canal(p) AS production_canal
    FROM public.intercompany_production_releases r
    JOIN public.orders o ON o.id = r.sales_order_id JOIN public.order_items i ON i.id = r.order_item_id
    JOIN public.stock_reservations s ON s.id = r.reservation_id JOIN public.production_orders p ON p.id = r.production_order_id
    WHERE r.request_id = $1`, [req.id]))[0];
  const sourceProduct = (await q('SELECT sale_price, unit FROM public.products WHERE id = $1', [sourceProductId]))[0];
  check('LOJ-05A: gestor cria lastro único da conclusão, pedido PENDENTE e reserva do lote exato',
    release.idempotent_replay === false && release.dispatch_enabled === false
      && release.release_status === 'reservada_bloqueada_fiscal'
      && persisted.request_id === req.id && persisted.production_order_id === req.opId
      && persisted.completion_id === req.completionId && persisted.output_lot_id === req.lotId
      && persisted.reserved_lot === req.lotId && persisted.item_product === sourceProductId
      && persisted.seller === rootCompanyId && persisted.requesting_company_id === storeCompanyId
      && persisted.order_branch === persisted.production_branch && persisted.order_canal === persisted.production_canal
      && persisted.order_status === 'pending' && persisted.reservation_status === 'reserved'
      && Number(persisted.item_quantity) === req.quantity && Number(persisted.reserved_qty) === req.quantity
      && Number(persisted.picked_qty) === 0 && persisted.released_by === rootAdminId
      && Number(persisted.total) === req.quantity * Number(sourceProduct.sale_price) && persisted.unit === sourceProduct.unit,
    JSON.stringify({ release, persisted }));
  check('LOJ-05A: disponibilizar não baixa lote/saldo, não duplica ledger, fiscal nem financeiro',
    JSON.stringify(before.lots) === JSON.stringify(after.lots)
      && before.ledger_count === after.ledger_count && before.fiscal_count === after.fiscal_count
      && before.receivable_count === after.receivable_count
      && before.balances.length === after.balances.length
      && after.balances.every((b) => {
        const previous = before.balances.find((x) => x.id === b.id);
        return previous.quantity === b.quantity && Number(b.reserved_qty) - Number(previous.reserved_qty) === (b.lot_id === req.lotId ? req.quantity : 0);
      }));
  check('LOJ-05A: outro lote FIFO mais antigo existe e não foi usado',
    before.balances.some((b) => b.lot_id !== req.lotId && Number(b.quantity) - Number(b.reserved_qty) >= req.quantity)
      && after.reservations.length === 1 && after.reservations[0].lot_id === req.lotId);
  const replay = await root(() => rpc(req.id));
  check('LOJ-05A: replay mantém o mesmo pedido/reserva/lote sem segundo hold',
    replay.idempotent_replay === true && replay.release_id === release.release_id
      && replay.sales_order_id === release.sales_order_id && replay.reservation_id === release.reservation_id
      && JSON.stringify(await snapshot(req)) === JSON.stringify(after));

  for (const [name, uid, email, expected] of [
    ['raiz', rootAdminId, 'etcsuporte889@gmail.com', 1],
    ['loja envolvida', storeAdminId, 'admin@quimica.example.com', 1],
    ['empresa externa', outsiderAdminId, 'admin@solo.example.com', 0],
  ]) {
    const visible = await asUserTx(uid, email, async () => Number((await q(
      'SELECT count(*) AS n FROM public.intercompany_production_releases WHERE request_id = $1', [req.id]))[0].n));
    check(`LOJ-05A: RLS ${name} lê ${expected} lastro (controles positivos e negativo)`, visible === expected, `linhas=${visible}`);
  }
  // Acesso de unidade: o mesmo viewer lê a unidade participante, mas não
  // outra filial da loja. Há controle positivo com a MESMA identidade.
  const viewer = randomUUID();
  const otherBranch = randomUUID();
  const participatingBranch = (await q('SELECT requesting_branch_id FROM public.intercompany_replenishment_requests WHERE id = $1', [req.id]))[0].requesting_branch_id;
  assert.ok(participatingBranch, 'RLS por unidade precisa de filial participante real');
  await q('SET session_replication_role = replica');
  try {
    await q(`INSERT INTO public.branches (id, company_id, name, code) VALUES ($1, $2, 'Outra loja LOJ05A', 'LOJ05A-OTHER')`, [otherBranch, storeCompanyId]);
    await q(`INSERT INTO auth.users (id, email, encrypted_password) VALUES ($1, 'viewer-loj05a@useerp.test', '')`, [viewer]);
    await q(`INSERT INTO public.profiles (id, company_id, branch_id, default_branch_id) VALUES ($1, $2, $3, $3)`, [viewer, storeCompanyId, otherBranch]);
    await q(`INSERT INTO public.user_roles (user_id, company_id, role) VALUES ($1, $2, 'viewer')`, [viewer, storeCompanyId]);
  } finally { await q('SET session_replication_role = origin'); }
  const visibleToViewer = () => asUserTx(viewer, 'viewer-loj05a@useerp.test', async () => Number((await q(
    'SELECT count(*) AS n FROM public.intercompany_production_releases WHERE request_id = $1', [req.id]))[0].n));
  const otherBranchCount = await visibleToViewer();
  await q('SET session_replication_role = replica');
  try { await q('UPDATE public.profiles SET branch_id = $2, default_branch_id = $2 WHERE id = $1', [viewer, participatingBranch]); }
  finally { await q('SET session_replication_role = origin'); }
  check('LOJ-05A: RLS por unidade nega outra filial e admite a participante à mesma identidade',
    otherBranchCount === 0 && await visibleToViewer() === 1);
  await captureFailure('escrita direta do lastro é negada, mesmo ao gestor da raiz',
    () => root(() => q('UPDATE public.intercompany_production_releases SET release_status = release_status WHERE request_id = $1', [req.id])),
    '42501', /permission denied/);
  await patchAndReject('replay com vínculo adulterado exige conciliação', req,
    () => q('UPDATE public.intercompany_replenishment_requests SET sales_order_id = $2 WHERE id = $1', [req.id, legacyOrderId]),
    () => q('UPDATE public.intercompany_replenishment_requests SET sales_order_id = $2 WHERE id = $1', [req.id, release.sales_order_id]),
    '23514', /Lastro/);

  for (const [name, sql, args, who] of [
    ['WMS pick sem homologação', 'SELECT public.wms_pick_order_stock($1)', [release.sales_order_id], root],
    ['WMS ship sem homologação', 'SELECT public.wms_ship_order($1)', [release.sales_order_id], root],
    ['WMS pick de pedido comercial legado', 'SELECT public.wms_pick_order_stock($1)', [legacyOrderId], root],
    ['WMS ship de pedido comercial legado', 'SELECT public.wms_ship_order($1)', [legacyOrderId], root],
    ['UPDATE direto do pedido', "UPDATE public.orders SET status = 'shipped' WHERE id = $1", [release.sales_order_id], root],
    ['alterar quantidade do item', 'UPDATE public.order_items SET quantity = quantity + 1 WHERE order_id = $1', [release.sales_order_id], root],
    ['mover reserva para pedido legado', 'UPDATE public.stock_reservations SET order_id = $2 WHERE id = $1', [release.reservation_id, legacyOrderId], root],
    ['liberar hold pelo WMS genérico', 'SELECT public.wms_release_order_reservation($1)', [release.sales_order_id], root],
    ['receber nova produção sem entrega', 'SELECT public.receive_intercompany_delivery($1, 4)', [req.id], store],
    ['receber legado sem entrega', 'SELECT public.receive_intercompany_delivery($1, 4)', [legacyRequestId], store],
  ]) {
    await rejectedUnchanged(name, req, () => who(() => q(sql, args)), '55000', /bloquead/);
  }
  await rejectedUnchanged('pedido comum não pode consumir uma reserva intercompany forjada', req, () => root(async () => {
    // Simula o contorno do parâmetro order_id: uma reserva escrita para outro
    // pedido tenta tomar o hold existente. A fixture é comprovadamente criada
    // e toda a transação deve abortar ao atingir o piso de estoque.
    const decoyOrder = (await q(`INSERT INTO public.orders (company_id, branch_id, number, client_name, status)
      VALUES ($1, $2, $3, 'Controle negativo LOJ05A', 'pending') RETURNING id`,
    [rootCompanyId, persisted.production_branch, `LOJ05A-DECOY-${randomUUID()}`]))[0].id;
    const decoyItem = (await q(`INSERT INTO public.order_items
      (company_id, order_id, product_id, product_code, product_name, quantity)
      VALUES ($1, $2, $3, 'FIO-JORNADA', 'Controle negativo LOJ05A', 4) RETURNING id`,
    [rootCompanyId, decoyOrder, sourceProductId]))[0].id;
    await q(`INSERT INTO public.stock_reservations (company_id, order_id, order_item_id, product_id, product_code, product_name,
      requested_qty, reserved_qty, picked_qty, status, lot_id)
      VALUES ($1, $2, $3, $4, 'FIO-JORNADA', 'Controle negativo LOJ05A', 4, 4, 0, 'reserved', $5)`,
    [rootCompanyId, decoyOrder, decoyItem, sourceProductId, req.lotId]);
    assert.equal(Number((await q('SELECT count(*) AS n FROM public.stock_reservations WHERE order_id = $1 AND lot_id = $2', [decoyOrder, req.lotId]))[0].n), 1);
    await q('SELECT public.wms_pick_order_stock($1)', [decoyOrder]);
  }), '55000', /comprometido com intercompany/);
  for (const [name, sql, args] of [
    ['zerar hold por UPDATE de saldo', 'UPDATE public.stock_balances SET reserved_qty = 0 WHERE id = $1', [persisted.stock_balance_id]],
    ['baixar quantidade física comprometida', 'UPDATE public.stock_balances SET quantity = 0 WHERE id = $1', [persisted.stock_balance_id]],
    ['baixar remaining_qty do lote comprometido', 'UPDATE public.stock_lots SET remaining_qty = 0 WHERE id = $1', [req.lotId]],
  ]) {
    await rejectedUnchanged(name, req, () => root(() => q(sql, args)), '55000', /comprometido com intercompany/);
  }
  await captureFailure('indústria não recebe no lugar da loja',
    () => root(() => q('SELECT public.receive_intercompany_delivery($1, 4)', [req.id])), '42501', /loja solicitante/);
  check('LOJ-05A: legado aprovado não é promovido nem ganha lastro inventado',
    (await q('SELECT status FROM public.intercompany_replenishment_requests WHERE id = $1', [legacyRequestId]))[0].status === 'aprovada'
      && Number((await q('SELECT count(*) AS n FROM public.intercompany_production_releases WHERE request_id = $1', [legacyRequestId]))[0].n) === 0);

  const neg = await create();
  await complete(neg);
  await patchAndReject('lote em quarentena é recusado', neg,
    () => q("UPDATE public.stock_lots SET quality_status = 'quarantine' WHERE id = $1", [neg.lotId]),
    () => q("UPDATE public.stock_lots SET quality_status = 'approved' WHERE id = $1", [neg.lotId]), '23514', /Lote produzido/);
  await patchAndReject('OP sem output_lot oficial é recusada', neg,
    () => q('UPDATE public.production_completion_requests SET output_lot_id = NULL WHERE id = $1', [neg.completionId]),
    () => q('UPDATE public.production_completion_requests SET output_lot_id = $2 WHERE id = $1', [neg.completionId, neg.lotId]),
    '23514', /Conclusão oficial/);
  await patchAndReject('lote de outro produto não substitui o lote da OP', neg,
    () => q('UPDATE public.production_completion_requests SET output_lot_id = $2 WHERE id = $1', [neg.completionId, componentLotId]),
    () => q('UPDATE public.production_completion_requests SET output_lot_id = $2 WHERE id = $1', [neg.completionId, neg.lotId]),
    '23514', /Lote produzido/);
  const foreignLot = (await q(`INSERT INTO public.stock_lots
    (company_id, product_id, product_code, product_name, lot_number, quantity, remaining_qty, status, quality_status)
    VALUES ($1, $2, 'FIO-JORNADA', 'Controle negativo LOJ05A', 'LOJ05A-FOREIGN-LOT', 4, 4, 'available', 'approved') RETURNING id`,
  [storeCompanyId, destinationProductId]))[0].id;
  await patchAndReject('lote de outra empresa não substitui o lote da OP', neg,
    () => q('UPDATE public.production_completion_requests SET output_lot_id = $2 WHERE id = $1', [neg.completionId, foreignLot]),
    () => q('UPDATE public.production_completion_requests SET output_lot_id = $2 WHERE id = $1', [neg.completionId, neg.lotId]),
    '23514', /Lote produzido/);
  await patchAndReject('legado sem OP não é vinculado automaticamente', neg,
    () => q('UPDATE public.intercompany_replenishment_requests SET production_order_id = NULL WHERE id = $1', [neg.id]),
    () => q('UPDATE public.intercompany_replenishment_requests SET production_order_id = $2 WHERE id = $1', [neg.id, neg.opId]),
    '23514', /legada/);
  await patchAndReject('unidades divergentes não geram conversão presumida', neg,
    () => q("UPDATE public.products SET unit = 'm' WHERE id = $1", [destinationProductId]),
    () => q('UPDATE public.products SET unit = $2 WHERE id = $1', [destinationProductId, sourceProduct.unit]),
    '23514', /Unidades/);
  const sourceBranch = (await q('SELECT branch_id FROM public.production_orders WHERE id = $1', [neg.opId]))[0].branch_id;
  const destinationBranch = (await q('SELECT requesting_branch_id FROM public.intercompany_replenishment_requests WHERE id = $1', [neg.id]))[0].requesting_branch_id;
  assert.ok(sourceBranch, 'controle negativo de filial precisa de filial fonte real');
  await patchAndReject('unidade solicitante de outra empresa é recusada', neg,
    () => q('UPDATE public.intercompany_replenishment_requests SET requesting_branch_id = $2 WHERE id = $1', [neg.id, sourceBranch]),
    () => q('UPDATE public.intercompany_replenishment_requests SET requesting_branch_id = $2 WHERE id = $1', [neg.id, destinationBranch]),
    '42501', /Unidade solicitante/);
  for (const invalid of ['NaN', 'Infinity']) {
    await patchAndReject(`quantidade ${invalid} é recusada`, neg,
      () => q('UPDATE public.intercompany_replenishment_requests SET quantity = $2::numeric WHERE id = $1', [neg.id, invalid]),
      () => q('UPDATE public.intercompany_replenishment_requests SET quantity = $2 WHERE id = $1', [neg.id, neg.quantity]),
      '22023', /positiva e finita/);
  }
  const balance = (await q('SELECT id, reserved_qty FROM public.stock_balances WHERE lot_id = $1', [neg.lotId]))[0];
  await patchAndReject('saldo livre do lote insuficiente não usa outro FIFO', neg,
    () => q('UPDATE public.stock_balances SET reserved_qty = quantity WHERE id = $1', [balance.id]),
    () => q('UPDATE public.stock_balances SET reserved_qty = $2 WHERE id = $1', [balance.id, balance.reserved_qty]),
    '23514', /Saldo livre insuficiente/);
  const activeClient = (await q(`SELECT cl.id FROM public.clients cl JOIN public.companies c ON c.id = $2
    WHERE cl.company_id = $1 AND regexp_replace(cl.document, '[^0-9]', '', 'g') = regexp_replace(c.cnpj, '[^0-9]', '', 'g')
      AND cl.status = 'active'`, [rootCompanyId, storeCompanyId]))[0];
  assert.ok(activeClient, 'sucesso anterior exige um cliente cadastrado');
  await patchAndReject('cliente ausente/inativo não é fabricado', neg,
    () => q("UPDATE public.clients SET status = 'inactive' WHERE id = $1", [activeClient.id]),
    () => q("UPDATE public.clients SET status = 'active' WHERE id = $1", [activeClient.id]),
    '23514', /nenhum cadastro fictício/);
  await patchAndReject('pedido legado sem registro de disponibilização não é adotado', neg,
    () => q('UPDATE public.intercompany_replenishment_requests SET sales_order_id = $2 WHERE id = $1', [neg.id, legacyOrderId]),
    () => q('UPDATE public.intercompany_replenishment_requests SET sales_order_id = NULL WHERE id = $1', [neg.id]),
    '23514', /legada/);
  const short = await create(4, 'LOJ05A underproduction');
  await complete(short, 3, 1);
  await rejectedUnchanged('produção aprovada menor que a solicitada requer decisão, não promoção silenciosa', short,
    () => root(() => rpc(short.id)), '23514', /não cobrem/);

  // O lote da OP é preservado mesmo com a flag genérica usar_lote desligada.
  // Ligá-la não permite recontabilizar o estoque da disponibilização.
  const previousFlag = (await q("SELECT enabled FROM public.feature_flags WHERE flag_key = 'usar_lote'"))[0];
  try {
    for (const enabled of [false, true]) {
      await q(`INSERT INTO public.feature_flags (flag_key, enabled) VALUES ('usar_lote', $1)
        ON CONFLICT (flag_key) DO UPDATE SET enabled = EXCLUDED.enabled`, [enabled]);
      const flagReq = await create();
      await complete(flagReq);
      const flagBefore = await snapshot(flagReq);
      const flagRelease = await root(() => rpc(flagReq.id));
      const flagAfter = await snapshot(flagReq);
      check(`LOJ-05A: usar_lote=${enabled} preserva lote obrigatório da OP e não duplica estoque/ledger`,
        flagRelease.output_lot_id === flagReq.lotId && Number(flagRelease.quantity) === flagReq.quantity
          && JSON.stringify(flagBefore.lots) === JSON.stringify(flagAfter.lots)
          && flagBefore.ledger_count === flagAfter.ledger_count
          && flagAfter.reservations.length === 1 && flagAfter.reservations[0].lot_id === flagReq.lotId
          && Number(flagAfter.balances.find((b) => b.lot_id === flagReq.lotId).quantity) === flagReq.quantity
          && Number(flagAfter.balances.find((b) => b.lot_id === flagReq.lotId).reserved_qty) === flagReq.quantity);
    }
  } finally {
    if (previousFlag) await q("UPDATE public.feature_flags SET enabled = $1 WHERE flag_key = 'usar_lote'", [previousFlag.enabled]);
    else await q("DELETE FROM public.feature_flags WHERE flag_key = 'usar_lote'");
  }

  // Falha DEPOIS de pedido, item, hold, reserva e lastro: tudo deve voltar.
  const injected = await create(4, 'LOJ05A-INJECT');
  await complete(injected);
  await q(`CREATE FUNCTION public.test_loj05a_fail_link() RETURNS trigger LANGUAGE plpgsql AS $f$
    BEGIN IF OLD.notes = 'LOJ05A-INJECT' AND NEW.sales_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'LOJ05A fault after release'; END IF; RETURN NEW; END $f$;
    CREATE TRIGGER test_loj05a_fail_link BEFORE UPDATE ON public.intercompany_replenishment_requests
    FOR EACH ROW EXECUTE FUNCTION public.test_loj05a_fail_link()`);
  try {
    await rejectedUnchanged('falha após todos os inserts desfaz pedido/item/hold/reserva/lastro', injected,
      () => root(() => rpc(injected.id)), 'P0001', /fault after release/);
  } finally {
    await q('DROP TRIGGER test_loj05a_fail_link ON public.intercompany_replenishment_requests; DROP FUNCTION public.test_loj05a_fail_link()');
  }
  const retried = await root(() => rpc(injected.id));
  check('LOJ-05A: retry após rollback cria exatamente um lastro',
    retried.idempotent_replay === false
      && Number((await q('SELECT count(*) AS n FROM public.intercompany_production_releases WHERE request_id = $1', [injected.id]))[0].n) === 1);

  // Concorrência comprovada, não somente Promise.all de duas chamadas rápidas:
  // a primeira mantém a transação aberta; pg_blocking_pids confirma a segunda
  // esperando esse lock ANTES do commit da primeira. Timeout impede travamento.
  const concurrent = await create();
  await complete(concurrent);
  const workers = [new Client({ host: '127.0.0.1', port: 55444, user: 'postgres', database: 'postgres' }),
    new Client({ host: '127.0.0.1', port: 55444, user: 'postgres', database: 'postgres' })];
  const results = [];
  let blocked = false;
  try {
    for (const w of workers) {
      await w.connect();
      await w.query('BEGIN; SET LOCAL statement_timeout = \'8s\'; SET LOCAL ROLE authenticated');
      await w.query(`SELECT set_config('request.jwt.claim.sub', $1, true),
        set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claims', $2, true)`,
      [rootAdminId, JSON.stringify({ sub: rootAdminId, role: 'authenticated', email: 'etcsuporte889@gmail.com' })]);
    }
    const pids = await Promise.all(workers.map(async (w) => (await w.query('SELECT pg_backend_pid() AS pid')).rows[0].pid));
    results.push((await workers[0].query('SELECT public.finalize_intercompany_production($1) AS r', [concurrent.id])).rows[0].r);
    const second = workers[1].query('SELECT public.finalize_intercompany_production($1) AS r', [concurrent.id])
      .then((r) => ({ value: r.rows[0].r }), (error) => ({ error }));
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline) {
      const wait = (await q('SELECT $2::int = ANY(pg_blocking_pids($1)) AS blocked', pids.slice().reverse()))[0];
      if (wait.blocked) { blocked = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    await workers[0].query('COMMIT');
    const done = await second;
    if (done.error) throw done.error;
    results.push(done.value);
    await workers[1].query('COMMIT');
  } finally {
    for (const w of workers) { await w.query('ROLLBACK').catch(() => {}); await w.end().catch(() => {}); }
  }
  const concurrentState = await snapshot(concurrent);
  check('LOJ-05A: duas conexões autenticadas realmente disputam o lock da solicitação', blocked);
  check('LOJ-05A: concorrência gera um pedido, uma reserva, um hold e um replay',
    results[0].release_id === results[1].release_id && results[0].sales_order_id === results[1].sales_order_id
      && results[0].idempotent_replay === false && results[1].idempotent_replay === true
      && Number(concurrentState.orders) === 1 && Number(concurrentState.items) === 1 && Number(concurrentState.releases) === 1
      && concurrentState.reservations.length === 1
      && Number(concurrentState.balances.find((b) => b.lot_id === concurrent.lotId).reserved_qty) === concurrent.quantity,
    JSON.stringify(results));

  // Todas as fixtures são descartadas pelo teardown do harness. Sem concessão
  // adicional de grants, promoção de legado ou acesso a ambiente externo.
}
