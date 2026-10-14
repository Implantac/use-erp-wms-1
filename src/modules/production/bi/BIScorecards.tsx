import { Activity, AlertTriangle, BarChart3, DollarSign, Factory, Gauge, Target, TrendingUp } from 'lucide-react';
import { KPICard } from '@/shared/components/KPICard';
import type { BIMetrics } from './useBIMetrics';

export function BIScorecards({ metrics }: { metrics: BIMetrics }) {
  const { avgMargin, costs, completedOPs, onTimePct, avgLeadTime, capacityUtilization } = metrics;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
      <KPICard title="Receita Total" value="—" subtitle="Preços unitários não são faturamento" icon={<DollarSign className="h-4 w-4" />} accentColor="primary" index={0} />
      <KPICard title="Lucro Bruto" value="—" subtitle="Sem vendas e custos realizados" icon={<TrendingUp className="h-4 w-4" />} accentColor="primary" index={1} />
      <KPICard title="Margem média cadastrada" value={costs.length ? `${avgMargin.toFixed(1)}%` : "—"} subtitle="Média de referências unitárias, não margem realizada" icon={<BarChart3 className="h-4 w-4" />} accentColor={avgMargin >= 20 ? 'success' : 'warning'} index={2} />
      <KPICard title="OEE Global" value="—" subtitle="Não apurado: faltam dados auditados de máquina" icon={<Gauge className="h-4 w-4" />} accentColor="primary" index={3} />
      <KPICard title="OPs no prazo" value={completedOPs.length ? `${onTimePct.toFixed(0)}%` : "—"} subtitle={`${completedOPs.length} OPs concluídas com datas`} icon={<Target className="h-4 w-4" />} accentColor={onTimePct >= 90 ? 'success' : 'warning'} index={4} />
      <KPICard title="Tempo entre início e conclusão" value={avgLeadTime === null ? "—" : `${avgLeadTime.toFixed(1)}d`} icon={<Activity className="h-4 w-4" />} accentColor={avgLeadTime !== null && avgLeadTime <= 5 ? 'success' : 'warning'} index={5} />
      <KPICard title="Carga média cadastrada" value={capacityUtilization === null ? "—" : `${capacityUtilization.toFixed(0)}%`} subtitle="Campo de cadastro, não utilização medida" icon={<Factory className="h-4 w-4" />} accentColor={capacityUtilization !== null && capacityUtilization > 90 ? 'danger' : 'success'} index={6} />
      <KPICard title="Custo Refugo" value="—" subtitle="Sem custo realizado por lote" icon={<AlertTriangle className="h-4 w-4" />} accentColor="primary" index={7} />
    </div>
  );
}
