import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2 } from 'lucide-react';

type CertStatus = {
  configured: boolean;
  valid?: boolean;
  ws_endpoint_configured?: boolean;
  mode?: 'unavailable' | 'signed_only' | 'live';
  subject?: string;
  issuer?: string;
  not_after?: string;
  days_to_expire?: number;
  expired?: boolean;
  error?: string;
};

const modeLabel: Record<string, string> = {
  unavailable: 'Indisponível',
  signed_only: 'Assinado (sem envio SOAP)',
  live: 'Homologação real',
};

export function ReinfCertificateStatus() {
  const [status, setStatus] = useState<CertStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('reinf-cert-status', { body: {} });
        if (error) throw error;
        setStatus(data as CertStatus);
      } catch {
        setStatus({ configured: false, error: 'fetch_failed' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const icon = loading ? <Loader2 className="h-5 w-5 animate-spin" />
    : !status?.configured ? <ShieldQuestion className="h-5 w-5 text-muted-foreground" />
    : status?.valid === false || status?.expired ? <ShieldAlert className="h-5 w-5 text-destructive" />
    : <ShieldCheck className="h-5 w-5 text-emerald-500" />;

  const badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' =
    !status?.configured ? 'secondary'
    : status.valid === false || status.expired ? 'destructive'
    : status.mode === 'live' ? 'default'
    : 'outline';

  const badgeText = loading ? '…'
    : !status?.configured ? 'Indisponível'
    : status.valid === false ? 'Cert inválido'
    : status.expired ? 'Expirado'
    : modeLabel[status.mode || 'simulated'];

  return (
    <Card className="shadow-lg border-primary/10">
      <CardHeader className="bg-primary/5 border-b">
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon} Certificado A1
        </CardTitle>
        <CardDescription>
          Assinatura XMLDSig e transmissão SOAP à Receita
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6 space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Modo ativo</span>
          <Badge variant={badgeVariant}>{badgeText}</Badge>
        </div>

        {status?.configured && status.subject && (
          <>
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Titular</div>
              <div className="font-mono text-xs break-all">{status.subject}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Validade</div>
                <div className="text-sm">{status.not_after ? new Date(status.not_after).toLocaleDateString('pt-BR') : '—'}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Dias restantes</div>
                <div className={`text-sm font-semibold ${status.expired ? 'text-destructive' : (status.days_to_expire ?? 0) < 30 ? 'text-amber-500' : ''}`}>
                  {status.days_to_expire ?? '—'}
                </div>
              </div>
            </div>
          </>
        )}

        {!status?.configured && !loading && (
          <div className="text-xs text-muted-foreground leading-relaxed">
            Nenhum certificado A1 configurado para este tenant. <strong>Transmissão bloqueada:</strong> nenhum protocolo é gerado ou persistido. Configure os segredos
            <code className="mx-1 px-1 bg-muted rounded">REINF_CERT_A1_B64_&lt;UUID&gt;</code>
            e <code className="mx-1 px-1 bg-muted rounded">REINF_CERT_A1_PASS_&lt;UUID&gt;</code> no backend (UUID da empresa sem hífens, em maiúsculas). Segredos globais não são aceitos.
          </div>
        )}

        {status?.configured && status.valid === false && (
          <div className="text-xs text-destructive leading-relaxed">
            Certificado indisponível para transmissão: verifique PFX, senha, validade e se o titular corresponde ao CNPJ da empresa.
          </div>
        )}

        {status?.configured && !status.ws_endpoint_configured && !status.expired && status.valid !== false && (
          <div className="text-xs text-muted-foreground">
            Envio SOAP desativado — os eventos são assinados e persistidos, mas não transmitidos. Defina
            <code className="mx-1 px-1 bg-muted rounded">REINF_WS_ENDPOINT</code> para habilitar.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
