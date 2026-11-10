import { useState } from 'react';
import { Plus, CheckCircle2, XCircle, Trash2, FileCheck } from 'lucide-react';
import { PageContainer } from '@/shared/components/PageContainer';
import { EmptyState } from '@/shared/components/EmptyState';
import { PageHeader } from '@/shared/components/PageHeader';
import { PageLoading } from '@/shared/components/PageLoading';
import { KPICard } from '@/shared/components/KPICard';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Card, CardContent } from '@/ui/base/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/ui/base/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Badge } from '@/ui/base/badge';
import { Tabs, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { useFinancialChecks, useCreateCheck, useCompensateCheck, useUpdateCheckStatus, useDeleteCheck } from '@/hooks/financial/useFinancialChecks';
import { useBankAccounts } from '@/hooks/financial/useBankAccounts';
import { CHECK_STATUS_LABELS } from '@/types/financial';
import { format } from 'date-fns';

import { formatBRL } from '@/lib/formatters';

const statusVariant: Record<string, string> = {
  received: 'bg-warning/10 text-warning-text border-warning/30',
  deposited: 'bg-info/10 text-info border-info/30',
  cleared: 'bg-success/10 text-success border-success/30',
  bounced: 'bg-destructive/10 text-destructive border-destructive/30',
  cancelled: 'bg-muted text-muted-foreground',
  issued: 'bg-primary/10 text-primary border-primary/30',
};

export default function Checks() {
  const [tab, setTab] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const { data: checks = [], isLoading } = useFinancialChecks({ type: tab === 'all' ? undefined : tab, status: statusFilter });
  const { data: bankAccounts = [] } = useBankAccounts();
  const create = useCreateCheck();
  const compensate = useCompensateCheck();
  const updateStatus = useUpdateCheckStatus();
  const remove = useDeleteCheck();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    check_type: 'received' as 'received' | 'issued',
    check_number: '', bank_name: '', issuer_name: '', issuer_document: '',
    amount: '', issue_date: new Date().toISOString().split('T')[0], due_date: '', notes: '',
  });

  const [compOpen, setCompOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [compBank, setCompBank] = useState('');

  const totals = {
    pending: checks.filter(c => ['received', 'deposited'].includes(c.status)).reduce((s, c) => s + Number(c.amount), 0),
    cleared: checks.filter(c => c.status === 'cleared').reduce((s, c) => s + Number(c.amount), 0),
    bounced: checks.filter(c => c.status === 'bounced').reduce((s, c) => s + Number(c.amount), 0),
    count: checks.length,
  };

  const handleCreate = () => {
    if (!form.check_number || !form.amount) return;
    create.mutate({
      check_type: form.check_type,
      check_number: form.check_number,
      bank_name: form.bank_name || null,
      issuer_name: form.issuer_name || null,
      issuer_document: form.issuer_document || null,
      amount: parseFloat(form.amount),
      issue_date: form.issue_date,
      due_date: form.due_date || null,
      notes: form.notes || null,
      status: form.check_type === 'received' ? 'received' : 'issued',
    }, {
      onSuccess: () => { setOpen(false); setForm({ ...form, check_number: '', amount: '', notes: '' }); },
    });
  };

  const handleCompensate = () => {
    if (!selected) return;
    compensate.mutate({ id: selected.id, bank_account_id: compBank || undefined }, {
      onSuccess: () => { setCompOpen(false); setSelected(null); setCompBank(''); },
    });
  };

  if (isLoading) return <PageLoading message="Carregando cheques..." />;

  return (
    <PageContainer>
      <PageHeader title="Controle de Cheques" description="Cheques recebidos e emitidos. Lançamento no caixa apenas após compensação.">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" />Novo Cheque</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Cadastrar Cheque</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select value={form.check_type} onValueChange={(v) => setForm({ ...form, check_type: v as 'received' | 'issued' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="received">Recebido (de terceiros)</SelectItem>
                    <SelectItem value="issued">Emitido (próprio)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label className="text-xs">Nº Cheque *</Label><Input value={form.check_number} onChange={e => setForm({ ...form, check_number: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label className="text-xs">Valor *</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
              </div>
              <div className="grid gap-1.5"><Label className="text-xs">Banco</Label><Input value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label className="text-xs">Emitente</Label><Input value={form.issuer_name} onChange={e => setForm({ ...form, issuer_name: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label className="text-xs">CPF/CNPJ</Label><Input value={form.issuer_document} onChange={e => setForm({ ...form, issuer_document: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label className="text-xs">Emissão</Label><Input type="date" value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label className="text-xs">Bom para</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={create.isPending}>Cadastrar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard title="Em Carteira" value={formatBRL(totals.pending)} icon={<FileCheck className="h-5 w-5" />} accentColor="warning" index={0} />
        <KPICard title="Compensados" value={formatBRL(totals.cleared)} icon={<CheckCircle2 className="h-5 w-5" />} accentColor="success" index={1} />
        <KPICard title="Devolvidos" value={formatBRL(totals.bounced)} icon={<XCircle className="h-5 w-5" />} accentColor="danger" index={2} />
        <KPICard title="Total Cheques" value={String(totals.count)} icon={<FileCheck className="h-5 w-5" />} accentColor="primary" index={3} />
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="all">Todos</TabsTrigger>
                <TabsTrigger value="received">Recebidos</TabsTrigger>
                <TabsTrigger value="issued">Emitidos</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                {Object.entries(CHECK_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Emitente</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Bom para</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {checks.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-sm">{c.check_number}</TableCell>
                  <TableCell><Badge variant="outline">{c.check_type === 'received' ? 'Recebido' : 'Emitido'}</Badge></TableCell>
                  <TableCell className="text-sm">{c.issuer_name || '-'}</TableCell>
                  <TableCell className="text-sm">{c.bank_name || '-'}</TableCell>
                  <TableCell className="text-sm">{c.due_date ? format(new Date(c.due_date), 'dd/MM/yyyy') : '-'}</TableCell>
                  <TableCell className="text-right font-medium">{formatBRL(Number(c.amount))}</TableCell>
                  <TableCell><Badge variant="outline" className={statusVariant[c.status]}>{CHECK_STATUS_LABELS[c.status]}</Badge></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {!['cleared', 'bounced', 'cancelled'].includes(c.status) && (
                        <>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-success" title="Compensar" onClick={() => { setSelected(c); setCompBank(c.bank_account_id ?? ''); setCompOpen(true); }}>
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Devolver" onClick={() => updateStatus.mutate({ id: c.id, status: 'bounced' })}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove.mutate(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {checks.length === 0 && (
                <TableRow><TableCell colSpan={8} className="p-0">
                  <EmptyState icon={FileCheck} title="Nenhum cheque cadastrado" description="Registre cheques emitidos ou recebidos para controlar compensações, devoluções e conciliação bancária." />
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={compOpen} onOpenChange={setCompOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Compensar Cheque</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 py-2">
              <div className="rounded-md bg-muted p-3">
                <p className="text-sm">Cheque <strong>{selected.check_number}</strong></p>
                <p className="text-2xl font-bold text-primary">{formatBRL(Number(selected.amount))}</p>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Conta bancária de depósito *</Label>
                <Select value={compBank} onValueChange={setCompBank}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{bankAccounts.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Ao confirmar, será gerado lançamento no caixa e baixa na conta vinculada (se houver).</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompOpen(false)}>Cancelar</Button>
            <Button onClick={handleCompensate} disabled={compensate.isPending || !compBank}>Compensar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
