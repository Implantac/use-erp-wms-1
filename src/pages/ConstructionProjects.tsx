import { useConfirm } from '@/shared/components/confirmContext';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, HardHat, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/base/dialog';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Badge } from '@/ui/base/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Skeleton } from '@/ui/base/skeleton';
import {
  useConstructionProjects,
  useCreateConstructionProject,
  useDeleteConstructionProject,
  type ConstructionProject,
} from '@/hooks/useConstructionProjects';
import { toSafeNumber } from '@/lib/numericValidation';
import { EmptyState } from '@/shared/components/EmptyState';

const STATUS_LABELS: Record<ConstructionProject['status'], string> = {
  planning: 'Planejamento',
  in_progress: 'Em execução',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const STATUS_VARIANT: Record<ConstructionProject['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  planning: 'secondary',
  in_progress: 'default',
  paused: 'outline',
  completed: 'default',
  cancelled: 'destructive',
};

function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    city: '',
    state: '',
    budget_total: '',
    status: 'planning' as ConstructionProject['status'],
  });
  const create = useCreateConstructionProject();

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) return;
    await create.mutateAsync({
      code: form.code.trim(),
      name: form.name.trim(),
      city: form.city || null,
      state: form.state || null,
      budget_total: toSafeNumber(form.budget_total, 0, { min: 0 }),
      status: form.status,
    });
    setOpen(false);
    setForm({ code: '', name: '', city: '', state: '', budget_total: '', status: 'planning' });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" />Nova obra</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova obra</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Código</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="OBR-001" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ConstructionProject['status'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Cidade</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <Label>UF</Label>
              <Input maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <div>
            <Label>Orçamento total (R$)</Label>
            <Input
              inputMode="decimal"
              value={form.budget_total}
              onChange={(e) => setForm({ ...form, budget_total: e.target.value })}
              placeholder="0,00"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ConstructionProjects() {
  const confirm = useConfirm();
  const { data: projects, isLoading } = useConstructionProjects();
  const remove = useDeleteConstructionProject();

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <HardHat className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Obras</h1>
            <p className="text-sm text-muted-foreground">Vertical Construção • Projetos, orçamentos e medições</p>
          </div>
        </div>
        <NewProjectDialog />
      </div>

      <Card>
        <CardHeader><CardTitle>Carteira de obras</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" />
            </div>
          ) : !projects || projects.length === 0 ? (
            <EmptyState icon={HardHat} title="Nenhuma obra cadastrada" description="Cadastre obras para acompanhar avanço físico, financeiro e cronograma." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead className="text-right">Orçamento</TableHead>
                  <TableHead className="text-right">Avanço</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/30">
                    <TableCell className="font-mono">
                      <Link to={`/construcao/obras/${p.id}`} className="hover:underline">{p.code}</Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/construcao/obras/${p.id}`} className="hover:underline">{p.name}</Link>
                    </TableCell>
                    <TableCell>{[p.city, p.state].filter(Boolean).join(' / ') || '—'}</TableCell>
                    <TableCell className="text-right">
                      {Number(p.budget_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </TableCell>
                    <TableCell className="text-right">{Number(p.progress_percent).toFixed(1)}%</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[p.status]}>{STATUS_LABELS[p.status]}</Badge>
                    </TableCell>
                    <TableCell className="flex items-center gap-1">
                      <Link to={`/construcao/obras/${p.id}`}>
                        <Button size="icon" variant="ghost"><ChevronRight className="h-4 w-4" /></Button>
                      </Link>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          if (await confirm({ title: 'Remover obra?', description: `A obra ${p.code} será removida.`, confirmLabel: 'Remover', variant: 'destructive' })) remove.mutate(p.id);
                        }}
                      >
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
    </div>
  );
}
