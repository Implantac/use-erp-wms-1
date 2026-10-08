import { useState } from 'react';
import { Plus, Copy, CheckCircle2, XCircle, Receipt } from 'lucide-react';
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
import { useFinancialBoletos, useCreateBoleto, useCancelBoleto, useMarkBoletoPaid } from '@/hooks/financial/useFinancialBoletos';
import { useAccountsReceivable } from '@/hooks/financial/useAccountsReceivable';
import { useBankAccounts } from '@/hooks/financial/useBankAccounts';
import { BOLETO_STATUS_LABELS } from '@/types/financial';
import { format } from 'date-fns';

import { formatBRL } from '@/lib/formatters';
import { toastSuccess } from '@/lib/toastHelpers';

const statusVariant: Record<string, string> = {
  pending: 'bg-warning/10 text-warning border-warning/30',
  registered: 'bg-info/10 text-info border-info/30',
  paid: 'bg-success/10 text-success border-success/30',
  cancelled: 'bg-muted text-muted-foreground',
  expired: 'bg-destructive/10 text-destructive border-destructive/30',
};

export default function Boletos() {
  const [statusFilter, setStatusFilter] = useState('all');
  const { data: boletos = [], isLoading } = useFinancialBoletos({ status: statusFilter });
  const { data: receivables = [] } = useAccountsReceivable();
  const { data: bankAccounts = [] } = useBankAccounts();
  const create = useCreateBoleto();
  const cancel = useCancelBoleto();
  const markPaid = useMarkBoletoPaid();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ receivable_id: '', amount: '', due_date: '', client_name: '' });

  const totals = {
    open: boletos.filter(b => ['pending', 'registered'].includes(b.status)).reduce((s, b) => s + Number(b.amount), 0),
    paid: boletos.filter(b => b.status === 'paid').reduce((s, b) => s + Number(b.amount), 0),
    count: boletos.length,
  };

  const handleCreate = () => {
    const recv = receivables.find(r => r.id === form.receivable_id);
    create.mutate({
      receivable_id: form.receivable_id || undefined,
      client_id: recv?.client_id ?? undefined,
      client_name: recv?.client_name ?? form.client_name,
      amount: parseFloat(form.amount || (recv ? String(recv.open_amount ?? recv.amount) : '0')),
      due_date: form.due_date || recv?.due_date || new Date().toISOString().split('T')[0],
    }, { onSuccess: () => { setOpen(false); setForm({ receivable_id: '', amount: '', due_date: '', client_name: '' }); } });
  };

  const copy = (text: string | null) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toastSuccess('Linha digitável copiada');
  };

  if (isLoading) return <PageLoading message="Carregando boletos..." />;

  return (
    <PageContainer>
      <PageHeader title="Boletos" description="Consulta de boletos existentes. Emissão indisponível até a implementação de integração bancária.">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button disabled title="Emissão indisponível: integração bancária ainda não implementada" className="gap-2"><Plus className="h-4 w-4" />Novo Boleto indisponível</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Gerar Boleto</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid gap-1.5">
                <Label className="text-xs">Conta a Receber (opcional)</Label>
                <Select value={form.receivable_id} onValueChange={(v) => {
                  const r = receivables.find(x => x.id === v);
                  setForm({ ...form, receivable_id: v, amount: r ? String(r.open_amount ?? r.amount) : form.amount, due_date: r?.due_date || form.due_date, client_name: r?.client_name || '' });
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione (ou gere avulso)" /></SelectTrigger>
                  <SelectContent>
                    {receivables.filter(r => r.status !== 'paid').slice(0, 100).map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.client_name} — {formatBRL(Number(r.open_amount ?? r.amount))}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!form.receivable_id && (
                <div className="grid gap-1.5"><Label className="text-xs">Cliente</Label><Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} /></div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5"><Label className="text-xs">Valor *</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label className="text-xs">Vencimento *</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
              </div>
              <p className="text-xs text-muted-foreground">A emissão requer um provedor bancário configurado. Sem resposta válida do provedor, nenhum boleto será criado.</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={create.isPending || !form.amount || !form.due_date}>Gerar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <KPICard title="Em Aberto" value={formatBRL(totals.open)} icon={<Receipt className="h-5 w-5" />} accentColor="warning" index={0} />
        <KPICard title="Pagos" value={formatBRL(totals.paid)} icon={<CheckCircle2 className="h-5 w-5" />} accentColor="success" index={1} />
        <KPICard title="Total" value={String(totals.count)} icon={<Receipt className="h-5 w-5" />} accentColor="primary" index={2} />
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {Object.entries(BOLETO_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nosso Nº</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Linha Digitável</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boletos.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.our_number || '-'}</TableCell>
                  <TableCell className="text-sm">{b.client_name || '-'}</TableCell>
                  <TableCell className="text-sm">{format(new Date(b.due_date), 'dd/MM/yyyy')}</TableCell>
                  <TableCell className="text-right font-medium">{formatBRL(Number(b.amount))}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[200px] truncate" title={b.digitable_line || ''}>{b.digitable_line || '-'}</TableCell>
                  <TableCell><Badge variant="outline" className={statusVariant[b.status]}>{BOLETO_STATUS_LABELS[b.status]}</Badge></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="Copiar linha" onClick={() => copy(b.digitable_line)}><Copy className="h-4 w-4" /></Button>
                      {!['paid', 'cancelled'].includes(b.status) && (
                        <>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-success" title="Marcar como pago" onClick={() => markPaid.mutate({ id: b.id })}><CheckCircle2 className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Cancelar" onClick={() => cancel.mutate(b.id)}><XCircle className="h-4 w-4" /></Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {boletos.length === 0 && (
                <TableRow><TableCell colSpan={7} className="p-0">
                  <EmptyState icon={Receipt} title="Nenhum boleto gerado" description="Emita boletos a partir de contas a receber para cobrar clientes de forma automática." />
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
