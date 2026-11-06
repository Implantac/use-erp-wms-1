// Cliente Supabase — funciona na nuvem e na instalação local (Docker).
// A URL/chave são resolvidas por ./config (runtime local > variáveis Vite >
// própria origem da página). Ver docs/INSTALL-LOCAL.md.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { brokeredPreviewStorage } from './previewAuthStorage';
import { getSupabasePublishableKey, getSupabaseUrl } from './config';

const SUPABASE_URL = getSupabaseUrl();
const SUPABASE_PUBLISHABLE_KEY = getSupabasePublishableKey();

// SEC-02 removeu o `.env` versionado. Sem VITE_SUPABASE_PUBLISHABLE_KEY no
// ambiente de BUILD, createClient lanca "supabaseKey is required." dentro do
// bundle minificado e o app fica em tela branca, sem diagnostico. Falhamos
// cedo com uma mensagem legivel, sem inventar chave nem simulando sucesso.
if (!SUPABASE_PUBLISHABLE_KEY.trim()) {
  throw new Error(
    "[USE ERP] Configuracao ausente: defina VITE_SUPABASE_URL e " +
    "VITE_SUPABASE_PUBLISHABLE_KEY no ambiente de BUILD (painel do Lovable, " +
    "CI ou .env local) e REPUBLIQUE. O Vite embeda variaveis VITE_* no bundle: " +
    "alterar a variavel sem gerar um novo build nao tem efeito. " +
    "Ver docs/ENVIRONMENT.md, secao 0.1."
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: brokeredPreviewStorage(),
    persistSession: true,
    autoRefreshToken: true,
  }
});
