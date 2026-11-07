import { test, expect } from '@playwright/test';
import { generated, loginAs, required, userId, UUID } from './isolated-helpers';

/**
 * QA-03 — separacao REAL de identidades. Nao e um flag nem um mock: sao dois
 * registros em auth.users com profiles e user_roles distintos, e as guardas
 * SECURITY DEFINER (factory_inbox, decide_supply_request, aprovacao de
 * transferencia) leem auth.uid() de verdade sob SET LOCAL ROLE authenticated.
 */
test.describe('QA-03 — separacao de identidades loja/gestor', () => {
  test('operador pede, gestor decide; a loja e barrada nas guardas de gestor', async () => {
    const env = generated();
    const productId = required('E2E_PRODUCT_ID', env.E2E_PRODUCT_ID);
    const storeBranch = required('E2E_STORE_BRANCH_ID', env.E2E_STORE_BRANCH_ID);
    const cdBranch = required('E2E_CD_BRANCH_ID', env.E2E_CD_BRANCH_ID);

    const store = await loginAs('store');
    const manager = await loginAs('manager');
    const storeUid = await userId(store);
    const managerUid = await userId(manager);
    expect(storeUid).toMatch(UUID);
    expect(managerUid).toMatch(UUID);
    expect(storeUid, 'loja e gestor precisam ser usuarios distintos').not.toBe(managerUid);
    expect(storeUid).toBe(required('E2E_STORE_USER_ID', env.E2E_STORE_USER_ID));

    const roles = await store.from('user_roles').select('role').eq('user_id', storeUid);
    expect(roles.error, roles.error?.message).toBeNull();
    expect((roles.data ?? []).map((r) => r.role),
      'o operador nao pode acumular papel de gestor').toEqual(['operator']);

    const created = await store.rpc('create_supply_request', {
      p_branch_id: storeBranch, p_product_id: productId,
      p_quantity: 3, p_notes: 'QA-03 separacao de papeis',
    });
    expect(created.error, created.error?.message).toBeNull();
    const requestId = required('id da solicitacao', (created.data as { id?: string })?.id);

    const inboxDenied = await store.rpc('factory_inbox');
    expect(inboxDenied.error, 'a caixa de entrada e restrita aos gestores').not.toBeNull();
    expect(inboxDenied.error?.message).toContain('gestores');

    const decisionDenied = await store.rpc('decide_supply_request', {
      p_supply_request_id: requestId, p_source_kind: 'CD', p_source_branch_id: cdBranch,
    });
    expect(decisionDenied.error, 'a decisao e do gestor/almoxarifado').not.toBeNull();
    expect(decisionDenied.error?.message).toContain('gestor');

    const inbox = await manager.rpc('factory_inbox');
    expect(inbox.error, inbox.error?.message).toBeNull();
    expect(JSON.stringify(inbox.data ?? [])).toContain(requestId);

    const decided = await manager.rpc('decide_supply_request', {
      p_supply_request_id: requestId, p_source_kind: 'CD', p_source_branch_id: cdBranch,
    });
    expect(decided.error, decided.error?.message).toBeNull();
    expect(String((decided.data as { status?: string })?.status)).toBe('ATENDIDA');

    const audit = await manager.from('supply_requests')
      .select('created_by, decided_by, status').eq('id', requestId).single();
    expect(audit.error, audit.error?.message).toBeNull();
    expect(String(audit.data?.created_by)).toBe(storeUid);
    expect(String(audit.data?.decided_by)).toBe(managerUid);
    expect(String(audit.data?.status)).toBe('ATENDIDA');
  });

  test('aprovar transferencia e decisao do gestor; a loja opera a rede depois', async () => {
    const env = generated();
    const productId = required('E2E_PRODUCT_ID', env.E2E_PRODUCT_ID);
    const storeBranch = required('E2E_STORE_BRANCH_ID', env.E2E_STORE_BRANCH_ID);
    const cdBranch = required('E2E_CD_BRANCH_ID', env.E2E_CD_BRANCH_ID);

    const store = await loginAs('store');
    const manager = await loginAs('manager');

    // decide_supply_request() ja aprova a ordem internamente; para exercitar a
    // guarda de APROVADA usamos a RPC atomica que cria em SUGERIDA.
    const created = await store.rpc('create_stock_transfer_request', {
      p_origin_unit_id: cdBranch,
      p_destination_unit_id: storeBranch,
      p_items: [{ product_id: productId, quantity: 2 }],
      p_notes: 'QA-03 aprovacao restrita ao gestor',
    });
    expect(created.error, created.error?.message).toBeNull();
    expect(String((created.data as { status?: string })?.status)).toBe('SUGERIDA');
    const transferId = required('id da transferencia', (created.data as { id?: string })?.id);

    const items = await manager.from('stock_transfer_items')
      .select('id, requested_qty').eq('transfer_id', transferId);
    expect(items.error, items.error?.message).toBeNull();
    expect(items.data).toHaveLength(1);
    const payload = {
      p_transfer_id: transferId,
      p_items: (items.data ?? []).map((i) => ({ item_id: i.id, quantity: Number(i.requested_qty) })),
      p_notes: 'QA-03',
    };

    const approvalDenied = await store.rpc('transition_stock_transfer', {
      ...payload, p_to_status: 'APROVADA',
    });
    expect(approvalDenied.error, 'aprovar nao e operacao de loja').not.toBeNull();
    expect(approvalDenied.error?.message).toContain('gestor');

    const stillSuggested = await manager.from('stock_transfer_orders')
      .select('current_status').eq('id', transferId).single();
    expect(String(stillSuggested.data?.current_status),
      'a tentativa negada nao pode alterar o status').toBe('SUGERIDA');

    const approved = await manager.rpc('transition_stock_transfer', {
      ...payload, p_to_status: 'APROVADA',
    });
    expect(approved.error, approved.error?.message).toBeNull();

    const reserved = await store.rpc('transition_stock_transfer', {
      ...payload, p_to_status: 'RESERVADA',
    });
    expect(reserved.error, 'a loja deve conseguir operar a rede apos a aprovacao').toBeNull();

    const order = await manager.from('stock_transfer_orders')
      .select('current_status').eq('id', transferId).single();
    expect(order.error, order.error?.message).toBeNull();
    expect(String(order.data?.current_status)).toBe('RESERVADA');
  });
});
