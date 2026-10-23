import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, KeyRound, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';

const PROVIDERS = [
  { value: 'nao_definido', label: 'Ainda não contratei', hint: 'Você contrata direto com o provedor (conta e certificado são da sua empresa).' },
  { value: 'focus_nfe', label: 'Focus NFe', hint: 'Provedor via API. Suportado pelo transmissor do sistema.' },
  { value: 'nfe_io', label: 'NFe.io', hint: 'Provedor via API (transmissor em preparação).' },
  { value: 'plugnotas', label: 'PlugNotas', hint: 'Provedor via API (transmissor em preparação).' },
  { value: 'proprio', label: 'Emissor próprio (SEFAZ)', hint: 'Avançado: exige desenvolvimento e manutenção próprios.' },
];

const CHECKLIST = [
  { key: 'venda_nfe', label: 'Venda (NF-e) autorizada em homologação', core: true },
  { key: 'devolucao', label: 'Devolução autorizada em homologação', core: true },
  { key: 'cancelamento', label: 'Cancelamento autorizado em homologação', core: true },
  { key: 'carta_correcao', label: 'Carta de correção transmitida', core: false },
  { key: 'nfce', label: 'NFC-e autorizada (se vende no balcão/PDV)', core: false },
];

const STEPS = ['Provedor', 'Certificado e acesso', 'Testes na SEFAZ', 'Revisão e liberação'];

/**
 * Assistente fiscal self-service: a própria empresa configura provedor,
 * certificado (enviado no provedor) e token (cofre write-only), registra
 * os testes de homologação e libera a emissão — sem suporte especializado.
 * A emissão real só acontece com o gate do banco satisfeito.
 */
