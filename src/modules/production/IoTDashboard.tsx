import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { useProductionMachines } from '@/hooks/production/useProductionMachines';

export default function IoTDashboard() {
  const { machines } = useProductionMachines();
  return (
    <PageContainer>
      <PageHeader title="Máquinas cadastradas" description="Cadastro operacional; não representa telemetria em tempo real" />
      <Card>
        <CardHeader><CardTitle>Telemetria indisponível</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Não há integração de sensores validada. Conectividade, temperatura, vibração, consumo, MTBF, saúde, alertas preditivos e histórico não foram verificados. Nenhuma medição é gerada nesta tela.</p>
          <p>{machines.length} máquina(s) no cadastro. Os estados administrativos não comprovam conectividade IoT.</p>
          <ul className="list-disc pl-5">{machines.map(machine => <li key={machine.id}>{machine.name} ({machine.code}) — estado cadastrado: {machine.status}</li>)}</ul>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
