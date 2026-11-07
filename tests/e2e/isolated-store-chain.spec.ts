import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generated, loginAs, required } from './isolated-helpers';

/**
 * QA-02 (cadeia) + QA-03 (papeis) — abastecimento completo no ambiente
 * isolado com DUAS identidades reais: a loja pede e recebe; o gestor do CD
 * analisa, decide e aprova. SQL real, RLS real, nenhum segredo, nenhum dado
 * de cliente. A segunda unidade e o saldo sem lote sao fixtures do BOOT,
 * destruidas no teardown (scripts/e2e-isolated-server.mjs).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function balance(client: SupabaseClient, branchId: string, productId: string): Promise<number> {
  const { data, error } = await client
    .from('stock_balances')
    .select('quantity')
    .eq('branch_id', branchId)
    .eq('product_id', productId);
  expect(error, `Falha ao consultar saldo: ${error?.message}`).toBeNull();
  return (data ?? []).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
}

test.describe('QA-02 — cadeia completa de abastecimento', () => {
  test('loja pede, CD expede, loja recebe com divergencia e saldo sobe 4', async () => {
    const env = generated();
    const productId = required('E2E_PRODUCT_ID', env.E2E_PRODUCT_ID);
    const storeBranch = required('E2E_STORE_BRANCH_ID', env.E2E_STORE_BRANCH_ID);
    const cdBranch = required('E2E_CD_BRANCH_ID', env.E2E_CD_BRANCH_ID);
    expect(storeBranch).toMatch(UUID);
    expect(cdBranch).toMatch(UUID);
    expect(storeBranch, 'a fixture deve criar uma loja distinta da matriz/CD').not.toBe(cdBranch);

    const store = await loginAs('store');
    const manager = await loginAs('manager');
    const before = await balance(manager, storeBranch, productId);

    const created = await store.rpc('create_supply_request', {
      p_branch_id: storeBranch,
      p_product_id: productId,
      p_quantity: 5,
      p_notes: 'QA-02 cadeia completa',
    });
    expect(created.error, created.error?.message).toBeNull();
    const createdRow = created.data as { id?: string; status?: string } | null;
    expect(String(createdRow?.status)).toBe('PENDENTE');
    const requestId = required('id da solicitacao', createdRow?.id);

    const inbox = await manager.rpc('factory_inbox');
    expect(inbox.error, inbox.error?.message).toBeNull();
    expect(JSON.stringify(inbox.data ?? [])).toContain(requestId);

    const decided = await manager.rpc('decide_supply_request', {
      p_supply_request_id: requestId,
      p_source_kind: 'CD',
      p_source_branch_id: cdBranch,
    });
    expect(decided.error, decided.error?.message).toBeNull();
    const decidedRow = decided.data as { transfer_order_id?: string; status?: string } | null;
    expect(String(decidedRow?.status)).toBe('ATENDIDA');
    const transferId = required('transfer_order_id', decidedRow?.transfer_order_id);
    expect(transferId).toMatch(UUID);

    const items = await manager
      .from('stock_transfer_items')
      .select('id, requested_qty, shipped_qty')
      .eq('transfer_id', transferId);
    expect(items.error, items.error?.message).toBeNull();
    expect(items.data, 'um produto deve gerar um unico item').toHaveLength(1);
    expect(Number(items.data?.[0]?.requested_qty)).toBe(5);

    const order = await manager
      .from('stock_transfer_orders')
      .select('current_status, origin_unit_id, destination_unit_id')
      .eq('id', transferId)
      .single();
    expect(order.error, order.error?.message).toBeNull();
    expect(String(order.data?.origin_unit_id)).toBe(cdBranch);
    expect(String(order.data?.destination_unit_id)).toBe(storeBranch);

    const chain = ['SUGERIDA', 'APROVADA', 'RESERVADA', 'SEPARAÇÃO', 'CONFERÊNCIA', 'EXPEDIDA', 'EM TRÂNSITO'];
    const startAt = chain.indexOf(String(order.data?.current_status));
    expect(startAt, `status inicial inesperado: ${order.data?.current_status}`).toBeGreaterThanOrEqual(0);
    for (const toStatus of chain.slice(startAt + 1)) {
      // APROVADA e decisao do gestor; as demais transicoes sao operacao da rede.
      const actor = toStatus === 'APROVADA' ? manager : store;
      const step = await actor.rpc('transition_stock_transfer', {
        p_transfer_id: transferId,
        p_to_status: toStatus,
        p_items: (items.data ?? []).map((i) => ({ item_id: i.id, quantity: Number(i.requested_qty) })),
        p_notes: 'QA-02 isolado',
      });
      expect(step.error, `${toStatus}: ${step.error?.message}`).toBeNull();
    }

    const received = await store.rpc('transition_stock_transfer', {
      p_transfer_id: transferId,
      p_to_status: 'RECEBIDA',
      p_items: (items.data ?? []).map((i) => ({ item_id: i.id, quantity: 4 })),
      p_notes: 'QA-02: faltou 1',
    });
    expect(received.error, received.error?.message).toBeNull();
    const receivedRow = received.data as { status?: string; divergence?: number } | null;
    expect(String(receivedRow?.status)).toContain('DIVERGÊNCIA');
    expect(Number(receivedRow?.divergence)).toBe(1);

    const finalOrder = await manager
      .from('stock_transfer_orders')
      .select('current_status')
      .eq('id', transferId)
      .single();
    expect(finalOrder.error, finalOrder.error?.message).toBeNull();
    expect(String(finalOrder.data?.current_status)).toContain('DIVERGÊNCIA');

    const after = await balance(manager, storeBranch, productId);
    expect(after - before).toBe(4);
  });
});
