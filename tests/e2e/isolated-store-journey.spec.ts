import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * QA-02 — primeira jornada de negócio sobre o ambiente isolado do QA-01.
 *
 * Nenhum segredo e nenhuma rede externa: a massa vem dos seeds deterministicos
 * aplicados no boot (504 migrations + 3 seeds) e e descoberta pelo proprio
 * servidor em `.env.e2e.generated`. As consultas e as RPCs executam SQL real
 * sob `SET LOCAL ROLE authenticated` com `request.jwt.claims`, ou seja, RLS de
 * verdade. Aqui acontece a primeira ESCRITA de negocio do ambiente isolado.
 *
 * Escopo honesto: este incremento cobre pedido de abastecimento -> persistencia
 * -> caixa de entrada da fabrica e o fail-closed de quantidade invalida. A
 * cadeia posterior (decisao do gestor, expedicao, recebimento com divergencia
 * e saldo) e os tres golden paths `fixme` exigem massa por papel e saldos por
 * filial; permanecem como proximo incremento de QA-02/QA-03, nao sao
 * declarados concluidos aqui.
 */
declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};

// Node 20 nao traz WebSocket nativo e o supabase-js inicializa o RealtimeClient
// ja no createClient(). Realtime nao faz parte deste contrato: qualquer tentativa
// de abrir conexao falha fechado, nunca simula sucesso.
class DisabledWebSocket {
  constructor() {
    throw new Error('Realtime desabilitado no ambiente E2E isolado (QA-02)');
  }
}
Object.assign(globalThis, { WebSocket: DisabledWebSocket });

const url = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function required(name: string, value?: string): string {
  if (!value) throw new Error(`${name} e obrigatoria no ambiente isolado`);
  return value;
}

/** Le os IDs descobertos no boot; sao gerados, nunca fornecidos por segredo. */
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
    required('VITE_SUPABASE_URL', url),
    required('VITE_SUPABASE_PUBLISHABLE_KEY', anonKey),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: required('E2E_ADMIN_EMAIL', adminEmail),
    password: required('E2E_ADMIN_PASSWORD', adminPassword),
  });
  expect(error, error?.message).toBeNull();
  expect(data.user).not.toBeNull();
  return client;
}

test.describe('QA-02 — jornada de abastecimento no ambiente isolado', () => {
  test('massa deterministic dos seeds e consultavel sob RLS real', async () => {
    const env = generated();
    const companyId = required('E2E_COMPANY_ID', env.E2E_COMPANY_ID);
    const productId = required('E2E_PRODUCT_ID', env.E2E_PRODUCT_ID);
    const branchId = required('E2E_STORE_BRANCH_ID', env.E2E_STORE_BRANCH_ID);
    expect(companyId).toMatch(UUID);
    expect(productId).toMatch(UUID);
    expect(branchId).toMatch(UUID);
    expect(env.E2E_ISOLATED).toBe('1');
    expect(Number(env.E2E_MIGRATIONS)).toBeGreaterThanOrEqual(504);

    const client = await login();
    const products = await client.from('products').select('id, code').eq('id', productId);
    expect(products.error, products.error?.message).toBeNull();
    expect(products.data).toHaveLength(1);
    expect(String(products.data?.[0]?.code)).toBe('PLUMA-01');

    const branches = await client.from('branches').select('id').eq('company_id', companyId);
    expect(branches.error, branches.error?.message).toBeNull();
    expect((branches.data ?? []).length).toBeGreaterThan(0);
  });

  test('loja cria pedido real e a fabrica o enxerga (escrita sob RLS)', async () => {
    const env = generated();
    const productId = required('E2E_PRODUCT_ID', env.E2E_PRODUCT_ID);
    const branchId = required('E2E_STORE_BRANCH_ID', env.E2E_STORE_BRANCH_ID);
    const client = await login();

    const created = await client.rpc('create_supply_request', {
      p_branch_id: branchId,
      p_product_id: productId,
      p_quantity: 5,
      p_notes: 'QA-02 isolado',
    });
    expect(created.error, created.error?.message).toBeNull();
    const row = created.data as { id?: string; status?: string } | null;
    expect(String(row?.status)).toBe('PENDENTE');
    const requestId = required('id retornado por create_supply_request', row?.id);
    expect(requestId).toMatch(UUID);

    const persisted = await client
      .from('supply_requests')
      .select('id, status, quantity')
      .eq('id', requestId);
    expect(persisted.error, persisted.error?.message).toBeNull();
    expect(persisted.data).toHaveLength(1);
    expect(String(persisted.data?.[0]?.status)).toBe('PENDENTE');
    expect(Number(persisted.data?.[0]?.quantity)).toBe(5);

    const inbox = await client.rpc('factory_inbox');
    expect(inbox.error, inbox.error?.message).toBeNull();
    expect(JSON.stringify(inbox.data ?? [])).toContain(requestId);
  });

  test('quantidade invalida falha fechado e nao cria registro', async () => {
    const env = generated();
    const productId = required('E2E_PRODUCT_ID', env.E2E_PRODUCT_ID);
    const branchId = required('E2E_STORE_BRANCH_ID', env.E2E_STORE_BRANCH_ID);
    const client = await login();

    const before = await client.from('supply_requests').select('id');
    expect(before.error, before.error?.message).toBeNull();
    const countBefore = (before.data ?? []).length;

    const rejected = await client.rpc('create_supply_request', {
      p_branch_id: branchId,
      p_product_id: productId,
      p_quantity: 0,
      p_notes: 'QA-02 quantidade invalida',
    });
    expect(rejected.error, 'quantidade zero deveria ser recusada').not.toBeNull();

    const after = await client.from('supply_requests').select('id');
    expect(after.error, after.error?.message).toBeNull();
    expect((after.data ?? []).length).toBe(countBefore);
  });
});
