import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * QA-01 — prova de que o ambiente E2E e isolado, repetivel e executa SQL real.
 *
 * Nao e um mock: o login valida crypt() contra auth.users, as consultas rodam
 * sob SET LOCAL ROLE authenticated com request.jwt.claims (RLS de verdade) e
 * as RPCs sao as funcoes do replay de 504 migrations. Nenhum dado e fabricado
 * pela suite; a massa vem dos seeds deterministicos aplicados no boot.
 *
 * Escopo honesto: este e o contrato de INFRAESTRUTURA. As jornadas completas
 * de loja/PCP/fiscal por cliques e API continuam em QA-02/QA-03 e no job
 * legado `authenticated`, que exige homologacao externa.
 */
declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} e obrigatoria no ambiente isolado`);
  return value;
}

const url = required('VITE_SUPABASE_URL');
const anonKey = required('VITE_SUPABASE_PUBLISHABLE_KEY');
const adminEmail = required('E2E_ADMIN_EMAIL');
const adminPassword = required('E2E_ADMIN_PASSWORD');
const marker = required('E2E_ISOLATED_MARKER');
const envPath = resolve(process.cwd(), '.env.e2e.generated');

// Node 20 nao traz WebSocket nativo e o supabase-js inicializa o
// RealtimeClient ja no createClient(). Realtime nao faz parte deste contrato:
// qualquer tentativa de abrir conexao falha fechado, nunca simula sucesso.
class DisabledWebSocket {
  constructor() {
    throw new Error('Realtime desabilitado no ambiente E2E isolado (QA-01)');
  }
}
Object.assign(globalThis, { WebSocket: DisabledWebSocket });

function client() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test.describe('QA-01 — ambiente E2E isolado', () => {
  test('health prova loopback, marcador de isolamento e replay completo', async () => {
    expect(new URL(url).hostname).toBe('127.0.0.1');
    const response = await fetch(`${url}/auth/v1/health`);
    expect(response.status).toBe(200);
    const health = await response.json();
    expect(health.isolated).toBe(true);
    expect(health.loopback).toBe(true);
    expect(health.marker).toBe(marker);
    expect(Number(health.migrations)).toBeGreaterThanOrEqual(504);
  });

  test('arquivo de ambiente e efemero, coerente e nao aponta para producao', async () => {
    expect(existsSync(envPath), 'o servidor deve gerar .env.e2e.generated').toBe(true);
    const text = readFileSync(envPath, 'utf8');
    expect(text).toContain(`VITE_SUPABASE_URL=${url}`);
    expect(text).toContain(`E2E_ISOLATED_MARKER=${marker}`);
    expect(text).toContain('E2E_ISOLATED=1');
    expect(text).toContain('NAO versionar');
    expect(text).not.toMatch(/supabase\.co/);
  });

  test('login real contra auth.users e RLS aplicada as consultas', async () => {
    const supabase = client();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: adminEmail, password: adminPassword,
    });
    expect(error, error?.message).toBeNull();
    expect(data.user?.id).toBeTruthy();
    expect(data.session?.access_token).toBeTruthy();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, company_id')
      .eq('id', String(data.user?.id))
      .single();
    expect(profileError, profileError?.message).toBeNull();
    expect(profile?.company_id).toBeTruthy();

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, code')
      .eq('code', 'PLUMA-01');
    expect(productsError, productsError?.message).toBeNull();
    expect(products, 'o seed deterministico deve estar visivel sob RLS').toHaveLength(1);
    expect(products?.[0].code).toBe('PLUMA-01');
  });

  test('RPC de negocio executa no replay e e repetivel', async () => {
    const supabase = client();
    const { error } = await supabase.auth.signInWithPassword({
      email: adminEmail, password: adminPassword,
    });
    expect(error, error?.message).toBeNull();

    const first = await supabase.rpc('factory_inbox');
    expect(first.error, first.error?.message).toBeNull();
    expect(first.data).toBeTruthy();
    expect(Array.isArray((first.data as { supply?: unknown[] }).supply)).toBe(true);

    const second = await supabase.rpc('factory_inbox');
    expect(second.error, second.error?.message).toBeNull();
    expect(JSON.stringify(second.data)).toBe(JSON.stringify(first.data));
  });

  // Migrados de src/lib/testing/integration/workflow.test.ts: antes falavam
  // com um Supabase externo via .env local (SEC-02 removeu o arquivo) e, sem
  // backend, davam timeout como se fossem unitarios. Aqui rodam de verdade.
  test('tabela de idempotencia esta operacional no replay', async () => {
    const supabase = client();
    const { error } = await supabase.auth.signInWithPassword({
      email: adminEmail, password: adminPassword,
    });
    expect(error, error?.message).toBeNull();

    const { data, error: tableError } = await supabase
      .from('idempotency_keys')
      .select('*')
      .limit(1);
    expect(tableError, tableError?.message).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  test('RPC audit_stock_integrity existe e e invocavel', async () => {
    const supabase = client();
    const { error } = await supabase.auth.signInWithPassword({
      email: adminEmail, password: adminPassword,
    });
    expect(error, error?.message).toBeNull();

    const result = await supabase.rpc('audit_stock_integrity', {
      _company_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(result.error, result.error?.message).toBeNull();
    expect(result.error?.code).not.toBe('PGRST202');
    expect(result.error?.message ?? '').not.toContain('nao existe no replay');
    expect(result.data).toBeTruthy();
  });

  test('credencial invalida e ausencia de JWT falham fechado', async () => {
    const supabase = client();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: adminEmail, password: 'senha-que-nao-existe',
    });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();

    const response = await fetch(`${url}/rest/v1/products?select=id`);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.message).toContain('RLS nao foi aplicada');
  });
});
