import { useSupplyChainStats, useTransferOrders } from '@/hooks/operational/network/useNetworkArchitecture';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { AlertTriangle, ArrowRight, Clock, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Skeleton } from '@/ui/base/skeleton';
import { useEnterprise } from '@/core/auth/EnterpriseContext';

export default function NetworkControlTower() {
  const { currentCompany } = useEnterprise();
  const { data: stats, isLoading: statsLoading, error: statsError } = useSupplyChainStats();
  const { data: transfers, isLoading: transfersLoading, error: transfersError } = useTransferOrders();

  if (!currentCompany) return <div role="alert">Selecione uma empresa para consultar a malha logística.</div>;
  if (statsLoading || transfersLoading) return <Skeleton className="h-64 w-full" />;
  if (statsError || transfersError) return <div role="alert" className="text-destructive">Não foi possível consultar a malha logística. Tente novamente.</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle>Em trânsito</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats?.inTransit ?? 0}</p><p className="text-xs text-muted-foreground">Movimentações com status enviado ou em trânsito</p></CardContent>
        </Card>
        <Card><CardHeader><CardTitle>Indicadores ainda não configurados</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Acuracidade, terminais ativos, rupturas e auditoria de segurança não são medidos nesta tela. Nenhuma estimativa deve ser usada para decisões operacionais.</CardContent>
        </Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle>Transferências recentes</CardTitle><CardDescription>Registros consultados na empresa ativa</CardDescription></div><Button variant="ghost" size="sm" asChild><Link to="/operacional/rede/transferencias">Ver todas</Link></Button></CardHeader>
          <CardContent className="space-y-3">
            {transfers?.length ? transfers.slice(0, 5).map(order => (
              <div key={order.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-2"><Truck className="h-4 w-4" /><span>TRF-{order.id.split('-')[0].toUpperCase()}</span><span className="text-xs text-muted-foreground">{order.origin?.name ?? 'Origem'} <ArrowRight className="inline h-3 w-3" /> {order.destination?.name ?? 'Destino'}</span></div>
                <Badge variant="secondary">{order.status}</Badge>
              </div>
            )) : <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" />Nenhuma transferência recente</div>}
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Alertas operacionais não verificados</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">Esta tela não dispõe de regras aprovadas para afirmar ruptura, atraso, recomendação de IA, integridade do ledger ou conformidade. Consulte os módulos específicos e valide seus dados antes de agir.</CardContent>
        </Card>
      </div>
    </div>
  );
}
