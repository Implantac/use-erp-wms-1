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
import { MRPNeedsTab } from './mrp/MRPNeedsTab';
import { MRPOpsTab } from './mrp/MRPOpsTab';
import { MRPPurchaseTab } from './mrp/MRPPurchaseTab';
import { useNetMRP } from './mrp/useNetMRP';

export default function MRPPage() {
  const { orders, loading: loadingOrders, refetch: refetchOrders } = useProductionOrders();
  const { sheets, loading: loadingSheets, refetch: refetchSheets } = useTechnicalSheets();
  const { supplies, loading: loadingSupplies, refetch: refetchSupplies } = useSupplyStock();
  const { capacities } = useProductionCapacity();
  const { needs, bomLines, coverageByOrder, activeOrders, loading: loadingNet, error: netError, refetch: refetchNet } = useNetMRP(orders);
  const [selectedTab, setSelectedTab] = useState('needs');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const loading = loadingOrders || loadingNet;
  const opsWithoutBom = activeOrders.filter((order) => !order.product_id || !bomLines.some((line) => line.productId === order.product_id));

  const recalculate = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      await Promise.all([refetchOrders(), refetchNet(), refetchSheets(), refetchSupplies()]);
      toast.success('MRP líquido recalculado a partir de BOM, saldos, lotes e compras abertas.');
    } catch (error) {
      console.error(error);
      setRefreshFailed(true);
      toast.error('MRP não atualizado. Tente novamente.');
    } finally {
      setRefreshing(false);
    }
  };

  const totalMaterials = needs.length;
  const criticalCount = needs.filter((need) => need.status === 'critical').length;
  const partialCount = needs.filter((need) => need.status === 'partial').length;
  const okCount = needs.filter((need) => need.status === 'ok').length;
  const unverifiedCount = needs.filter((need) => need.status === 'unverified').length;

  return (
    <PageContainer loading={loading}>
      <PageHeader title="MRP — Planejamento de Materiais" description="Necessidade líquida por OP ativa: snapshot congelado da OP quando existe (BOM atual só para OP legada) com perda + estoque mínimo − saldo disponível − compras abertas. Reservado, bloqueado e lote não liberado não contam como disponível.">
        <Button variant="outline" onClick={recalculate} disabled={refreshing}>
          <RefreshCw className="mr-2 h-4 w-4" /> Recalcular
        </Button>
      </PageHeader>

      {(refreshFailed || netError) && <p role="alert" className="text-sm text-destructive">Falha ao atualizar o MRP líquido{netError ? `: ${netError}` : ''}. Não use os números para compra até recarregar.</p>}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KPICard title="OPs Ativas" value={activeOrders.length} icon={<Layers className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Materiais" value={totalMaterials} icon={<Package className="h-5 w-5" />} accentColor="info" index={1} />
        <KPICard title="Cobertura líquida OK" value={okCount} icon={<CheckCircle className="h-5 w-5" />} accentColor="success" index={2} />
        <KPICard title="Déficit líquido" value={criticalCount + partialCount} icon={<XCircle className="h-5 w-5" />} accentColor="danger" index={3} />
        <KPICard title="Não verificáveis" value={unverifiedCount} icon={<HelpCircle className="h-5 w-5" />} accentColor="warning" index={4} />
      </div>

      {opsWithoutBom.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm text-warning">
              <AlertTriangle className="h-4 w-4" /> {opsWithoutBom.length} OP(s) sem BOM — excluídas do cálculo líquido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {opsWithoutBom.slice(0, 10).map((order) => (
                <Badge key={order.id} variant="outline" className="text-xs">{order.order_number} — {order.product_name}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="needs">Necessidades líquidas</TabsTrigger>
          <TabsTrigger value="ops">OPs × Materiais</TabsTrigger>
          <TabsTrigger value="purchase">Compra sugerida</TabsTrigger>
          <TabsTrigger value="simulation"><FlaskConical className="mr-1 h-4 w-4" /> Simulação What-If</TabsTrigger>
        </TabsList>

        <TabsContent value="needs"><MRPNeedsTab materialNeeds={needs} /></TabsContent>
        <TabsContent value="ops"><MRPOpsTab activeOPs={activeOrders} bomLines={bomLines} coverageByOrder={coverageByOrder} /></TabsContent>
        <TabsContent value="purchase"><MRPPurchaseTab materialNeeds={needs} onGenerated={refetchNet} /></TabsContent>
        <TabsContent value="simulation">
          {loadingSheets || loadingSupplies ? <p className="text-sm text-muted-foreground">Carregando simulação…</p> : <MRPSimulation orders={orders} sheets={sheets} supplies={supplies} capacities={capacities} />}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
