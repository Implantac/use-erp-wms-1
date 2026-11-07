import { expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * QA-03 — infraestrutura comum das suites isoladas. Nao ha segredos: as
 * credenciais sao fixtures deterministicas criadas no BOOT do Postgres
 * embarcado e exportadas em .env.e2e.generated, destruido no teardown.
 */
declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};

class DisabledWebSocket {
  constructor() {
    throw new Error('Realtime desabilitado no ambiente E2E isolado (QA-03)');
  }
}
Object.assign(globalThis, { WebSocket: DisabledWebSocket });

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function required(name: string, value?: string): string {
  if (!value) throw new Error(`${name} e obrigatoria no ambiente isolado`);
  return value;
}

export function generated(): Record<string, string> {
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

export async function login(email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(
    required('VITE_SUPABASE_URL', process.env.VITE_SUPABASE_URL),
    required('VITE_SUPABASE_PUBLISHABLE_KEY', process.env.VITE_SUPABASE_PUBLISHABLE_KEY),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  expect(error, error?.message).toBeNull();
  expect(data.user).not.toBeNull();
  return client;
}

/** 'manager' = admin do grupo (decide/aprova); 'store' = operador da loja. */
export async function loginAs(kind: 'manager' | 'store'): Promise<SupabaseClient> {
  const env = generated();
  const prefix = kind === 'manager' ? 'E2E_MANAGER' : 'E2E_STORE';
  return login(
    required(`${prefix}_EMAIL`, env[`${prefix}_EMAIL`]),
    required(`${prefix}_PASSWORD`, env[`${prefix}_PASSWORD`]),
  );
}

export async function userId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getUser();
  expect(error, error?.message).toBeNull();
  return required('auth.uid()', data.user?.id);
}
