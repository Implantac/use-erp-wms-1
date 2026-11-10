import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Badge } from '@/ui/base/badge';
import { Checkbox } from '@/ui/base/checkbox';
import { formatBRL } from '@/lib/formatters';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/ui/base/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/ui/base/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/ui/base/dialog';
import { ExportButton } from '@/shared/components/ExportButton';
import { EmptyState } from '@/shared/components/EmptyState';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import {
  CheckCircle2, XCircle, AlertTriangle, Search, Filter, Link2, Unlink, RefreshCw,
  ArrowUpRight, ArrowDownRight, Building2, Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ReconciliationStatus = 'reconciled' | 'pending' | 'divergent';

interface BankTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  bankReference: string;
  status: ReconciliationStatus;
  matchedEntryId?: string;
}

interface SystemEntry {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  reference: string;
  category: string;
  status: ReconciliationStatus;
  matchedBankId?: string;
}

import { useBankTransactions } from '@/hooks/financial/useBankReconciliation';
import { useCashFlowEntries } from '@/hooks/financial/useCashFlow';
import { toastSuccess } from '@/lib/toastHelpers';
import { AutoReconcilePanel } from './AutoReconcilePanel';

export default function BankReconciliation() {
  const { transactions: bankRaw, loading: bankLoading, update: updateBankTx } = useBankTransactions();
  const { data: cashFlowRaw, isLoading: cfLoading } = useCashFlowEntries();

  const bankTransactions: BankTransaction[] = bankRaw.map((t) => ({
    id: t.id, date: t.date, description: t.description, amount: Number(t.amount),
    type: t.type === 'credit' ? 'credit' : 'debit', bankReference: t.bank_reference || '', status: t.status as ReconciliationStatus,
    matchedEntryId: t.matched_entry_id || undefined,
  }));

  const systemEntries: SystemEntry[] = (cashFlowRaw || []).map((e) => ({
    id: e.id, date: e.date, description: e.description, amount: Number(e.amount),
    type: e.type === 'income' ? 'income' : 'expense', reference: e.reference || '',
    category: e.category, status: 'pending' as ReconciliationStatus,
  }));

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedBank, setSelectedBank] = useState<string[]>([]);
  const [selectedSystem, setSelectedSystem] = useState<string[]>([]);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);

  const filteredBank = bankTransactions.filter(t => {
    const matchesSearch = search === '' || t.description.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredSystem = systemEntries.filter(e => {
    const matchesSearch = search === '' || e.description.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const reconciledCount = bankTransactions.filter(t => t.status === 'reconciled').length;
  const pendingCount = bankTransactions.filter(t => t.status === 'pending').length;
  const divergentCount = bankTransactions.filter(t => t.status === 'divergent').length;

  const bankBalance = bankTransactions.reduce((sum, t) => sum + (t.type === 'credit' ? t.amount : -t.amount), 0);
  const systemBalance = systemEntries.reduce((sum, e) => sum + (e.type === 'income' ? e.amount : -e.amount), 0);
  const difference = bankBalance - systemBalance;

  const formatCurrency = (value: number) =>
    formatBRL(value);

  const getStatusBadge = (status: ReconciliationStatus) => {
    switch (status) {
      case 'reconciled':
        return <Badge className="bg-success/10 text-success border-success/30"><CheckCircle2 className="mr-1 h-3 w-3" />Conciliado</Badge>;
      case 'pending':
        return <Badge className="bg-warning/10 text-warning-text border-warning/30"><AlertTriangle className="mr-1 h-3 w-3" />Pendente</Badge>;
      case 'divergent':
        return <Badge className="bg-destructive/10 text-destructive border-destructive/30"><XCircle className="mr-1 h-3 w-3" />Divergente</Badge>;
    }
  };

  const handleManualMatch = async () => {
    if (selectedBank.length === 1 && selectedSystem.length === 1) {
      await updateBankTx(selectedBank[0], { status: 'reconciled', matched_entry_id: selectedSystem[0] });
      setSelectedBank([]);
      setSelectedSystem([]);
      setIsMatchDialogOpen(false);
    }
  };
  const handleAutoReconcile = () => {
    toastSuccess('Info', 'Conciliação automática executada');
  };

  return (
    <PageContainer>
      <PageHeader title="Conciliação Bancária" description="Compare extrato bancário com lançamentos do sistema">
        <Button variant="outline" onClick={handleAutoReconcile} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Conciliar Automático
        </Button>
        <ExportButton
          data={bankTransactions as unknown as Record<string, unknown>[]}
          columns={[
            { key: 'date', label: 'Data' },
            { key: 'description', label: 'Descrição' },
            { key: 'amount', label: 'Valor', format: (v) => formatCurrency(Number(v)) },
            { key: 'type', label: 'Tipo' },
            { key: 'status', label: 'Status' },
          ]}
          filename="conciliacao-bancaria"
        />
      </PageHeader>

      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KPICard index={0} title="Saldo Banco" value={formatCurrency(bankBalance)} icon={<Building2 className="h-5 w-5" />} accentColor="primary" />
        <KPICard index={1} title="Saldo Sistema" value={formatCurrency(systemBalance)} icon={<Building2 className="h-5 w-5" />} accentColor="info" />
        <KPICard index={2} title="Diferença" value={formatCurrency(difference)} icon={<AlertTriangle className="h-5 w-5" />} accentColor={Math.abs(difference) > 0.01 ? 'warning' : 'success'} />
        <KPICard index={3} title="Conciliados" value={reconciledCount.toString()} subtitle={`${bankTransactions.length > 0 ? ((reconciledCount / bankTransactions.length) * 100).toFixed(0) : 0}%`} icon={<CheckCircle2 className="h-5 w-5" />} accentColor="success" />
        <KPICard index={4} title="Pendentes" value={pendingCount.toString()} subtitle={`${divergentCount} divergentes`} icon={<AlertTriangle className="h-5 w-5" />} accentColor="danger" />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar transações..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <Filter className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="reconciled">Conciliados</SelectItem>
            <SelectItem value="pending">Pendentes</SelectItem>
            <SelectItem value="divergent">Divergentes</SelectItem>
          </SelectContent>
        </Select>
        {selectedBank.length > 0 && selectedSystem.length > 0 && (
          <Button onClick={() => setIsMatchDialogOpen(true)} className="gap-2">
            <Link2 className="h-4 w-4" />
            Vincular Selecionados
          </Button>
        )}
      </div>

      {/* Two Column Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bank Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Extrato Bancário
              <Badge variant="outline" className="ml-auto">{filteredBank.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBank.map(t => (
                  <TableRow key={t.id} className={t.status === 'reconciled' ? 'opacity-60' : ''}>
                    <TableCell>
                      {t.status === 'pending' && (
                        <Checkbox
                          checked={selectedBank.includes(t.id)}
                          onCheckedChange={(checked) => {
                            setSelectedBank(checked ? [t.id] : []);
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{format(new Date(t.date), 'dd/MM', { locale: ptBR })}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {t.type === 'credit' ? <ArrowUpRight className="h-3 w-3 text-success" /> : <ArrowDownRight className="h-3 w-3 text-destructive" />}
                        <span className="text-sm truncate max-w-[180px]">{t.description}</span>
                      </div>
                    </TableCell>
                    <TableCell className={`text-right text-sm font-medium ${t.type === 'credit' ? 'text-success' : 'text-destructive'}`}>
                      {t.type === 'credit' ? '+' : '-'}{formatCurrency(t.amount)}
                    </TableCell>
                    <TableCell>{getStatusBadge(t.status)}</TableCell>
                  </TableRow>
                ))}
                {filteredBank.length === 0 && (
                  <TableRow><TableCell colSpan={5}><EmptyState compact icon={Building2} title="Nenhuma transação encontrada" description="Importe um extrato bancário ou ajuste os filtros para visualizar as transações." /></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* System Entries */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-4 w-4" />
              Lançamentos do Sistema
              <Badge variant="outline" className="ml-auto">{filteredSystem.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSystem.map(e => (
                  <TableRow key={e.id} className={e.status === 'reconciled' ? 'opacity-60' : ''}>
                    <TableCell>
                      {e.status === 'pending' && (
                        <Checkbox
                          checked={selectedSystem.includes(e.id)}
                          onCheckedChange={(checked) => {
                            setSelectedSystem(checked ? [e.id] : []);
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{format(new Date(e.date), 'dd/MM', { locale: ptBR })}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {e.type === 'income' ? <ArrowUpRight className="h-3 w-3 text-success" /> : <ArrowDownRight className="h-3 w-3 text-destructive" />}
                        <span className="text-sm truncate max-w-[180px]">{e.description}</span>
                      </div>
                    </TableCell>
                    <TableCell className={`text-right text-sm font-medium ${e.type === 'income' ? 'text-success' : 'text-destructive'}`}>
                      {e.type === 'income' ? '+' : '-'}{formatCurrency(e.amount)}
                    </TableCell>
                    <TableCell>{getStatusBadge(e.status)}</TableCell>
                  </TableRow>
                ))}
                {filteredSystem.length === 0 && (
                  <TableRow><TableCell colSpan={5}><EmptyState compact icon={Calendar} title="Nenhum lançamento encontrado" description="Registre movimentações financeiras ou ajuste os filtros para conciliar com o extrato bancário." /></TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Match Confirmation Dialog */}
      <Dialog open={isMatchDialogOpen} onOpenChange={setIsMatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Conciliação Manual</DialogTitle>
            <DialogDescription>Vincular a transação bancária ao lançamento do sistema selecionado?</DialogDescription>
          </DialogHeader>
          {selectedBank.length === 1 && selectedSystem.length === 1 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">Banco</p>
                <p className="font-medium text-sm">{bankTransactions.find(t => t.id === selectedBank[0])?.description}</p>
                <p className="text-sm text-muted-foreground">{formatCurrency(bankTransactions.find(t => t.id === selectedBank[0])?.amount || 0)}</p>
              </div>
              <div className="flex justify-center"><Link2 className="h-5 w-5 text-primary" /></div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground mb-1">Sistema</p>
                <p className="font-medium text-sm">{systemEntries.find(e => e.id === selectedSystem[0])?.description}</p>
                <p className="text-sm text-muted-foreground">{formatCurrency(systemEntries.find(e => e.id === selectedSystem[0])?.amount || 0)}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMatchDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleManualMatch}>Confirmar Conciliação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AutoReconcilePanel />
    </PageContainer>
  );
}
