import { useConfirm } from '@/shared/components/confirmContext';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, HardHat, Plus, Trash2, CheckCircle2, FileText } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/base/dialog';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Textarea } from '@/ui/base/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Skeleton } from '@/ui/base/skeleton';
import { Badge } from '@/ui/base/badge';
import { Progress } from '@/ui/base/progress';
import { useConstructionProjects } from '@/hooks/useConstructionProjects';
import {
  useBudgetItems, useCreateBudgetItem, useDeleteBudgetItem,
  useMeasurements, useCreateMeasurement, useUpdateMeasurement,
  useDiary, useCreateDiaryEntry,
  type Measurement,
} from '@/hooks/useConstructionDetails';
import { toSafeNumber } from '@/lib/numericValidation';

const brl = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const MEAS_STATUS: Record<Measurement['status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Rascunho', variant: 'secondary' },
  approved: { label: 'Aprovada', variant: 'default' },
  invoiced: { label: 'Faturada', variant: 'default' },
  paid: { label: 'Paga', variant: 'default' },
  rejected: { label: 'Rejeitada', variant: 'destructive' },
};

function NewBudgetItemDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ description: '', unit: 'un', quantity: '', unit_cost: '', category: '' });
  const create = useCreateBudgetItem(projectId);
  const submit = async () => {
    if (!form.description.trim()) return;
    await create.mutateAsync({
      description: form.description.trim(),
      unit: form.unit || 'un',
      quantity: toSafeNumber(form.quantity, 0, { min: 0 }),
      unit_cost: toSafeNumber(form.unit_cost, 0, { min: 0 }),
      category: form.category || null,
    });
    setOpen(false);
    setForm({ description: '', unit: 'un', quantity: '', unit_cost: '', category: '' });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Item</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo item de orçamento</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div><Label>Descrição</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Un.</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
            <div><Label>Quantidade</Label><Input inputMode="decimal" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
            <div><Label>Custo unitário</Label><Input inputMode="decimal" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} /></div>
          </div>
          <div><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex: Fundação, Estrutura..." /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending}>Adicionar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewMeasurementDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ reference_month: today, executed_percent: '', amount: '', notes: '' });
  const create = useCreateMeasurement(projectId);
  const submit = async () => {
    await create.mutateAsync({
      reference_month: form.reference_month,
      executed_percent: toSafeNumber(form.executed_percent, 0, { min: 0, max: 100 }),
      amount: toSafeNumber(form.amount, 0, { min: 0 }),
      notes: form.notes || null,
      status: 'draft',
    });
    setOpen(false);
    setForm({ reference_month: today, executed_percent: '', amount: '', notes: '' });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Medição</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova medição</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div><Label>Mês de referência</Label><Input type="date" value={form.reference_month} onChange={(e) => setForm({ ...form, reference_month: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>% Executado</Label><Input inputMode="decimal" value={form.executed_percent} onChange={(e) => setForm({ ...form, executed_percent: e.target.value })} /></div>
            <div><Label>Valor (R$)</Label><Input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
          </div>
          <div><Label>Observações</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewDiaryDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ entry_date: today, weather: '', workforce_count: '', activities: '', incidents: '' });
  const create = useCreateDiaryEntry(projectId);
  const submit = async () => {
    await create.mutateAsync({
      entry_date: form.entry_date,
      weather: form.weather || null,
      workforce_count: toSafeNumber(form.workforce_count, 0, { min: 0 }),
      activities: form.activities || null,
      incidents: form.incidents || null,
    });
    setOpen(false);
    setForm({ entry_date: today, weather: '', workforce_count: '', activities: '', incidents: '' });
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="mr-2 h-4 w-4" />Apontamento</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Diário de obra</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Data</Label><Input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} /></div>
            <div><Label>Clima</Label><Input value={form.weather} onChange={(e) => setForm({ ...form, weather: e.target.value })} placeholder="Ensolarado" /></div>
            <div><Label>Efetivo</Label><Input inputMode="numeric" value={form.workforce_count} onChange={(e) => setForm({ ...form, workforce_count: e.target.value })} /></div>
          </div>
          <div><Label>Atividades</Label><Textarea rows={3} value={form.activities} onChange={(e) => setForm({ ...form, activities: e.target.value })} /></div>
          <div><Label>Ocorrências</Label><Textarea rows={2} value={form.incidents} onChange={(e) => setForm({ ...form, incidents: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending}>Registrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ConstructionProjectDetail() {
  const confirm = useConfirm();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = id ?? '';

  const { data: projects } = useConstructionProjects();
  const project = useMemo(() => projects?.find((p) => p.id === projectId), [projects, projectId]);

  const { data: items, isLoading: loadingItems } = useBudgetItems(projectId);
  const removeItem = useDeleteBudgetItem(projectId);
  const { data: measurements, isLoading: loadingMeas } = useMeasurements(projectId);
  const updateMeas = useUpdateMeasurement(projectId);
  const { data: diary, isLoading: loadingDiary } = useDiary(projectId);

  const totals = useMemo(() => {
    const orcado = items?.reduce((acc, it) => acc + Number(it.total ?? 0), 0) ?? 0;
    const medido = measurements?.reduce((acc, m) => acc + Number(m.amount ?? 0), 0) ?? 0;
    const avanco = measurements && measurements.length > 0
      ? measurements.reduce((acc, m) => Math.max(acc, Number(m.executed_percent ?? 0)), 0)
      : 0;
    return { orcado, medido, avanco };
  }, [items, measurements]);

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/construcao/obras')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <HardHat className="h-7 w-7 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{project?.name ?? 'Obra'}</h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{project?.code}</span>
            {project?.city ? ` • ${project.city}${project.state ? '/' + project.state : ''}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Orçamento detalhado</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{brl(totals.orcado)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Total medido</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{brl(totals.medido)}</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Avanço físico</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.avanco.toFixed(1)}%</div>
            <Progress value={totals.avanco} className="mt-2" />
          </CardContent></Card>
      </div>

      <Tabs defaultValue="budget">
        <TabsList>
          <TabsTrigger value="budget">Orçamento</TabsTrigger>
          <TabsTrigger value="measurements">Medições</TabsTrigger>
          <TabsTrigger value="diary"><FileText className="mr-1 h-4 w-4" />Diário</TabsTrigger>
        </TabsList>

        <TabsContent value="budget">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Itens de orçamento</CardTitle>
              <NewBudgetItemDialog projectId={projectId} />
            </CardHeader>
            <CardContent>
              {loadingItems ? <Skeleton className="h-24" /> : !items || items.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">Nenhum item cadastrado.</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Descrição</TableHead><TableHead>Categoria</TableHead><TableHead>Un.</TableHead>
                    <TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Custo un.</TableHead>
                    <TableHead className="text-right">Total</TableHead><TableHead className="w-12"></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="font-medium">{it.description}</TableCell>
                        <TableCell>{it.category ?? '—'}</TableCell>
                        <TableCell>{it.unit}</TableCell>
                        <TableCell className="text-right">{Number(it.quantity).toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="text-right">{brl(it.unit_cost)}</TableCell>
                        <TableCell className="text-right font-semibold">{brl(it.total)}</TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={async () => { if (await confirm({ title: 'Remover item?', description: 'Este item será removido da obra.', confirmLabel: 'Remover', variant: 'destructive' })) removeItem.mutate(it.id); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="measurements">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Medições</CardTitle>
              <NewMeasurementDialog projectId={projectId} />
            </CardHeader>
            <CardContent>
              {loadingMeas ? <Skeleton className="h-24" /> : !measurements || measurements.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">Nenhuma medição registrada.</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Referência</TableHead><TableHead className="text-right">% Exec.</TableHead>
                    <TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead>
                    <TableHead>Observações</TableHead><TableHead className="w-32">Aprovação</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {measurements.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell>{new Date(m.reference_month).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</TableCell>
                        <TableCell className="text-right">{Number(m.executed_percent).toFixed(1)}%</TableCell>
                        <TableCell className="text-right font-semibold">{brl(m.amount)}</TableCell>
                        <TableCell>
                          <Select
                            value={m.status}
                            onValueChange={(v) => updateMeas.mutate({ id: m.id, status: v as Measurement['status'] })}
                          >
                            <SelectTrigger className="h-7 w-32">
                              <SelectValue><Badge variant={MEAS_STATUS[m.status].variant}>{MEAS_STATUS[m.status].label}</Badge></SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(MEAS_STATUS) as Measurement['status'][]).map((s) => (
                                <SelectItem key={s} value={s}>{MEAS_STATUS[s].label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">{m.notes ?? '—'}</TableCell>
                        <TableCell>
                          {m.status === 'draft' ? (
                            <Button size="sm" variant="outline" onClick={() => updateMeas.mutate({ id: m.id, status: 'approved' })}>
                              <CheckCircle2 className="mr-1 h-3 w-3" />Aprovar
                            </Button>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diary">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Diário de obra</CardTitle>
              <NewDiaryDialog projectId={projectId} />
            </CardHeader>
            <CardContent>
              {loadingDiary ? <Skeleton className="h-24" /> : !diary || diary.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">Nenhum apontamento registrado.</div>
              ) : (
                <div className="space-y-3">
                  {diary.map((d) => (
                    <div key={d.id} className="rounded-lg border border-border/60 bg-card/40 p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{new Date(d.entry_date).toLocaleDateString('pt-BR')}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.weather ? `${d.weather} • ` : ''}{d.workforce_count ?? 0} pessoas
                        </div>
                      </div>
                      {d.activities && <p className="mt-2 text-sm">{d.activities}</p>}
                      {d.incidents && <p className="mt-1 text-sm text-destructive">⚠ {d.incidents}</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
