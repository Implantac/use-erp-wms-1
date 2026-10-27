// ============================================================================
// Worker de transmissão fiscal (service_role) — Focus NFe (1º provedor)
//
// Fluxo: claim_fiscal_jobs() -> lê o token DA EMPRESA em
// fiscal_provider_secrets (nunca sai do servidor) -> envia o documento
// (job.payload, JSON no formato do provedor) -> grava o retorno REAL com
// complete_fiscal_emission(). Sem token ou sem payload válido, o job volta
// como erro — nada é simulado nem marcado autorizado sem retorno do provedor.
//
// Pré-requisitos por empresa (feitos pelo cliente no assistente fiscal):
// provedor focus_nfe, certificado A1 enviado NO PROVEDOR, token salvo,
// homologação aprovada e emissão liberada (gate no banco).
// Ambientes: homologacao = homologacao.focusnfe.com.br | producao = api.focusnfe.com.br
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: jobs, error } = await supabase.rpc('claim_fiscal_jobs', { p_limit: 10 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors });

  const results: unknown[] = [];
  for (const job of jobs || []) {
    try {
      const { data: settings } = await supabase
        .from('fiscal_provider_settings')
        .select('provider, environment')
        .eq('company_id', job.company_id)
        .maybeSingle();
      if (!settings || settings.provider !== 'focus_nfe') {
        throw new Error(`provedor não suportado neste worker: ${settings?.provider || 'não definido'}`);
      }
      const { data: secret } = await supabase
        .from('fiscal_provider_secrets')
        .select('token')
        .eq('company_id', job.company_id)
        .maybeSingle();
      if (!secret?.token) throw new Error('token do provedor não configurado para a empresa');

      const base = settings.environment === 'producao'
        ? 'https://api.focusnfe.com.br'
        : 'https://homologacao.focusnfe.com.br';
      const path = job.document_type === 'nfce' ? 'nfce' : 'nfe';
      const resp = await fetch(`${base}/v2/${path}?ref=${job.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${btoa(`${secret.token}:`)}`,
        },
        body: JSON.stringify(job.payload || {}),
      });
      const body = await resp.json().catch(() => ({}));
      const status = String(body.status || '').toLowerCase();
      if (resp.ok && ['autorizado', 'autorizada', 'authorized'].includes(status)) {
        await supabase.rpc('complete_fiscal_emission', {
          _job_id: job.id,
          _status: 'authorized',
          _protocol: body.protocolo || null,
          _access_key: body.chave_nfe || body.chave || null,
          _error: null,
        });
        results.push({ job: job.id, result: 'authorized' });
      } else {
        await supabase.rpc('complete_fiscal_emission', {
          _job_id: job.id,
          _status: 'rejected',
          _protocol: null,
          _access_key: null,
          _error: body.mensagem || body.message || `HTTP ${resp.status}`,
        });
        results.push({ job: job.id, result: 'rejected', detail: body.mensagem || resp.status });
      }
    } catch (e) {
      await supabase.rpc('complete_fiscal_emission', {
        _job_id: job.id,
        _status: 'rejected',
        _protocol: null,
        _access_key: null,
        _error: e instanceof Error ? e.message : 'erro inesperado no worker',
      });
      results.push({ job: job.id, result: 'error', detail: String(e) });
    }
  }
  return new Response(JSON.stringify({ processed: results.length, results }), { headers: cors });
});