export function FiscalProviderCard() {
  const { currentCompany } = useEnterprise();
  const queryClient = useQueryClient();
  const companyId = currentCompany?.id;
  const [step, setStep] = useState(0);

  const settingsQuery = useQuery({
    queryKey: ['fiscal-provider-settings', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fiscal_provider_settings')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const companyQuery = useQuery({
    queryKey: ['fiscal-company-data', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('companies')
        .select('cnpj, state_registration, tax_regime, address_street, address_city, address_state')
        .eq('id', companyId)
        .maybeSingle();
      return data;
    },
  });

  const coverageQuery = useQuery({
    queryKey: ['fiscal-ncm-coverage', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const total = await (supabase as any)
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId);
      const withNcm = await (supabase as any)
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .not('ncm', 'is', null)
        .neq('ncm', '');
      return { total: total.count ?? 0, withNcm: withNcm.count ?? 0 };
    },
  });

  const tokenQuery = useQuery({
    queryKey: ['fiscal-has-token', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any).rpc('has_fiscal_provider_token', { p_company_id: companyId });
      return !!data;
    },
  });

  const [provider, setProvider] = useState('nao_definido');
  const [providerRef, setProviderRef] = useState('');
  const [environment, setEnvironment] = useState('homologacao');
  const [certDate, setCertDate] = useState('');
  const [csc, setCsc] = useState(false);
  const [homologDate, setHomologDate] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [emissionEnabled, setEmissionEnabled] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  useEffect(() => {
    const s = settingsQuery.data;
    if (s) {
      setProvider(s.provider || 'nao_definido');
      setProviderRef(s.provider_company_ref || '');
      setEnvironment(s.environment || 'homologacao');
      setCertDate(s.certificate_expires_at || '');
      setCsc(!!s.csc_configured);
      setHomologDate(s.homologation_approved_at || '');
      setChecklist(s.homologation_checklist || {});
      setEmissionEnabled(!!s.emission_enabled);
    }
  }, [settingsQuery.data]);

  const coreDone = CHECKLIST.filter((c) => c.core).every((c) => checklist[c.key]);
  const certValid = !!certDate && new Date(certDate) >= new Date(new Date().toDateString());
  const tokenSaved = !!tokenQuery.data;

  const checks = useMemo(() => {
    const comp: any = companyQuery.data || {};
    return [
      { ok: !!comp.cnpj, label: 'CNPJ da empresa cadastrado' },
      { ok: !!comp.state_registration, label: 'Inscrição Estadual cadastrada' },
      { ok: !!comp.tax_regime, label: 'Regime tributário cadastrado' },
      { ok: provider !== 'nao_definido', label: 'Provedor escolhido' },
      { ok: certValid, label: 'Certificado A1 dentro da validade (enviado no provedor)' },
      { ok: tokenSaved, label: 'Token do provedor salvo no cofre' },
      { ok: coreDone, label: 'Testes essenciais aprovados na SEFAZ (homologação)' },
      { ok: !!homologDate, label: 'Homologação registrada' },
      {
        ok: (coverageQuery.data?.total || 0) === 0 || (coverageQuery.data?.withNcm || 0) === (coverageQuery.data?.total || 0),
        label: `Produtos com NCM: ${coverageQuery.data?.withNcm ?? 0}/${coverageQuery.data?.total ?? 0}`,
      },
    ];
  }, [companyQuery.data, provider, certValid, tokenSaved, coreDone, homologDate, coverageQuery.data]);

  const allOk = checks.every((c) => c.ok);

  const save = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from('fiscal_provider_settings')
        .upsert(
          {
            company_id: companyId,
            provider,
            provider_company_ref: providerRef || null,
            environment,
            certificate_expires_at: certDate || null,
            csc_configured: csc,
            homologation_approved_at: homologDate || null,
            homologation_checklist: checklist,
            emission_enabled: emissionEnabled && allOk,
            updated_by: userData.user?.id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'company_id' },
        );
      if (error) throw error;
      if (tokenInput.trim()) {
        const { error: tokenError } = await (supabase as any).rpc('set_fiscal_provider_token', {
          p_company_id: companyId,
          p_token: tokenInput.trim(),
        });
        if (tokenError) throw tokenError;
      }
    },
    onSuccess: () => {
      setTokenInput('');
      toast.success('Configuração fiscal salva.');
      queryClient.invalidateQueries({ queryKey: ['fiscal-provider-settings'] });
      queryClient.invalidateQueries({ queryKey: ['fiscal-has-token'] });
      queryClient.invalidateQueries({ queryKey: ['system-readiness'] });
    },
    onError: (e: any) => toast.error(`Não foi possível salvar: ${e?.message || 'erro inesperado'}`),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Assistente fiscal da empresa
          <Badge variant={emissionEnabled ? 'secondary' : allOk ? 'outline' : 'destructive'}>
            {emissionEnabled ? 'emissão liberada (fila ativa)' : allOk ? 'pronto para liberar' : 'configuração pendente'}
          </Badge>
        </CardTitle>
        <CardDescription>
          Configure você mesmo, sem suporte: provedor e certificado são da sua empresa.
          O token fica num cofre que ninguém lê pela tela — só o transmissor usa.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(i)}
              className={`rounded-full border px-3 py-1 text-xs font-bold ${step === i ? 'bg-primary text-primary-foreground' : ''}`}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Qual provedor você contratou (ou vai contratar)?</Label>
              <Select value={provider} onValueChange={setProvider}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {PROVIDERS.find((p) => p.value === provider)?.hint}
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Identificação da empresa no provedor (se houver)</Label>
              <Input value={providerRef} onChange={(e) => setProviderRef(e.target.value)} placeholder="Ex.: referência/CNPJ cadastrado no painel do provedor" />
              <p className="text-xs text-muted-foreground">Aparece no painel do seu provedor; ajuda o suporte dele a te localizar.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ambiente</Label>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="homologacao">Homologação (testes, sem valor fiscal)</SelectItem>
                  <SelectItem value="producao">Produção (notas de verdade)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Validade do certificado A1</Label>
              <Input type="date" value={certDate} onChange={(e) => setCertDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                O arquivo do certificado (.pfx) é enviado **no painel do provedor**, não aqui.
                Aqui só registramos a validade para te avisar antes de vencer.
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Token do provedor</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder={tokenSaved ? '•••••••• (salvo — digite só para trocar)' : 'Cole o token gerado no provedor'}
                />
                {tokenSaved && <Badge variant="secondary" className="gap-1"><KeyRound className="h-3 w-3" />salvo</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">Fica num cofre write-only: ninguém (nem você) lê de volta pela tela.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={csc} onChange={(e) => setCsc(e.target.checked)} />
              CSC/Token de NFC-e configurado no provedor (se vende no balcão)
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              No ambiente de **homologação** do provedor, transmita cada documento abaixo e
              marque quando a SEFAZ retornar **autorizado**. Sem isso, a emissão não libera —
              é a garantia de que a primeira nota de verdade não vai falhar.
            </p>
            {CHECKLIST.map((item) => (
              <label key={item.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!checklist[item.key]}
                  onChange={(e) => setChecklist((c) => ({ ...c, [item.key]: e.target.checked }))}
                />
                {item.label}
                {item.core && <Badge variant="outline">essencial</Badge>}
              </label>
            ))}
            <div className="flex items-center gap-3 pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!coreDone}
                onClick={() => setHomologDate(new Date().toISOString().slice(0, 10))}
              >
                Registrar homologação aprovada (hoje)
              </Button>
              {homologDate && <span className="text-sm">Registrada em {homologDate}</span>}
              {!coreDone && <span className="text-xs text-muted-foreground">Marque os 3 itens essenciais para registrar.</span>}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              {checks.map((c) => (
                <p key={c.label} className="flex items-center gap-2 text-sm">
                  {c.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <CircleAlert className="h-4 w-4 text-destructive" />
                  )}
                  {c.label}
                </p>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm" title={allOk ? '' : 'Complete todos os itens acima (o banco também valida)'}>
              <input type="checkbox" checked={emissionEnabled} disabled={!allOk} onChange={(e) => setEmissionEnabled(e.target.checked)} />
              Liberar emissão para esta empresa
            </label>
            <p className="text-xs text-muted-foreground">
              Empresa: {currentCompany?.name || '—'} · Liberar não emite nada sozinho:
              as notas entram na fila oficial e o transmissor envia com o token do cofre.
            </p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <Button size="sm" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            <ChevronLeft className="h-4 w-4" /> Voltar
          </Button>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={!companyId || save.isPending} onClick={() => save.mutate()}>
              Salvar configuração
            </Button>
            <Button size="sm" variant="outline" disabled={step === STEPS.length - 1} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              Próximo <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
