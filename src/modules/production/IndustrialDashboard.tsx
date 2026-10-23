import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Button } from "@/ui/base/button";
import {
  Factory,
  Package,
  Activity,
  ShieldCheck,
  AlertTriangle,
  Play,
  BarChart3,
} from "lucide-react";
import { useProductionOrders } from '@/hooks/production/useProductionOrders';
import { useQualityInspections } from '@/hooks/production/useQualityInspections';
import { useProductionMachines } from '@/hooks/production/useProductionMachines';
import { calculateIndustrialDashboardMetrics } from './industrialDashboardMetrics';

function formatQuantity(value: number | null): string {
  if (value === null) return 'Sem dados suficientes';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
}

export default function IndustrialDashboard() {
  const navigate = useNavigate();
  const {
    orders,
    loading: ordersLoading,
    loadError: ordersError,
    hasCompany,
  } = useProductionOrders();
  const {
    inspections,
    loading: inspectionsLoading,
    loadError: inspectionsError,
  } = useQualityInspections();
  const {
    activeMachines,
    machines,
    loading: machinesLoading,
    loadError: machinesError,
  } = useProductionMachines();

  const orderUnitById = useMemo(
    () => new Map(orders.map((order) => [order.id, order.unit])),
    [orders],
  );

  const metrics = useMemo(() => calculateIndustrialDashboardMetrics(
    orders,
    inspections.map((inspection) => ({
      approved_quantity: inspection.approved_quantity,
      rejected_quantity: inspection.rejected_quantity,
      order_unit: inspection.order_unit
        || (inspection.production_order_id ? orderUnitById.get(inspection.production_order_id) : null),
    })),
  ), [orders, inspections, orderUnitById]);

  const loading = ordersLoading || inspectionsLoading || machinesLoading;
  const loadError = ordersError || inspectionsError || machinesError;
  const maxSectorOrders = Math.max(1, ...metrics.sectorCounts.map((item) => item.openOrders));
  const machinesWithLinkedOrder = activeMachines.filter((machine) => machine.current_order_id).length;

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gestão Industrial (PCP)</h1>
          <p className="text-muted-foreground">
            Indicadores calculados das OPs, inspeções e cadastros da empresa ativa. Sem registro, o indicador fica indisponível.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2" onClick={() => navigate('/producao/oee')}>
            <BarChart3 className="h-4 w-4" />
            Consultar OEE
          </Button>
          <Button className="gap-2" onClick={() => navigate('/producao/ordens')}>
            <Play className="h-4 w-4" />
            Ordens de Produção
          </Button>
        </div>
      </div>

      {!hasCompany && (
        <p role="alert" className="text-sm text-muted-foreground">Selecione uma empresa para consultar os indicadores.</p>
      )}
      {hasCompany && loadError && (
        <p role="alert" className="text-sm text-destructive">
          Falha ao carregar uma ou mais fontes. Não interprete cartões vazios como ausência de produção.
        </p>
      )}
      {hasCompany && loading && (
        <p className="text-sm text-muted-foreground">Carregando registros industriais…</p>
      )}

      {hasCompany && !loading && !loadError && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4 border-l-primary">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">OPs em Aberto</CardTitle>
                <Factory className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.openOrders}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.inProgressOrders} em produção · {metrics.startedToday} iniciadas hoje
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-destructive">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">OPs Atrasadas</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.overdueOrders}</div>
                <p className="text-xs text-muted-foreground mt-1">Status aberto e data de entrega vencida</p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">Avanço Médio das OPs Abertas</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.averageProgressPct === null ? 'Sem dados suficientes' : `${metrics.averageProgressPct.toFixed(1)}%`}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Média de produzido ÷ planejado em {metrics.progressSampleSize} OP(s) com quantidades válidas
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-amber-500">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">Aprovação nas Inspeções</CardTitle>
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {metrics.approvalRatePct === null ? 'Sem dados suficientes' : `${metrics.approvalRatePct.toFixed(1)}%`}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics.inspectionCount === 0
                    ? 'Nenhuma inspeção registrada'
                    : metrics.qualityUnit
                      ? `${formatQuantity(metrics.approvedQuantity)} aprovadas · ${formatQuantity(metrics.rejectedQuantity)} rejeitadas (${metrics.qualityUnit})`
                      : 'Unidades diferentes ou OP sem unidade: taxa não agregada'}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
            <Card className="lg:col-span-4">
              <CardHeader>
                <CardTitle>OPs Abertas por Setor/Centro</CardTitle>
              </CardHeader>
              <CardContent>
                {metrics.sectorCounts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem OPs abertas registradas.</p>
                ) : (
                  <div className="space-y-4">
                    {metrics.sectorCounts.map((item) => (
                      <div key={item.sector} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{item.sector}</span>
                          <span className="text-muted-foreground">{item.openOrders} OP(s)</span>
                        </div>
                        <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${(item.openOrders / maxSectorOrders) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-4 text-xs text-muted-foreground">
                  Contagem de OPs, não carga de capacidade. Capacidade finita exige recurso, calendário, setup e programação validados.
                </p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Cadastros e Rastreabilidade</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-3 rounded-lg border bg-secondary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="h-4 w-4 text-primary" />
                      <span className="text-sm font-semibold">Equipamentos cadastrados</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {activeMachines.length} ativo(s) de {machines.length} cadastrado(s); {machinesWithLinkedOrder} com OP vinculada no cadastro.
                      Isso não prova máquina operando: estado real exige apontamento ou integração.
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border bg-secondary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <ShieldCheck className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-semibold">Qualidade e genealogia</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Inspeções sustentam os indicadores acima. Genealogia completa de lotes ainda exige vínculos persistidos
                      de entrada e saída; logs de produção não são prova de recall.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
