import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Jornada E2E das lojas pela API REAL (auth + RLS, como o navegador faz):
 *   Loja pede (sem origem) -> gestor vê na Fábrica (factory_inbox)
 *   -> decide pelo CD -> CD expede -> Loja recebe com divergência
 *   -> saldo da Loja sobe e o status registra a divergência.
 *
 * Não cria massa artificial: usa produto/unidades/usuários de homologação
 * das variáveis abaixo. Sem elas, o teste é ignorado explicitamente.
 * Rode com TESTAR-E2E.bat (stack local) — ver docs/E2E-Lojas.md.
 */
declare const process: { env: Record<string, string | undefined> };

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const storeEmail = process.env.E2E_STORE_EMAIL;
const storePassword = process.env.E2E_STORE_PASSWORD;
const managerEmail = process.env.E2E_MANAGER_EMAIL;
const managerPassword = process.env.E2E_MANAGER_PASSWORD;
const productId = process.env.E2E_PRODUCT_ID;
const storeBranchId = process.env.E2E_STORE_BRANCH_ID;
const cdBranchId = process.env.E2E_CD_BRANCH_ID;

const configured = Boolean(
  supabaseUrl && anonKey && storeEmail && storePassword &&
  managerEmail && managerPassword && productId && storeBranchId && cdBranchId,
);

function required(name: string, value?: string): string {
  if (!value) throw new Error(`${name} é obrigatório para a jornada E2E das lojas`);
  return value;
}

async function login(email?: string, password?: string): Promise<SupabaseClient> {
  const client = createClient(required('VITE_SUPABASE_URL', supabaseUrl), required('VITE_SUPABASE_PUBLISHABLE_KEY', anonKey), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: required('E2E_*_EMAIL', email),
    password: required('E2E_*_PASSWORD', password),
  });
  expect(error).toBeNull();
  expect(data.user).not.toBeNull();
  return client;
}

async function balance(client: SupabaseClient, branchId: string): Promise<number> {
  const { data, error } = await client
    .from('stock_balances')
    .select('quantity')
    .eq('branch_id', branchId)
    .eq('product_id', required('E2E_PRODUCT_ID', productId));
  expect(error, `Falha ao consultar saldo: ${error?.message}`).toBeNull();
  return (data || []).reduce((sum, r) => sum + Number(r.quantity || 0), 0);
}

test.describe('Jornada das lojas (API real, com RLS)', () => {
  test.skip(!configured, 'Configure VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, E2E_STORE_*, E2E_MANAGER_*, E2E_PRODUCT_ID, E2E_STORE_BRANCH_ID e E2E_CD_BRANCH_ID.');

  test('loja pede -> fábrica decide CD -> expede -> loja recebe com divergência', async () => {
    const store = await login(storeEmail, storePassword);
    const manager = await login(managerEmail, managerPassword);
    const branchStore = required('E2E_STORE_BRANCH_ID', storeBranchId);
    const branchCd = required('E2E_CD_BRANCH_ID', cdBranchId);

    const before = await balance(store, branchStore);

    // 1) Loja pede sem origem
    const created = await store.rpc('create_supply_request', {
      p_branch_id: branchStore,
      p_product_id: required('E2E_PRODUCT_ID', productId),
      p_quantity: 5,
    });
    expect(created.error, created.error?.message).toBeNull();
    const requestId = required('ID da solicitação retornado pela criação', (created.data as { id?: string } | null)?.id);

    // 2) Gestor enxerga na caixa de entrada da Fábrica
    const inbox = await manager.rpc('factory_inbox');
    expect(inbox.error, inbox.error?.message).toBeNull();
    const inboxText = JSON.stringify(inbox.data || []);
    expect(inboxText).toContain(requestId);

    // 3) Gestor decide pelo CD
    const decided = await manager.rpc('decide_supply_request', {
      p_supply_request_id: requestId,
      p_source_kind: 'CD',
      p_source_branch_id: branchCd,
    });
    expect(decided.error, decided.error?.message).toBeNull();
    const transferId = required('ID da transferência retornado pela decisão', (decided.data as { transfer_order_id?: string } | null)?.transfer_order_id);

    // 4) CD caminha a ordem até EM TRÂNSITO
    const { data: items, error: itemsError } = await manager
      .from('stock_transfer_items')
      .select('id, requested_qty, shipped_qty')
      .eq('transfer_id', transferId);
    expect(itemsError, itemsError?.message).toBeNull();
    expect(items, 'a solicitação de um produto deve gerar um único item').toHaveLength(1);
    expect(Number(items?.[0]?.requested_qty)).toBe(5);
    const { data: orderRow, error: orderError } = await manager
      .from('stock_transfer_orders')
      .select('current_status')
      .eq('id', transferId)
      .single();
    expect(orderError, orderError?.message).toBeNull();
    // A decisão já cria a transferência APROVADA: não repetir a mesma transição.
    const chain = ['SUGERIDA', 'APROVADA', 'RESERVADA', 'SEPARAÇÃO', 'CONFERÊNCIA', 'EXPEDIDA', 'EM TRÂNSITO'];
    const startAt = chain.indexOf(String(orderRow?.current_status));
    expect(startAt, `Status inicial inesperado: ${orderRow?.current_status}`).toBeGreaterThanOrEqual(0);
    for (const toStatus of chain.slice(startAt + 1)) {
      const step = await manager.rpc('transition_stock_transfer', {
        p_transfer_id: transferId,
        p_to_status: toStatus,
        p_items: (items || []).map((i) => ({ item_id: i.id, quantity: Number(i.requested_qty) })),
        p_notes: 'E2E lojas',
      });
      expect(step.error, `${toStatus}: ${step.error?.message}`).toBeNull();
    }

    // 5) Loja recebe 4 de 5 (divergência explícita)
    const received = await store.rpc('transition_stock_transfer', {
      p_transfer_id: transferId,
      p_to_status: 'RECEBIDA',
      p_items: (items || []).map((i) => ({ item_id: i.id, quantity: 4 })),
      p_notes: 'E2E: faltou 1',
    });
    expect(received.error, received.error?.message).toBeNull();

    const { data: finalOrder, error: finalOrderError } = await store
      .from('stock_transfer_orders')
      .select('current_status')
      .eq('id', transferId)
      .single();
    expect(finalOrderError, finalOrderError?.message).toBeNull();
    expect(String(finalOrder?.current_status)).toContain('DIVERGÊNCIA');

    // 6) Saldo da Loja subiu 4
    const after = await balance(store, branchStore);
    expect(after - before).toBe(4);
  });
});
