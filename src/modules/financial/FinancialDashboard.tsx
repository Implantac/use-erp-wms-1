import { useEnterpriseStore } from '@/core/stores/useEnterpriseStore';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Landmark, TrendingDown, TrendingUp } from 'lucide-react';
import { useBankAccounts } from '@/hooks/financial/useBankAccounts';
import { useAccountsPayable } from '@/hooks/financial/useAccountsPayable';
import { useAccountsReceivable } from '@/hooks/financial/useAccountsReceivable';
import { LIST_LIMIT } from '@/lib/queryLimits';
import { formatBRL } from '@/lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';

const open = (status: string) => status !== 'paid' && status !== 'cancelled';

export default function FinancialDashboard() {
  const companyId = useEnterpriseStore(s => s.activeCompanyId);
  const banks = useBankAccounts();
  const receivables = useAccountsReceivable();
  const payables = useAccountsPayable();
  const loading = !companyId || banks.isLoading || receivables.isLoading || payables.isLoading;
  const failed = banks.isError || receivables.isError || payables.isError;
  const limited = (banks.data?.length ?? 0) >= 100 ||
    (receivables.data?.length ?? 0) >= LIST_LIMIT || (payables.data?.length ?? 0) >= LIST_LIMIT;

  const balance = (banks.data ?? []).filter(a => a.active).reduce((sum, a) => sum + Number(a.balance ?? 0), 0);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const due = (date: string) => {
    const value = new Date(`${date.slice(0, 10)}T12:00:00`);
    return value >= start && value < end;
  };
  const receivableTotal = (receivables.data ?? []).filter(r => open(r.status) && due(r.due_date))
    .reduce((sum, r) => sum + Number(r.open_amount ?? r.amount), 0);
  const payableTotal = (payables.data ?? []).filter(p => open(p.status) && due(p.due_date))
    .reduce((sum, p) => sum + Number(p.open_amount ?? p.amount), 0);

  const cards = [
    { title: 'Saldo das contas bancárias ativas', value: balance, icon: Landmark, path: '/financeiro/tesouraria' },
    { title: 'A receber nos próximos 7 dias', value: receivableTotal, icon: TrendingUp, path: '/financeiro/receber' },
    { title: 'A pagar nos próximos 7 dias', value: payableTotal, icon: TrendingDown, path: '/financeiro/pagar' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Controladoria & Finanças</h1>
        <p className="text-muted-foreground">Resumo dos registros financeiros acessíveis à empresa atual.</p>
      </div>

      {loading && <p role="status">{companyId ? 'Carregando dados financeiros...' : 'Selecione uma empresa para consultar os dados financeiros.'}</p>}
      {failed && (
        <div role="alert" className="rounded-md border border-destructive p-4 text-destructive">
          Não foi possível consultar todos os dados financeiros. Nenhum total parcial será exibido como consolidado.
          <Button variant="outline" className="ml-3" onClick={() => {
            void banks.refetch(); void receivables.refetch(); void payables.refetch();
          }}>Tentar novamente</Button>
        </div>
      )}
      {!loading && !failed && limited && (
        <div role="status" className="flex items-start gap-2 rounded-md border border-warning p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          As consultas atingiram o limite de registros. Este resumo pode estar incompleto; use relatórios paginados para totais consolidados.
        </div>
      )}
      {!loading && !failed && (
        <div className="grid gap-4 md:grid-cols-3">
          {cards.map(({ title, value, icon: Icon, path }) => (
            <Card key={title}>
              <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4" />{title}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-2xl font-bold">{formatBRL(value)}</p>
                <Button asChild variant="link" className="p-0"><Link to={path}>Ver lançamentos <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button asChild variant="outline"><Link to="/financeiro/fluxo">Fluxo de caixa</Link></Button>
        <Button asChild variant="outline"><Link to="/financeiro/dre">DRE</Link></Button>
        <Button asChild variant="outline"><Link to="/financeiro/conciliacao">Conciliação bancária</Link></Button>
      </div>
      <p className="text-xs text-muted-foreground">Saldo bancário reflete os saldos cadastrados; não representa reconciliação bancária confirmada. Valores a vencer não incluem títulos já pagos ou cancelados.</p>
    </div>
  );
}
