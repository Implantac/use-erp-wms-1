import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';

const PROVIDERS = [
  { value: 'nao_definido', label: 'Não definido' },
  { value: 'focus_nfe', label: 'Focus NFe (API)' },
  { value: 'nfe_io', label: 'NFe.io (API)' },
  { value: 'plugnotas', label: 'PlugNotas (API)' },
  { value: 'proprio', label: 'Emissor próprio (SEFAZ direto)' },
];

/**
 * Configuração do provedor fiscal da empresa — preparação para homologação.
 * NÃO emite nota: a emissão permanece bloqueada até a homologação ser
 * concluída e comprovada (certificado, credenciamento e retorno SEFAZ).
 */
export function FiscalProviderCard() {
  const { currentCompany } = useEnterprise();
  const queryClient = useQueryClient();
  const companyId = currentCompany?.id;

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

  const [provider, setProvider] = useState('nao_definido');
  const [environment, setEnvironment] = useState('homologacao');
  const [certDate, setCertDate] = useState('');
  const [csc, setCsc] = useState(false);
  const [homologDate, setHomologDate] = useState('');
  const [emissionEnabled, setEmissionEnabled] = useState(false);

  useEffect(() => {
    const s = settingsQuery.data;
    if (s) {
      setProvider(s.provider || 'nao_definido');
      setEnvironment(s.environment || 'homologacao');
      setCertDate(s.certificate_expires_at || '');
      setCsc(!!s.csc_configured);
      setHomologDate(s.homologation_approved_at || '');
      setEmissionEnabled(!!s.emission_enabled);
    }
  }, [settingsQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from('fiscal_provider_settings')
        .upsert(
          {
            company_id: companyId,
            provider,
            environment,
            certificate_expires_at: certDate || null,
            csc_configured: csc,
            homologation_approved_at: homologDate || null,
            emission_enabled: emissionEnabled && !!homologDate && !!certDate && provider !== 'nao_definido',
            updated_by: userData.user?.id ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'company_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Configuração fiscal salva (emissão continua bloqueada até a homologação).');
      queryClient.invalidateQueries({ queryKey: ['fiscal-provider-settings'] });
      queryClient.invalidateQueries({ queryKey: ['system-readiness'] });
    },
    onError: (e: any) => toast.error(`Não foi possível salvar: ${e?.message || 'erro inesperado'}`),
  });

  const ready = provider !== 'nao_definido' && !!certDate;
  const canEnable = ready && !!homologDate;

  return (
    <Card className={ready ? 'border-amber-500/40' : 'border-red-500/30'}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {ready ? (
            <ShieldCheck className="h-5 w-5 text-amber-500" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-red-500" />
          )}
          Emissor fiscal da empresa
          <Badge variant={ready ? 'secondary' : 'destructive'}>
            {emissionEnabled ? 'emissão liberada (fila ativa)' : ready ? 'aguardando homologação' : 'não configurado'}
          </Badge>
        </CardTitle>
        <CardDescription>
          Defina o provedor e os dados de homologação. <strong>Salvar não emite nota</strong>:
          a emissão só é liberada após certificado válido, credenciamento na SEFAZ da UF e
          retorno aprovado em homologação — verificado, não presumido.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-xs">Provedor</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ambiente</Label>
            <Select value={environment} onValueChange={setEnvironment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="homologacao">Homologação (testes SEFAZ)</SelectItem>
                <SelectItem value="producao">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Certificado A1 — validade</Label>
            <Input type="date" value={certDate} onChange={(e) => setCertDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Homologação aprovada em</Label>
            <Input type="date" value={homologDate} onChange={(e) => setHomologDate(e.target.value)} />
          </div>
          <div className="flex items-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={csc} onChange={(e) => setCsc(e.target.checked)} />
              CSC/Token NFC-e configurado
            </label>
          </div>
          <div className="flex items-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm" title={canEnable ? '' : 'Exige provedor, certificado e data de homologação (o banco também valida)'}>
              <input type="checkbox" checked={emissionEnabled} disabled={!canEnable} onChange={(e) => setEmissionEnabled(e.target.checked)} />
              Liberar emissão (fila)
            </label>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" disabled={!companyId || save.isPending} onClick={() => save.mutate()}>
            Salvar configuração
          </Button>
          <p className="text-xs text-muted-foreground">
            Empresa: {currentCompany?.name || '—'} · Emissão de NF-e/NFC-e permanece bloqueada nesta versão.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
