import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBRL } from '@/lib/formatters';
import { Clock, CheckCircle, XCircle, FileText } from 'lucide-react';
import { Badge } from '@/ui/base/badge';
import type { FiscalReport } from '@/types/fiscal';

export const statusConfig: Record<string, { color: string; icon: React.ComponentType<{ className?: string }> }> = {
  pending: { color: 'bg-warning/10 text-warning-text', icon: Clock },
  generated: { color: 'bg-success/10 text-success', icon: CheckCircle },
  error: { color: 'bg-destructive/10 text-destructive', icon: XCircle },
};

export const formatCurrency = (value: number) => formatBRL(value);

export const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  return format(new Date(dateString), 'dd/MM/yyyy HH:mm', { locale: ptBR });
};

export const renderStatusBadge = (status: string) => {
  const config = statusConfig[status];
  const Icon = config?.icon || FileText;
  const labels: Record<string, string> = { pending: 'Pendente', generated: 'Gerado', error: 'Erro' };
  return (
    <Badge className={`${config?.color} gap-1`}>
      <Icon className="h-3 w-3" />
      {labels[status] || status}
    </Badge>
  );
};

export const computeTaxAggregates = (reports: FiscalReport[]) => {
  const totalTaxes = reports.reduce((s, r) => s + r.totalICMS + r.totalIPI + r.totalPIS + r.totalCOFINS, 0);
  const taxBreakdown = {
    icms: reports.reduce((s, r) => s + r.totalICMS, 0),
    ipi: reports.reduce((s, r) => s + r.totalIPI, 0),
    pis: reports.reduce((s, r) => s + r.totalPIS, 0),
    cofins: reports.reduce((s, r) => s + r.totalCOFINS, 0),
  };
  const taxDistributionData = [
    { name: 'ICMS', value: taxBreakdown.icms, color: 'hsl(var(--primary))' },
    { name: 'COFINS', value: taxBreakdown.cofins, color: 'hsl(var(--info, 210 100% 50%))' },
    { name: 'IPI', value: taxBreakdown.ipi, color: 'hsl(var(--warning, 45 100% 50%))' },
    { name: 'PIS', value: taxBreakdown.pis, color: 'hsl(var(--success, 142 76% 36%))' },
  ].filter((d) => d.value > 0);
  const monthlyTaxData = reports
    .filter((r) => r.status === 'generated')
    .slice(0, 6)
    .reverse()
    .map((r) => ({
      name: r.period,
      icms: r.totalICMS,
      ipi: r.totalIPI,
      pis: r.totalPIS,
      cofins: r.totalCOFINS,
    }));
  return { totalTaxes, taxBreakdown, taxDistributionData, monthlyTaxData };
};
