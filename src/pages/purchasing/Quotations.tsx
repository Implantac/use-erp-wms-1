import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase as typedClient } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { EmptyState } from '@/shared/components/EmptyState';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Textarea } from '@/ui/base/textarea';
import { Badge } from '@/ui/base/badge';
import { Card, CardContent } from '@/ui/base/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { FileSearch, Plus, Search, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { formatBRL, formatDate } from '@/lib/formatters';

const supabase = typedClient as unknown as SupabaseClient;

type Status = 'draft' | 'sent' | 'answered' | 'approved' | 'rejected' | 'cancelled';
const STATUS: Record<Status, { label: string; variant: 'secondary' | 'default' | 'outline' | 'destructive' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  sent: { label: 'Enviada', variant: 'outline' },
  answered: { label: 'Respondida', variant: 'outline' },
  approved: { label: 'Aprovada', variant: 'default' },
  rejected: { label: 'Recusada', variant: 'destructive' },
  cancelled: { label: 'Cancelada', variant: 'secondary' },
};
const NEXT: Record<Status, Status[]> = {
  draft: ['sent', 'cancelled'], sent: ['answered', 'cancelled'], answered: ['approved', 'rejected'],
  approved: [], rejected: [], cancelled: [],
};
const EDITABLE: Status[] = ['draft', 'sent', 'answered'];

interface Item { id?: string; product_id: string | null; description: string; quantity: number; unit_price: number | null }
interface Quotation {
  id: string; number: string; supplier_id: string | null; status: Status; due_date: string | null; notes: string | null; created_at: string;
  supplier?: { name: string } | null; items?: Item[];
}

const total = (items: Item[] = []) => items.reduce((s, i) => s + i.quantity * (i.unit_price ?? 0), 0);

