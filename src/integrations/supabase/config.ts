// Configuração de acesso ao Supabase — nuvem OU instalação local (Docker).
//
// Ordem de prioridade:
//   1. `window.__USE_ERP_CONFIG__` — injetado em tempo de execução pelo
//      container local (arquivo /config.js gerado na subida do `web`).
//      É o que permite o MESMO build funcionar em localhost e pelo IP da
//      rede local (ex.: http://192.168.0.10:8080) sem recompilar.
//   2. Variáveis `VITE_SUPABASE_*` — comportamento original (nuvem / dev),
//      embutidas no build pelo Vite.
//   3. `window.location.origin` — na instalação local o frontend e a API
//      são servidos pela mesma origem (o nginx do `web` faz proxy de
//      /rest/v1, /auth/v1, /realtime/v1, /storage/v1 e /functions/v1),
//      então a própria origem da página é a URL correta da API.

export interface UseErpRuntimeConfig {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}

declare global {
  interface Window {
    __USE_ERP_CONFIG__?: UseErpRuntimeConfig;
  }
}

function runtimeConfig(): UseErpRuntimeConfig {
  if (typeof window === "undefined") return {};
  return window.__USE_ERP_CONFIG__ ?? {};
}

function cleanUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function getSupabaseUrl(): string {
  const runtime = runtimeConfig().SUPABASE_URL;
  if (runtime && runtime.trim()) return cleanUrl(runtime);

  const fromEnv = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  if (fromEnv && fromEnv.trim()) return cleanUrl(fromEnv);

  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function getSupabasePublishableKey(): string {
  const runtime = runtimeConfig().SUPABASE_PUBLISHABLE_KEY;
  if (runtime && runtime.trim()) return runtime.trim();

  return (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? "";
}

/** URL pública para montar links de webhook (ex.: /functions/v1/psp-webhook). */
export function getSupabaseFunctionsUrl(): string {
  return `${getSupabaseUrl()}/functions/v1`;
}

/** Verdadeiro quando rodando na instalação local (config em tempo de execução presente). */
export function isLocalSupabase(): boolean {
  const runtime = runtimeConfig();
  return Boolean(runtime.SUPABASE_PUBLISHABLE_KEY || runtime.SUPABASE_URL);
}
