// ============================================================================
// Worker de transmissão fiscal (service_role) — Focus NFe (1º provedor)
//
// Fluxo: recover_stale_fiscal_jobs() -> claim_fiscal_jobs() -> lê o token DA
// EMPRESA em fiscal_provider_secrets (nunca sai do servidor) -> envia o
// documento (job.payload, JSON no formato do provedor) -> grava o retorno
// REAL com complete_fiscal_emission(). Nada é simulado nem marcado
// autorizado sem retorno do provedor.
//
// Falhas são CLASSIFICADAS (T97): rejeição definitiva do provedor encerra
// como 'rejected'; falha transitória (provedor ainda processando — fluxo
// assíncrono da Focus — token ainda não salvo, rede/HTTP 5xx, worker
// interrompido) devolve o job para a fila via requeue_fiscal_emission, com
// teto de tentativas. "Processando" é confirmado por polling GET /v2/{ref}.
//
// Pré-requisitos por empresa (feitos pelo cliente no assistente fiscal):
// provedor focus_nfe, certificado A1 enviado NO PROVEDOR, token salvo,
// homologação aprovada e emissão liberada (gate no banco).
// Ambientes: homologacao = homologacao.focusnfe.com.br | producao = api.focusnfe.com.br
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { withFiscalWorkerGuard } from './guard.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type JobOutcome =
  | { kind: 'authorized'; protocol: string | null; accessKey: string | null }
  | { kind: 'rejected'; error: string }
  | { kind: 'retry'; error: string };

const AUTHORIZED = ['autorizado', 'autorizada', 'authorized'];
const PROCESSING = ['processando', 'processando_autorizacao', 'processing', 'pendente'];
const REJECTED = ['erro', 'rejeitado', 'rejeitada', 'rejected', 'error'];

Deno.serve(withFiscalWorkerGuard(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Jobs travados em 'processing' (worker interrompido) voltam para a fila.
  await supabase.rpc('recover_stale_fiscal_jobs', { _stale_minutes: 15, _max_attempts: 5 });

  const { data: jobs, error } = await supabase.rpc('claim_fiscal_jobs', { p_limit: 5 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });

  const complete = (jobId: string, outcome: JobOutcome) => outcome.kind === 'authorized'
    ? supabase.rpc('complete_fiscal_emission', {
      _job_id: jobId, _status: 'authorized',
      _protocol: outcome.protocol, _access_key: outcome.accessKey, _error: null,
    })
    : outcome.kind === 'rejected'
      ? supabase.rpc('complete_fiscal_emission', {
        _job_id: jobId, _status: 'rejected',
        _protocol: null, _access_key: null, _error: outcome.error,
      })
      : supabase.rpc('requeue_fiscal_emission', {
        _job_id: jobId, _error: outcome.error, _max_attempts: 5,
      });

  const results: unknown[] = [];
  for (const job of jobs || []) {
    let outcome: JobOutcome;
    try {
      outcome = await transmit(supabase, job);
    } catch (e) {
      outcome = { kind: 'retry', error: e instanceof Error ? e.message : 'erro inesperado no worker' };
    }
    await complete(job.id, outcome);
    results.push({ job: job.id, result: outcome.kind });
  }
  return new Response(JSON.stringify({ processed: results.length, results }), { headers: cors });
}, () => ({
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  cronSecret: Deno.env.get('CRON_SECRET'),
})));

// deno-lint-ignore no-explicit-any
async function transmit(supabase: any, job: any): Promise<JobOutcome> {
  const { data: settings } = await supabase
    .from('fiscal_provider_settings')
    .select('provider, environment')
    .eq('company_id', job.company_id)
    .maybeSingle();
  if (!settings || settings.provider !== 'focus_nfe') {
    return { kind: 'retry', error: `provedor não suportado neste worker: ${settings?.provider || 'não definido'}` };
  }
  const { data: secret } = await supabase
    .from('fiscal_provider_secrets')
    .select('token')
    .eq('company_id', job.company_id)
    .maybeSingle();
  if (!secret?.token) {
    // Configuração do cliente pode ser concluída depois: não é rejeição.
    return { kind: 'retry', error: 'token do provedor não configurado para a empresa' };
  }

  const base = settings.environment === 'producao'
    ? 'https://api.focusnfe.com.br'
    : 'https://homologacao.focusnfe.com.br';
  const path = job.document_type === 'nfce' ? 'nfce' : 'nfe';
  const auth = { Authorization: `Basic ${btoa(`${secret.token}:`)}` };

  let resp: Response;
  try {
    resp = await fetch(`${base}/v2/${path}?ref=${job.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(job.payload || {}),
    });
  } catch (e) {
    return { kind: 'retry', error: `falha de rede ao transmitir: ${e instanceof Error ? e.message : 'desconhecida'}` };
  }
  // deno-lint-ignore no-explicit-any
  let body: any = await resp.json().catch(() => ({}));
  let status = String(body?.status || '').toLowerCase();

  if (AUTHORIZED.includes(status)) {
    return { kind: 'authorized', protocol: body.protocolo || null, accessKey: body.chave_nfe || body.chave || null };
  }
  if (REJECTED.includes(status)) {
    return { kind: 'rejected', error: body.mensagem || body.message || `provedor rejeitou (HTTP ${resp.status})` };
  }
  if (!resp.ok) {
    const message = body?.mensagem || body?.message || `HTTP ${resp.status}`;
    return resp.status >= 500
      ? { kind: 'retry', error: `provedor indisponível: ${message}` }
      : { kind: 'rejected', error: message };
  }

  // Fluxo assíncrono da Focus: POST aceito, autorização vem depois.
  // Confirma por polling curto; se continuar processando, volta para a fila.
  if (PROCESSING.includes(status) || resp.ok) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await sleep(3000);
      try {
        const poll = await fetch(`${base}/v2/${path}/${job.id}`, { headers: auth });
        body = await poll.json().catch(() => ({}));
      } catch {
        continue;
      }
      status = String(body?.status || '').toLowerCase();
      if (AUTHORIZED.includes(status)) {
        return { kind: 'authorized', protocol: body.protocolo || null, accessKey: body.chave_nfe || body.chave || null };
      }
      if (REJECTED.includes(status)) {
        return { kind: 'rejected', error: body.mensagem || body.message || 'provedor rejeitou o documento' };
      }
    }
    return { kind: 'retry', error: 'provedor ainda processando a autorização' };
  }

  return { kind: 'retry', error: `retorno inesperado do provedor: status="${status}" HTTP ${resp.status}` };
}