export default function QuotationsPage() {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [editing, setEditing] = useState<Quotation | null>(null);
  const [open, setOpen] = useState(false);

  const list = useQuery({
    queryKey: ['purchase_quotations', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('purchase_quotations')
        .select('id, number, supplier_id, status, due_date, notes, created_at, supplier:suppliers(name), items:purchase_quotation_items(id, product_id, description, quantity, unit_price)')
        .eq('company_id', companyId!).order('created_at', { ascending: false }).limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as Quotation[];
    },
  });

  const filtered = useMemo(() => (list.data ?? []).filter((q) =>
    (statusFilter === 'all' || q.status === statusFilter) &&
    `${q.number} ${q.supplier?.name ?? ''}`.toLowerCase().includes(search.toLowerCase())), [list.data, search, statusFilter]);

  const changeStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from('purchase_quotations').update({ status }).eq('id', id).eq('company_id', companyId!);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase_quotations'] }); toast.success('Situação atualizada'); },
    onError: () => toast.error('Não foi possível atualizar a situação.'),
  });

  const toOrder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('convert_quotation_to_purchase_order', { _quotation_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase_quotations'] }); qc.invalidateQueries({ queryKey: ['purchase_orders'] }); toast.success('Pedido de compra gerado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error, count } = await supabase.from('purchase_quotations').delete({ count: 'exact' }).eq('id', id).eq('company_id', companyId!);
      if (error) throw error;
      if (!count) throw new Error('Somente gestores excluem cotações em rascunho ou canceladas.');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase_quotations'] }); toast.success('Cotação excluída'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader
        title="Cotações de compra"
        description="Peça preços a fornecedores, compare e aprove antes de gerar o pedido."
        actions={<Button onClick={() => { setEditing(null); setOpen(true); }} disabled={!companyId}><Plus className="h-4 w-4" />Nova cotação</Button>}
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-9" placeholder="Buscar por número ou fornecedor" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Buscar cotações" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | Status)}>
              <SelectTrigger className="sm:w-48" aria-label="Filtrar por situação"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as situações</SelectItem>
                {(Object.keys(STATUS) as Status[]).map((s) => <SelectItem key={s} value={s}>{STATUS[s].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => list.refetch()} aria-label="Atualizar"><RefreshCw className={`h-4 w-4 ${list.isFetching ? 'animate-spin' : ''}`} /></Button>
          </div>

          {list.isError ? (
            <p className="py-8 text-center text-sm text-destructive">Não foi possível carregar as cotações. Tente atualizar.</p>
          ) : list.isLoading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={FileSearch} title="Nenhuma cotação" description="Crie uma cotação para pedir preços aos fornecedores." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead><TableHead>Fornecedor</TableHead><TableHead>Prazo</TableHead>
                    <TableHead className="text-right">Itens</TableHead><TableHead className="text-right">Total cotado</TableHead>
                    <TableHead>Situação</TableHead><TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell className="font-medium">
                        <button className="hover:underline" onClick={() => { setEditing(q); setOpen(true); }}>{q.number}</button>
                      </TableCell>
                      <TableCell>{q.supplier?.name ?? <span className="text-muted-foreground">Não definido</span>}</TableCell>
                      <TableCell>{q.due_date ? formatDate(q.due_date) : '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{q.items?.length ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatBRL(total(q.items))}</TableCell>
                      <TableCell><Badge variant={STATUS[q.status].variant}>{STATUS[q.status].label}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {NEXT[q.status].map((s) => (
                            <Button key={s} size="sm" variant={s === 'cancelled' || s === 'rejected' ? 'ghost' : 'outline'} disabled={changeStatus.isPending}
                              onClick={() => changeStatus.mutate({ id: q.id, status: s })}>
                              {s === 'sent' ? 'Enviar' : s === 'answered' ? 'Marcar respondida' : s === 'approved' ? 'Aprovar' : s === 'rejected' ? 'Recusar' : 'Cancelar'}
                            </Button>
                          ))}
                          {q.status === 'approved' && (q.purchase_order_id
                            ? <Badge variant="outline">Pedido gerado</Badge>
                            : <Button size="sm" disabled={toOrder.isPending} onClick={() => toOrder.mutate(q.id)}>Gerar pedido</Button>)}
                          {(q.status === 'draft' || q.status === 'cancelled') && (
                            <Button size="icon" variant="ghost" aria-label={`Excluir ${q.number}`} onClick={() => { if (confirm(`Excluir a cotação ${q.number}?`)) remove.mutate(q.id); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {open && companyId && <QuotationDialog companyId={companyId} quotation={editing} onClose={() => setOpen(false)} />}
    </PageContainer>
  );
}

function QuotationDialog({ companyId, quotation, onClose }: { companyId: string; quotation: Quotation | null; onClose: () => void }) {
  const qc = useQueryClient();
  const readOnly = !!quotation && !EDITABLE.includes(quotation.status);
  const [supplierId, setSupplierId] = useState(quotation?.supplier_id ?? '');
  const [dueDate, setDueDate] = useState(quotation?.due_date ?? '');
  const [notes, setNotes] = useState(quotation?.notes ?? '');
  const [items, setItems] = useState<Item[]>(quotation?.items?.length ? quotation.items : [{ product_id: null, description: '', quantity: 1, unit_price: null }]);

  const suppliers = useQuery({
    queryKey: ['pq-suppliers', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('id, name').eq('company_id', companyId).order('name').limit(500);
      if (error) throw error; return (data ?? []) as { id: string; name: string }[];
    },
  });
  const products = useQuery({
    queryKey: ['pq-products', companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, code, name').eq('company_id', companyId).order('name').limit(500);
      if (error) throw error; return (data ?? []) as { id: string; code: string; name: string }[];
    },
  });

  const setItem = (i: number, patch: Partial<Item>) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const save = useMutation({
    mutationFn: async () => {
      const clean = items.filter((i) => i.description.trim());
      if (clean.length === 0) throw new Error('Inclua pelo menos um item.');
      if (clean.some((i) => !(i.quantity > 0) || (i.unit_price !== null && i.unit_price < 0))) throw new Error('Quantidades devem ser maiores que zero e preços não podem ser negativos.');
      let id = quotation?.id;
      const header = { supplier_id: supplierId || null, due_date: dueDate || null, notes: notes.trim() || null };
      if (id) {
        const { error } = await supabase.from('purchase_quotations').update(header).eq('id', id).eq('company_id', companyId);
        if (error) throw error;
        const { error: delErr } = await supabase.from('purchase_quotation_items').delete().eq('quotation_id', id).eq('company_id', companyId);
        if (delErr) throw delErr;
      } else {
        const number = `COT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
        const { data, error } = await supabase.from('purchase_quotations').insert({ ...header, company_id: companyId, number }).select('id').single();
        if (error) throw error;
        id = (data as { id: string }).id;
      }
      const { error: itemsErr } = await supabase.from('purchase_quotation_items').insert(clean.map((i) => ({
        quotation_id: id, company_id: companyId, product_id: i.product_id, description: i.description.trim(), quantity: i.quantity, unit_price: i.unit_price,
      })));
      if (itemsErr) throw itemsErr;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase_quotations'] }); toast.success(quotation ? 'Cotação atualizada' : 'Cotação criada'); onClose(); },
    onError: (e: Error) => toast.error(e.message || 'Não foi possível salvar a cotação.'),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{quotation ? `Cotação ${quotation.number}` : 'Nova cotação'}</DialogTitle></DialogHeader>
        {readOnly && <p className="rounded-md border border-border bg-muted/40 p-2 text-sm text-muted-foreground">Esta cotação está {STATUS[quotation!.status].label.toLowerCase()} e não pode mais ser alterada.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={supplierId} onValueChange={setSupplierId} disabled={readOnly}>
            <SelectTrigger aria-label="Fornecedor"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
            <SelectContent>{(suppliers.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" aria-label="Prazo de resposta" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={readOnly} />
        </div>
        <div className="space-y-2">
          <div className="hidden grid-cols-[1.2fr_1.5fr_90px_120px_36px] gap-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>Produto</span><span>Descrição</span><span>Qtd</span><span>Preço unit.</span><span />
          </div>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.2fr_1.5fr_90px_120px_36px]">
              <Select value={it.product_id ?? ''} disabled={readOnly} onValueChange={(v) => {
                const p = products.data?.find((x) => x.id === v); setItem(i, { product_id: v, description: it.description || p?.name || '' });
              }}>
                <SelectTrigger aria-label="Produto"><SelectValue placeholder="Produto (opcional)" /></SelectTrigger>
                <SelectContent>{(products.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input aria-label="Descrição" placeholder="Descrição" value={it.description} disabled={readOnly} onChange={(e) => setItem(i, { description: e.target.value })} />
              <Input aria-label="Quantidade" inputMode="decimal" value={it.quantity} disabled={readOnly} onChange={(e) => setItem(i, { quantity: Number(e.target.value.replace(',', '.')) || 0 })} />
              <Input aria-label="Preço unitário" inputMode="decimal" placeholder="A cotar" value={it.unit_price ?? ''} disabled={readOnly}
                onChange={(e) => setItem(i, { unit_price: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) })} />
              <Button variant="ghost" size="icon" aria-label="Remover item" disabled={readOnly || items.length === 1} onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {!readOnly && <Button variant="outline" size="sm" onClick={() => setItems((p) => [...p, { product_id: null, description: '', quantity: 1, unit_price: null }])}><Plus className="h-4 w-4" />Adicionar item</Button>}
        </div>
        <Textarea aria-label="Observações" placeholder="Observações para o fornecedor" value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} />
        <p className="text-right text-sm text-muted-foreground">Total cotado: <span className="font-semibold text-foreground tabular-nums">{formatBRL(total(items))}</span></p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          {!readOnly && <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Salvar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
