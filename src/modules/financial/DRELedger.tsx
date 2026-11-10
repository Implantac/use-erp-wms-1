import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { PageContainer } from '@/shared/components/PageContainer';
import { EmptyState } from '@/shared/components/EmptyState';
import { PageHeader } from '@/shared/components/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Skeleton } from '@/ui/base/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { ArrowDownRight, ArrowUpRight, TrendingUp, Wallet, Receipt } from 'lucide-react';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useDRESummary, useDREDetailed, calculateDRE, type DRESection } from '@/hooks/accounting/useDRE';
import { cn } from '@/lib/utils';

import { formatBRL } from '@/lib/formatters';
const SECTION_LABEL: Record<DRESection, string> = {
  revenue: 'Receita Operacional',
  other_revenue: 'Outras Receitas',
  cost: 'Custos (CMV / Insumos)',
  operating_expense: 'Despesas Operacionais',
  tax: 'Impostos sobre Vendas',
  financial_expense: 'Despesas Financeiras',
  financial_revenue: 'Receitas Financeiras',
  other_expense: 'Outras Despesas',
};

export default function DRELedgerPage() {
  const [period, setPeriod] = useState('current');

  const range = useMemo(() => {
    const now = new Date();
    switch (period) {
      case 'previous': {
        const m = subMonths(now, 1);
        return { from: startOfMonth(m), to: endOfMonth(m) };
      }
      case 'quarter': return { from: startOfMonth(subMonths(now, 2)), to: endOfMonth(now) };
      case 'semester': return { from: startOfMonth(subMonths(now, 5)), to: endOfMonth(now) };
      case 'year': return { from: startOfMonth(subMonths(now, 11)), to: endOfMonth(now) };
      default: return { from: startOfMonth(now), to: endOfMonth(now) };
    }
  }, [period]);

  const fromStr = format(range.from, 'yyyy-MM-dd');
  const toStr = format(range.to, 'yyyy-MM-dd');

  const { data: summary = [], isLoading: ls } = useDRESummary(fromStr, toStr);
  const { data: detailed = [], isLoading: ld } = useDREDetailed(fromStr, toStr);

  const dre = useMemo(() => calculateDRE(summary), [summary]);

  const groupedByCategory = useMemo(() => {
    const map = new Map<DRESection, typeof detailed>();
    detailed.forEach((row) => {
      const list = map.get(row.section as DRESection) ?? [];
      list.push(row);
      map.set(row.section as DRESection, list);
    });
    return map;
  }, [detailed]);

  const periodLabel = `${format(range.from, "dd 'de' MMM", { locale: ptBR })} a ${format(range.to, "dd 'de' MMM yyyy", { locale: ptBR })}`;

  const isLoading = ls || ld;
  const hasData = summary.length > 0;

  return (
    <PageContainer>
      <PageHeader title="DRE — Ledger Financeiro" description={`Demonstração do Resultado · ${periodLabel}`}>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Mês atual</SelectItem>
            <SelectItem value="previous">Mês anterior</SelectItem>
            <SelectItem value="quarter">Últimos 3 meses</SelectItem>
            <SelectItem value="semester">Últimos 6 meses</SelectItem>
            <SelectItem value="year">Últimos 12 meses</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <KPI title="Receita Bruta" value={dre.revenue} icon={<ArrowUpRight className="h-5 w-5" />} tone="success" />
          <KPI title="Lucro Bruto" value={dre.grossProfit} subtitle={`Margem ${dre.grossMargin.toFixed(1)}%`} icon={<TrendingUp className="h-5 w-5" />} tone="primary" />
          <KPI title="Despesas Operacionais" value={dre.operatingExpense} icon={<Receipt className="h-5 w-5" />} tone="warning" />
          <KPI title="Lucro Líquido" value={dre.netProfit} subtitle={`Margem ${dre.netMargin.toFixed(1)}%`} icon={<Wallet className="h-5 w-5" />} tone={dre.netProfit >= 0 ? 'success' : 'danger'} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Estrutura da DRE</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!hasData && !isLoading ? (
            <EmptyState
              icon={Receipt}
              title="Sem movimentações no período"
              description="Registre baixas em contas a pagar/receber ou lançamentos contábeis para popular a DRE deste período."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Linha</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <DRELine label="(=) Receita Bruta" value={dre.revenue} bold />
                <DRELine label="(−) Impostos sobre Vendas" value={-dre.tax} />
                <DRELine label="(−) Custos (CMV / Insumos)" value={-dre.cost} />
                <DRELine label="(=) Lucro Bruto" value={dre.grossProfit} bold highlight />
                <DRELine label="(−) Despesas Operacionais" value={-dre.operatingExpense} />
                <DRELine label="(=) Resultado Operacional" value={dre.operatingResult} bold />
                <DRELine label="(±) Resultado Financeiro" value={dre.financialResult} />
                <DRELine label="(=) Lucro Líquido" value={dre.netProfit} bold highlight />
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {hasData && (
        <Card>
          <CardHeader>
            <CardTitle>Detalhamento por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seção</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(groupedByCategory.entries()).map(([section, rows]) =>
                  rows.map((r, idx) => (
                    <TableRow key={`${section}-${r.category_id}-${idx}`}>
                      <TableCell className="text-muted-foreground text-sm">{SECTION_LABEL[section] ?? section}</TableCell>
                      <TableCell className="font-medium">{r.category_name}</TableCell>
                      <TableCell className={cn('text-right tabular-nums', Number(r.total) < 0 ? 'text-destructive' : 'text-foreground')}>
                        {formatBRL(Number(r.total))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}

function KPI({ title, value, subtitle, icon, tone }: { title: string; value: number; subtitle?: string; icon: React.ReactNode; tone: 'primary' | 'success' | 'warning' | 'danger' }) {
  const toneCls = {
    primary: 'text-primary bg-primary/10',
    success: 'text-success bg-success/10',
    warning: 'text-warning-text bg-warning/10',
    danger: 'text-destructive bg-destructive/10',
  }[tone];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tabular-nums">{formatBRL(value)}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={cn('rounded-lg p-2', toneCls)}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function DRELine({ label, value, bold, highlight }: { label: string; value: number; bold?: boolean; highlight?: boolean }) {
  return (
    <TableRow className={cn(highlight && 'bg-muted/40')}>
      <TableCell className={cn(bold && 'font-semibold')}>{label}</TableCell>
      <TableCell className={cn(
        'text-right tabular-nums',
        bold && 'font-semibold',
        value < 0 && 'text-destructive',
        value > 0 && highlight && 'text-success'
      )}>
        {formatBRL(value)}
      </TableCell>
    </TableRow>
  );
}
