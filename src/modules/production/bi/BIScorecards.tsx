import { Activity, AlertTriangle, BarChart3, DollarSign, Factory, Gauge, Target, TrendingUp } from 'lucide-react';
import { KPICard } from '@/shared/components/KPICard';
import { formatBRL } from '@/lib/formatters';
import type { BIMetrics } from './useBIMetrics';

export function BIScorecards({ metrics }: { metrics: BIMetrics }) {
  const { totalRevenue, strategicIndicators, avgMargin, onTimePct, avgLeadTime, capacityUtilization } = metrics;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
      <KPICard title="Receita Total" value={formatBRL(totalRevenue)} icon={<DollarSign className="h-4 w-4" />} accentColor="success" index={0} />
      <KPICard title="Lucro Bruto" value={formatBRL(strategicIndicators.grossProfit)} icon={<TrendingUp className="h-4 w-4" />} accentColor={strategicIndicators.grossProfit > 0 ? 'success' : 'danger'} index={1} />
      <KPICard title="Margem Média" value={`${avgMargin.toFixed(1)}%`} icon={<BarChart3 className="h-4 w-4" />} accentColor={avgMargin >= 20 ? 'success' : 'warning'} index={2} />
      <KPICard title="OEE Global" value="—" subtitle="Não apurado: faltam dados auditados de máquina" icon={<Gauge className="h-4 w-4" />} accentColor="primary" index={3} />
      <KPICard title="On-Time" value={`${onTimePct.toFixed(0)}%`} icon={<Target className="h-4 w-4" />} accentColor={onTimePct >= 90 ? 'success' : 'warning'} index={4} />
      <KPICard title="Lead Time" value={`${avgLeadTime.toFixed(1)}d`} icon={<Activity className="h-4 w-4" />} accentColor={avgLeadTime <= 5 ? 'success' : 'warning'} index={5} />
      <KPICard title="Utilização" value={`${capacityUtilization.toFixed(0)}%`} icon={<Factory className="h-4 w-4" />} accentColor={capacityUtilization > 90 ? 'danger' : 'success'} index={6} />
      <KPICard title="Custo Refugo" value={formatBRL(strategicIndicators.scrapCostEstimate)} icon={<AlertTriangle className="h-4 w-4" />} accentColor={strategicIndicators.scrapRate > 5 ? 'danger' : 'success'} index={7} />
    </div>
  );
}
