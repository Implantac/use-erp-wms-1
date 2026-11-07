import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * QA-02 (segundo incremento) — cadeia COMPLETA de abastecimento no ambiente
 * isolado: loja pede -> fabrica decide pelo CD -> ordem caminha ate EM TRANSITO
 * -> loja recebe com divergencia -> status registra divergencia e saldo sobe 4.
 *
 * Tudo e SQL real: RPCs de negocio do replay de 504 migrations, GETs sob
 * `SET LOCAL ROLE authenticated` com RLS, movimento de estoque e ledger. Nenhum
 * segredo, nenhuma rede externa, nenhum dado fabricado pela suite: a segunda
 * unidade e uma fixture deterministica criada no BOOT do servidor isolado e
 * destruida no teardown (ver scripts/e2e-isolated-server.mjs).
 */
declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};

class DisabledWebSocket {
  constructor() {
    throw new Error('Realtime desabilitado no ambiente E2E isolado (QA-02)');
  }
}
Object.assign(globalThis, { WebSocket: DisabledWebSocket });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function required(name: string, value?: string): string {
  if (!value) throw new Error(`${name} e obrigatoria no ambiente isolado`);
  return value;
}

function generated(): Record<string, string> {
  const text = readFileSync(resolve(process.cwd(), '.env.e2e.generated'), 'utf8');
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

async function login(): Promise<SupabaseClient> {
  const client = createClient(
    required('VITE_SUPABASE_URL', process.env.VITE_SUPABASE_URL),
    required('VITE_SUPABASE_PUBLISHABLE_KEY', process.env.VITE_SUPABASE_PUBLISHABLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: required('E2E_ADMIN_EMAIL', process.env.E2E_ADMIN_EMAIL),
    password: required('E2E_ADMIN_PASSWORD', process.env.E2E_ADMIN_PASSWORD),
  });
  expect(error, error?.message).toBeNull();
  expect(data.user).not.toBeNull();
  return client;
}

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

    const client = await login();
    const before = await balance(client, storeBranch, productId);

    const created = await client.rpc('create_supply_request', {
      p_branch_id: storeBranch,
      p_product_id: productId,
      p_quantity: 5,
      p_notes: 'QA-02 cadeia completa',
    });
    expect(created.error, created.error?.message).toBeNull();
    const createdRow = created.data as { id?: string; status?: string } | null;
    expect(String(createdRow?.status)).toBe('PENDENTE');
    const requestId = required('id da solicitacao', createdRow?.id);

    const inbox = await client.rpc('factory_inbox');
    expect(inbox.error, inbox.error?.message).toBeNull();
    expect(JSON.stringify(inbox.data ?? [])).toContain(requestId);

    const decided = await client.rpc('decide_supply_request', {
      p_supply_request_id: requestId,
      p_source_kind: 'CD',
      p_source_branch_id: cdBranch,
    });
    expect(decided.error, decided.error?.message).toBeNull();
    const decidedRow = decided.data as { transfer_order_id?: string; status?: string } | null;
    expect(String(decidedRow?.status)).toBe('ATENDIDA');
    const transferId = required('transfer_order_id', decidedRow?.transfer_order_id);
    expect(transferId).toMatch(UUID);

    const items = await client
      .from('stock_transfer_items')
      .select('id, requested_qty, shipped_qty')
      .eq('transfer_id', transferId);
    expect(items.error, items.error?.message).toBeNull();
    expect(items.data, 'um produto deve gerar um unico item').toHaveLength(1);
    expect(Number(items.data?.[0]?.requested_qty)).toBe(5);

    const order = await client
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
      const step = await client.rpc('transition_stock_transfer', {
        p_transfer_id: transferId,
        p_to_status: toStatus,
        p_items: (items.data ?? []).map((i) => ({ item_id: i.id, quantity: Number(i.requested_qty) })),
        p_notes: 'QA-02 isolado',
      });
      expect(step.error, `${toStatus}: ${step.error?.message}`).toBeNull();
    }

    const received = await client.rpc('transition_stock_transfer', {
      p_transfer_id: transferId,
      p_to_status: 'RECEBIDA',
      p_items: (items.data ?? []).map((i) => ({ item_id: i.id, quantity: 4 })),
      p_notes: 'QA-02: faltou 1',
    });
    expect(received.error, received.error?.message).toBeNull();
    const receivedRow = received.data as { status?: string; divergence?: number } | null;
    expect(String(receivedRow?.status)).toContain('DIVERGÊNCIA');
    expect(Number(receivedRow?.divergence)).toBe(1);

    const finalOrder = await client
      .from('stock_transfer_orders')
      .select('current_status')
      .eq('id', transferId)
      .single();
    expect(finalOrder.error, finalOrder.error?.message).toBeNull();
    expect(String(finalOrder.data?.current_status)).toContain('DIVERGÊNCIA');

    const after = await balance(client, storeBranch, productId);
    expect(after - before).toBe(4);
  });
});
