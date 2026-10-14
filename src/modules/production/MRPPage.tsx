import { useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { useTechnicalSheets } from '@/hooks/production/useTechnicalSheets';
import { useSupplyStock } from '@/hooks/inventory/useSupplyStock';
import { useProductionCapacity } from '@/hooks/production/useProductionCapacity';
import { AlertTriangle, Package, CheckCircle, XCircle, Layers, RefreshCw, HelpCircle, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import MRPSimulation from '@/components/production/MRPSimulation';
import { useMRPNeeds } from './mrp/useMRPNeeds';
import { MRPNeedsTab } from './mrp/MRPNeedsTab';
import { MRPOpsTab } from './mrp/MRPOpsTab';
import { MRPPurchaseTab } from './mrp/MRPPurchaseTab';
import { refreshGrossSources } from './mrp/refreshSources';

export default function MRPPage() {
  const { orders, loading: loadingOrders, refetch: refetchOrders } = useProductionOrders();
  const { sheets, loading: loadingSheets, refetch: refetchSheets } = useTechnicalSheets();
  const { supplies, loading: loadingSupplies, refetch: refetchSupplies } = useSupplyStock();
  const { capacities } = useProductionCapacity();
  const [selectedTab, setSelectedTab] = useState('needs');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const { activeOPs, materialNeeds, opsWithInvalidSheet } = useMRPNeeds(orders, sheets, supplies);

  const loading = loadingOrders || loadingSheets || loadingSupplies;

  const recalculate = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      const refreshed = await refreshGrossSources([refetchOrders, refetchSheets, refetchSupplies]);
      if (!refreshed) {
        setRefreshFailed(true);
        toast.error('Projeção não atualizada: uma ou mais consultas falharam.');
        return;
      }
      toast.success('Fontes recarregadas; projeção bruta atualizada.');
    } catch (error) {
      console.error(error);
      setRefreshFailed(true);
      toast.error('Projeção não atualizada. Tente novamente.');
    } finally {
      setRefreshing(false);
    }
  };

  const totalMaterials = materialNeeds.length;
  const criticalCount = materialNeeds.filter(m => m.status === 'critical').length;
  const partialCount = materialNeeds.filter(m => m.status === 'partial').length;
  const okCount = materialNeeds.filter(m => m.status === 'ok').length;
  const unverifiedCount = materialNeeds.filter(m => !m.coverageKnown).length;

  return (
    <PageContainer loading={loading}>
      <PageHeader title="MRP — Planejamento de Materiais" description="Simulação de consumo versus saldo bruto: não considera reservas, bloqueios, entradas previstas nem conversões de unidade">
        <Button variant="outline" onClick={recalculate} disabled={refreshing}>
          <RefreshCw className="h-4 w-4 mr-2" /> Recalcular
        </Button>
      </PageHeader>

      {refreshFailed && <p role="alert" className="text-sm text-destructive">Falha ao atualizar fontes. Os números podem estar desatualizados; não use esta projeção para decisões de compra.</p>}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <KPICard title="OPs Ativas" value={activeOPs.length} icon={<Layers className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Materiais" value={totalMaterials} icon={<Package className="h-5 w-5" />} accentColor="info" index={1} />
        <KPICard title="Saldo cobre (bruto)" value={okCount} icon={<CheckCircle className="h-5 w-5" />} accentColor="success" index={2} />
        <KPICard title="Déficit bruto" value={criticalCount + partialCount} icon={<XCircle className="h-5 w-5" />} accentColor="danger" index={3} />
        <KPICard title="Não verificáveis" value={unverifiedCount} icon={<HelpCircle className="h-5 w-5" />} accentColor="warning" index={4} />
      </div>

      {opsWithInvalidSheet.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning text-sm">
              <AlertTriangle className="h-4 w-4" /> {opsWithInvalidSheet.length} OP(s) sem ficha técnica completa — excluídas desta projeção
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {opsWithInvalidSheet.slice(0, 10).map(op => (
                <Badge key={op.id} variant="outline" className="text-xs">
                  {op.order_number} — {op.product_name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="needs">Necessidades de Material</TabsTrigger>
          <TabsTrigger value="ops">OPs × Materiais</TabsTrigger>
          <TabsTrigger value="purchase">Projeção de compra (bloqueada)</TabsTrigger>
          <TabsTrigger value="simulation"><FlaskConical className="h-4 w-4 mr-1" /> Simulação What-If</TabsTrigger>
        </TabsList>

        <TabsContent value="needs"><MRPNeedsTab materialNeeds={materialNeeds} /></TabsContent>
        <TabsContent value="ops"><MRPOpsTab activeOPs={activeOPs} sheets={sheets} materialNeeds={materialNeeds} /></TabsContent>
        <TabsContent value="purchase">
          <MRPPurchaseTab materialNeeds={materialNeeds} />
        </TabsContent>
        <TabsContent value="simulation">
          <MRPSimulation orders={orders} sheets={sheets} supplies={supplies} capacities={capacities} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
