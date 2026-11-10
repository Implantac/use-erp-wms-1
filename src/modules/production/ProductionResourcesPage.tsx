import { useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { EmptyState } from '@/shared/components/EmptyState';
import { PageHeader } from '@/shared/components/PageHeader';
import { useProductionResources, ProductionResource } from '@/hooks/production/useProductionResources';
import { useProductionSectors } from '@/hooks/production/useProductionSectors';
import { useProductionLines } from '@/hooks/production/useProductionLines';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/ui/base/dialog';
import { Badge } from '@/ui/base/badge';
import { Card, CardContent } from '@/ui/base/card';
import { Tabs, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Plus, Pencil, Trash2, Search, Wrench, Cog, User, Monitor, AlertTriangle, DollarSign } from 'lucide-react';
import { Skeleton } from '@/ui/base/skeleton';
import { Textarea } from '@/ui/base/textarea';
import { Switch } from '@/ui/base/switch';
import { formatNumber } from '@/lib/formatters';
import { toSafeNumber } from '@/lib/numericValidation';

const typeLabels: Record<string, string> = { machine: 'Máquina', operator: 'Operador', workstation: 'Posto de Trabalho' };
const typeIcons: Record<string, any> = { machine: Cog, operator: User, workstation: Monitor };
const statusLabels: Record<string, string> = { available: 'Disponível', running: 'Em Uso', maintenance: 'Manutenção', inactive: 'Inativo' };
const statusStyles: Record<string, string> = {
  available: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  running: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  maintenance: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  inactive: 'bg-red-500/10 text-red-500 border-red-500/20',
};

const emptyResource: Partial<ProductionResource> = { code: '', name: '', resource_type: 'machine', sector_id: null, line_id: null, capacity_per_hour: 0, cost_per_hour: 0, status: 'available', is_active: true, notes: '' };

const kpiConfig = [
  { label: 'Total Recursos', icon: Wrench, color: 'text-primary', ring: 'ring-primary/20' },
  { label: 'Máquinas', icon: Cog, color: 'text-info', ring: 'ring-info/20' },
  { label: 'Cap. Total/h', icon: Monitor, color: 'text-success', ring: 'ring-success/20' },
  { label: 'Custo/h Total', icon: DollarSign, color: 'text-warning-text', ring: 'ring-warning/20' },
];

export default function ProductionResourcesPage() {
  const { resources, loading, create, update, remove } = useProductionResources();
  const { activeSectors } = useProductionSectors();
  const { lines } = useProductionLines();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductionResource | null>(null);
  const [form, setForm] = useState<Partial<ProductionResource>>(emptyResource);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = resources.filter(r => {
    const matchSearch = r.name.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || r.resource_type === typeFilter;
    return matchSearch && matchType;
  });

  const kpiValues = [
    resources.length,
    resources.filter(r => r.resource_type === 'machine').length,
    resources.reduce((s, r) => s + r.capacity_per_hour, formatNumber(0)),
    `R$ ${resources.reduce((s, r) => s + r.cost_per_hour, 0).toFixed(0)}`,
  ];

  const openNew = () => { setEditing(null); setForm(emptyResource); setOpen(true); };
  const openEdit = (r: ProductionResource) => { setEditing(r); setForm(r); setOpen(true); };
  const handleSave = async () => { const ok = editing ? await update(editing.id, form) : await create(form); if (ok) setOpen(false); };
  const handleDelete = async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } };

  return (
    <PageContainer>
      <PageHeader title="Recursos Produtivos" description="Máquinas, operadores e postos de trabalho" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {kpiConfig.map((kpi, i) => (
          <Card key={i} className="border-border/40 bg-card/80 backdrop-blur-sm hover-lift" style={{ animationDelay: `${i * 80}ms` }}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`h-11 w-11 rounded-xl bg-muted/60 flex items-center justify-center ${kpi.color} ring-2 ${kpi.ring}`}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">{kpiValues[i]}</p>
                <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={typeFilter} onValueChange={setTypeFilter} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="machine" className="gap-1"><Cog className="h-3.5 w-3.5" />Máquinas</TabsTrigger>
          <TabsTrigger value="operator" className="gap-1"><User className="h-3.5 w-3.5" />Operadores</TabsTrigger>
          <TabsTrigger value="workstation" className="gap-1"><Monitor className="h-3.5 w-3.5" />Postos</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar recurso por nome ou código..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={openNew} className="shrink-0"><Plus className="h-4 w-4 mr-2" />Novo Recurso</Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : (
        <div className="rounded-xl border border-border/40 overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="font-semibold">Código</TableHead>
                <TableHead className="font-semibold">Nome</TableHead>
                <TableHead className="font-semibold hidden sm:table-cell">Tipo</TableHead>
                <TableHead className="font-semibold hidden md:table-cell">Setor</TableHead>
                <TableHead className="font-semibold hidden lg:table-cell">Linha</TableHead>
                <TableHead className="font-semibold hidden sm:table-cell">Cap./h</TableHead>
                <TableHead className="font-semibold hidden md:table-cell">R$/h</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="w-[100px] font-semibold text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="p-0">
                    <EmptyState
                      icon={Wrench}
                      title={search ? 'Nenhum recurso encontrado' : 'Nenhum recurso cadastrado'}
                      description={search
                        ? 'Ajuste a busca para localizar máquinas, operadores ou postos de trabalho.'
                        : 'Cadastre máquinas, operadores ou postos de trabalho para planejar a capacidade produtiva.'}
                      action={search
                        ? { label: 'Limpar busca', onClick: () => setSearch(''), variant: 'outline' }
                        : { label: 'Novo Recurso', onClick: openNew, icon: Plus }}
                    />
                  </TableCell>
                </TableRow>
              ) : filtered.map(r => {
                const TypeIcon = typeIcons[r.resource_type] || Wrench;
                return (
                  <TableRow key={r.id} className="group hover:bg-muted/30">
                    <TableCell className="font-mono font-bold text-primary">{r.code}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="gap-1">
                        <TypeIcon className="h-3 w-3" />
                        {typeLabels[r.resource_type] || r.resource_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{r.sector_name || <span className="text-muted-foreground italic text-xs">—</span>}</TableCell>
                    <TableCell className="hidden lg:table-cell">{r.line_name || <span className="text-muted-foreground italic text-xs">—</span>}</TableCell>
                    <TableCell className="hidden sm:table-cell"><span className="font-mono">{r.capacity_per_hour}</span></TableCell>
                    <TableCell className="hidden md:table-cell"><span className="font-mono">R$ {r.cost_per_hour.toFixed(2)}</span></TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusStyles[r.status] || ''}`}>
                        {statusLabels[r.status] || r.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><Wrench className="h-4 w-4 text-primary" /></div>
              {editing ? 'Editar Recurso' : 'Novo Recurso'}
            </DialogTitle>
            <DialogDescription>Cadastre máquinas, operadores ou postos de trabalho</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Código *</Label><Input value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="REC-001" /></div>
              <div className="space-y-1.5"><Label>Nome *</Label><Input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Torno CNC 01" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.resource_type || 'machine'} onValueChange={v => setForm({ ...form, resource_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="machine">Máquina</SelectItem>
                    <SelectItem value="operator">Operador</SelectItem>
                    <SelectItem value="workstation">Posto de Trabalho</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Setor</Label>
                <Select value={form.sector_id || ''} onValueChange={v => setForm({ ...form, sector_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{activeSectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Linha</Label>
                <Select value={form.line_id || ''} onValueChange={v => setForm({ ...form, line_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{lines.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Capacidade/h</Label><Input type="number" value={form.capacity_per_hour || 0} onChange={e => setForm({ ...form, capacity_per_hour: toSafeNumber(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Custo/Hora (R$)</Label><Input type="number" step="0.01" value={form.cost_per_hour || 0} onChange={e => setForm({ ...form, cost_per_hour: toSafeNumber(e.target.value) })} /></div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status || 'available'} onValueChange={v => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Disponível</SelectItem>
                    <SelectItem value="running">Em Uso</SelectItem>
                    <SelectItem value="maintenance">Manutenção</SelectItem>
                    <SelectItem value="inactive">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Observações</Label><Textarea value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active ?? true} onCheckedChange={v => setForm({ ...form, is_active: v })} />
              <Label>Recurso ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.code || !form.name}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Confirmar Exclusão</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita. Deseja realmente excluir este recurso?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
