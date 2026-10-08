import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { useOEEMetrics } from '@/hooks/production/useOEEMetrics';
import { useEnterprise } from '@/core/auth/EnterpriseContext';

export default function OEEDashboard() {
  const { currentCompany } = useEnterprise();
  const { data: metrics, isLoading, error, refetch } = useOEEMetrics();
  return (
    <PageContainer>
      <PageHeader title="Registros OEE" description="Registros armazenados; disponibilidade e perdas não são inferidas de estados de máquina" />
      {!currentCompany ? <p role="alert">Selecione uma empresa para consultar OEE.</p> : isLoading ? (
        <p>Consultando registros...</p>
      ) : error ? (
        <p role="alert" className="text-destructive">Falha ao consultar OEE. Nenhum índice pode ser confirmado. <Button variant="outline" onClick={() => void refetch()}>Tentar novamente</Button></p>
      ) : (
        <Card><CardHeader><CardTitle>Últimos registros da empresa ({metrics?.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Consulta limitada aos 100 registros mais recentes. A origem, calibração e janela de medição devem ser auditadas antes do uso operacional. Sem série de perdas TPM verificada ou OEE global calculado.</p>
            {metrics?.map(m => <div key={m.id} className="flex flex-wrap justify-between gap-2 rounded border p-3">
              <span>{new Date(m.timestamp).toLocaleString('pt-BR')} · {m.sector ?? 'Setor não informado'} · {m.machine_id ?? 'Máquina não informada'}</span>
              <span>Valores registrados: OEE {m.oee} · Disponibilidade {m.availability} · Performance {m.performance} · Qualidade {m.quality}</span>
            </div>)}
            {!metrics?.length && <p>Nenhum registro OEE encontrado para a empresa selecionada.</p>}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
