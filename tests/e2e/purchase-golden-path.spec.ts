import { test, expect } from '@playwright/test';
import { generated, loginAs, required, UUID } from './isolated-helpers';

/**
 * QA-03 — golden path de SUPRIMENTOS, migrado de `test.fixme` para o ambiente
 * isolado. SQL real sob RLS: generate_mrp_purchase_order() grava PC + itens +
 * mrp_purchase_requests; recebimento e registrado por UPDATE; o titulo e
 * gerado por generate_payable_for_purchase_order() e lido de accounts_payable.
 *
 * Coberto: necessidade/MRP -> pedido de compra -> recebimento -> contas a
 * pagar, alem de idempotencia e fail-closed. NAO coberto (sem RPC equivalente
 * no replay): cotacao com multiplos fornecedores e check-in WMS com conferencia.
 */
test.describe('Compras - Golden Path (QA-03, ambiente isolado)', () => {
  test('MRP gera PC, recebimento gera contas a pagar e o replay e idempotente', async () => {
    const env = generated();
    const manager = await loginAs('manager');
    const productId = required('E2E_PRODUCT_ID', env.E2E_PRODUCT_ID);
    const key = 'qa03-compras-golden-0001';
    const body = {
      p_items: [{ component_id: productId, quantity: 5, unit_price: 12.5 }],
      p_idempotency_key: key,
      p_supplier_name: 'Fornecedor QA-03',
    };

    const mrp = await manager.rpc('generate_mrp_purchase_order', body);
    expect(mrp.error, mrp.error?.message).toBeNull();
    const poId = required('purchase_order_id', (mrp.data as { purchase_order_id?: string })?.purchase_order_id);
    expect(poId).toMatch(UUID);
    expect(String((mrp.data as { status?: string })?.status)).toBe('draft');

    const po = await manager.from('purchase_orders')
      .select('id, number, status, total, supplier_name').eq('id', poId).single();
    expect(po.error, po.error?.message).toBeNull();
    expect(String(po.data?.status)).toBe('draft');
    expect(Number(po.data?.total)).toBe(62.5);
    expect(String(po.data?.supplier_name)).toBe('Fornecedor QA-03');
    expect(String(po.data?.number)).toMatch(/^PC-MRP-/);

    const items = await manager.from('purchase_order_items')
      .select('id, quantity, received_quantity, unit_price, total')
      .eq('purchase_order_id', poId);
    expect(items.error, items.error?.message).toBeNull();
    expect(items.data).toHaveLength(1);
    expect(Number(items.data?.[0]?.quantity)).toBe(5);
    expect(Number(items.data?.[0]?.received_quantity)).toBe(0);
    expect(Number(items.data?.[0]?.total)).toBe(62.5);

    const received = await manager.from('purchase_order_items')
      .update({ received_quantity: 5 }).eq('purchase_order_id', poId).select('received_quantity');
    expect(received.error, received.error?.message).toBeNull();
    expect(Number(received.data?.[0]?.received_quantity)).toBe(5);

    const payable = await manager.rpc('generate_payable_for_purchase_order', { p_order_id: poId });
    expect(payable.error, payable.error?.message).toBeNull();
    expect(String(payable.data)).toMatch(UUID);

    const ap = await manager.from('accounts_payable')
      .select('id, description, amount, open_amount, status, source_type, source_id')
      .eq('source_id', poId).single();
    expect(ap.error, ap.error?.message).toBeNull();
    expect(Number(ap.data?.amount)).toBe(62.5);
    expect(Number(ap.data?.open_amount)).toBe(62.5);
    expect(String(ap.data?.status)).toBe('pending');
    expect(String(ap.data?.source_type)).toBe('purchase_order');
    expect(String(ap.data?.source_id)).toBe(poId);

    const replay = await manager.rpc('generate_mrp_purchase_order', body);
    expect(replay.error, replay.error?.message).toBeNull();
    expect((replay.data as { idempotent_replay?: boolean })?.idempotent_replay).toBe(true);
    expect(String((replay.data as { purchase_order_id?: string })?.purchase_order_id)).toBe(poId);

    const count = await manager.from('purchase_orders').select('id').eq('number', String(po.data?.number));
    expect(count.error, count.error?.message).toBeNull();
    expect(count.data, 'o replay nao pode duplicar o pedido de compra').toHaveLength(1);
  });

  test('MRP falha fechado sem componente e com quantidade invalida', async () => {
    const env = generated();
    const manager = await loginAs('manager');
    const productId = required('E2E_PRODUCT_ID', env.E2E_PRODUCT_ID);

    const missing = await manager.rpc('generate_mrp_purchase_order', {
      p_items: [{ product_id: productId, quantity: 1 }],
      p_idempotency_key: 'qa03-compras-invalido-1',
      p_supplier_name: 'Fornecedor QA-03',
    });
    expect(missing.error).not.toBeNull();
    expect(missing.error?.message).toContain('component_id');

    const negative = await manager.rpc('generate_mrp_purchase_order', {
      p_items: [{ component_id: productId, quantity: -3 }],
      p_idempotency_key: 'qa03-compras-invalido-2',
      p_supplier_name: 'Fornecedor QA-03',
    });
    expect(negative.error).not.toBeNull();

    const count = await manager.from('mrp_purchase_requests')
      .select('id').eq('idempotency_key', 'qa03-compras-invalido-1');
    expect(count.error, count.error?.message).toBeNull();
    expect(count.data, 'uma chamada invalida nao pode gravar necessidade').toHaveLength(0);
  });
});
