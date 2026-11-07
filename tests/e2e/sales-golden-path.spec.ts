import { test, expect } from '@playwright/test';
import { generated, loginAs, required, UUID } from './isolated-helpers';

declare const process: { env: Record<string, string | undefined> };

/**
 * QA-03 — golden path de VENDAS, migrado de `test.fixme` para o ambiente
 * isolado. INSERT/UPDATE via REST executam sob SET LOCAL ROLE authenticated:
 * as policies orders_tenant_insert e order_items_tenant_insert sao reais.
 *
 * Coberto: pedido -> item -> confirmacao -> titulo em accounts_receivable,
 * com idempotencia. NAO coberto: NF-e/SEFAZ, separacao/WMS, baixa de estoque
 * por venda e aprovacao comercial/financeira (dependem de integracoes fiscais
 * e de PSP, fora do escopo do ambiente isolado e ainda pendentes no parecer).
 */
test.describe('Vendas - Golden Path (QA-03, ambiente isolado)', () => {
  test('pedido confirmado gera titulo a receber e a geracao e idempotente', async () => {
    const env = generated();
    const manager = await loginAs('manager');
    const companyId = required('E2E_COMPANY_ID', env.E2E_COMPANY_ID);
    const productId = required('E2E_PRODUCT_ID', env.E2E_PRODUCT_ID);
    const number = `PV-QA03-GOLDEN-${Date.now()}`;

    const order = await manager.from('orders').insert({
      number, client_name: 'Cliente QA-03', total: 750,
      company_id: companyId, status: 'pending',
    }).select('id, number, total, status, company_id').single();
    expect(order.error, order.error?.message).toBeNull();
    const orderId = required('id do pedido', order.data?.id);
    expect(orderId).toMatch(UUID);
    expect(String(order.data?.company_id)).toBe(companyId);

    const item = await manager.from('order_items').insert({
      order_id: orderId, product_id: productId,
      product_name: 'Algodão em pluma', product_code: 'PLUMA-01',
      quantity: 3, unit_price: 250, total: 750,
    }).select('id, order_id, quantity, total').single();
    expect(item.error, item.error?.message).toBeNull();
    expect(Number(item.data?.total)).toBe(750);

    const confirmed = await manager.from('orders')
      .update({ status: 'confirmed' }).eq('id', orderId).select('status').single();
    expect(confirmed.error, confirmed.error?.message).toBeNull();
    expect(String(confirmed.data?.status)).toBe('confirmed');

    const first = await manager.rpc('generate_receivable_for_order', { p_order_id: orderId });
    expect(first.error, first.error?.message).toBeNull();
    const receivableId = String(first.data);
    expect(receivableId).toMatch(UUID);

    const second = await manager.rpc('generate_receivable_for_order', { p_order_id: orderId });
    expect(second.error, second.error?.message).toBeNull();
    expect(String(second.data), 'replay nao pode criar segundo titulo').toBe(receivableId);

    const ar = await manager.from('accounts_receivable')
      .select('id, description, amount, open_amount, status, invoice_number, order_id, source_type')
      .eq('order_id', orderId);
    expect(ar.error, ar.error?.message).toBeNull();
    expect(ar.data).toHaveLength(1);
    expect(Number(ar.data?.[0]?.amount)).toBe(750);
    expect(Number(ar.data?.[0]?.open_amount)).toBe(750);
    expect(String(ar.data?.[0]?.status)).toBe('pending');
    expect(String(ar.data?.[0]?.invoice_number)).toBe(number);
    expect(String(ar.data?.[0]?.source_type)).toBe('order');
  });

  test('UPDATE sem filtro e recusado (fail-closed do transporte isolado)', async () => {
    const client = await loginAs('manager');
    const url = `${required('VITE_SUPABASE_URL', process.env.VITE_SUPABASE_URL)}`;
    const session = await client.auth.getSession();
    const token = required('access_token', session.data.session?.access_token);
    const response = await fetch(`${url}/rest/v1/orders`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: required('VITE_SUPABASE_PUBLISHABLE_KEY', process.env.VITE_SUPABASE_PUBLISHABLE_KEY),
      },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    expect(response.status).toBe(400);
    const body = await response.json() as { message?: string };
    expect(String(body.message)).toContain('fail-closed');
  });
});
