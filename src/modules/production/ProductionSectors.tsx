import { useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { EmptyState } from '@/shared/components/EmptyState';
import { PageHeader } from '@/shared/components/PageHeader';
import { useProductionSectors, ProductionSector } from '@/hooks/production/useProductionSectors';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/ui/base/dialog';
import { Badge } from '@/ui/base/badge';
import { Card, CardContent } from '@/ui/base/card';
import { Plus, Pencil, Trash2, Search, Factory, Building2, Power, PowerOff, AlertTriangle, Activity } from 'lucide-react';
import { Skeleton } from '@/ui/base/skeleton';
import { Textarea } from '@/ui/base/textarea';
import { Switch } from '@/ui/base/switch';

const emptySector: Partial<ProductionSector> = { code: '', name: '', responsible: '', sector_type: 'production', description: '', is_active: true };

const kpiConfig = [
  { label: 'Total Setores', icon: Building2, color: 'text-primary', ring: 'ring-primary/20' },
  { label: 'Ativos', icon: Activity, color: 'text-success', ring: 'ring-success/20' },
  { label: 'Produção', icon: Factory, color: 'text-info', ring: 'ring-info/20' },
  { label: 'Apoio', icon: Building2, color: 'text-warning-text', ring: 'ring-warning/20' },
];

export default function ProductionSectorsPage() {
  const { sectors, loading, create, update, remove } = useProductionSectors();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductionSector | null>(null);
  const [form, setForm] = useState<Partial<ProductionSector>>(emptySector);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filtered = sectors.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.code.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || s.sector_type === typeFilter;
    return matchSearch && matchType;
  });

  const kpiValues = [
    sectors.length,
    sectors.filter(s => s.is_active).length,
    sectors.filter(s => s.sector_type === 'production').length,
    sectors.filter(s => s.sector_type === 'support').length,
  ];

  const openNew = () => { setEditing(null); setForm(emptySector); setOpen(true); };
  const openEdit = (s: ProductionSector) => { setEditing(s); setForm(s); setOpen(true); };
  const handleSave = async () => { const ok = editing ? await update(editing.id, form) : await create(form); if (ok) setOpen(false); };
  const handleDelete = async () => { if (deleteId) { await remove(deleteId); setDeleteId(null); } };

  return (
    <PageContainer>
      <PageHeader title="Setores de Produção" description="Cadastro e gestão dos setores da fábrica" />

      {/* KPI Cards */}
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

      {/* Filters & Action */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar setor por nome ou código..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="production">Produção</SelectItem>
            <SelectItem value="support">Apoio</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openNew} className="shrink-0"><Plus className="h-4 w-4 mr-2" />Novo Setor</Button>
      </div>

      {/* Table */}
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
                <TableHead className="font-semibold hidden md:table-cell">Responsável</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="w-[100px] font-semibold text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={Factory}
                      title={search ? 'Nenhum setor encontrado' : 'Nenhum setor cadastrado'}
                      description={search ? 'Ajuste a busca para localizar o setor desejado.' : 'Cadastre o primeiro setor (produção ou apoio) para organizar sua planta.'}
                      action={search
                        ? { label: 'Limpar busca', onClick: () => setSearch(''), variant: 'outline' }
                        : { label: 'Novo Setor', onClick: openNew, icon: Plus }}
                    />
                  </TableCell>
                </TableRow>
              ) : filtered.map(s => (
                <TableRow key={s.id} className="group hover:bg-muted/30">
                  <TableCell className="font-mono font-bold text-primary">{s.code}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={s.sector_type === 'production' ? 'default' : 'secondary'} className="gap-1">
                      {s.sector_type === 'production' ? <Factory className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                      {s.sector_type === 'production' ? 'Produção' : 'Apoio'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{s.responsible || <span className="text-muted-foreground italic text-xs">Não definido</span>}</TableCell>
                  <TableCell>
                    <Badge variant={s.is_active ? 'default' : 'destructive'} className="gap-1">
                      {s.is_active ? <Power className="h-3 w-3" /> : <PowerOff className="h-3 w-3" />}
                      {s.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><Factory className="h-4 w-4 text-primary" /></div>
              {editing ? 'Editar Setor' : 'Novo Setor'}
            </DialogTitle>
            <DialogDescription>Preencha os dados do setor de produção</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Código *</Label><Input value={form.code || ''} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="SET-001" /></div>
              <div className="space-y-1.5"><Label>Nome *</Label><Input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Usinagem" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Responsável</Label><Input value={form.responsible || ''} onChange={e => setForm({ ...form, responsible: e.target.value })} placeholder="Nome do responsável" /></div>
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={form.sector_type || 'production'} onValueChange={v => setForm({ ...form, sector_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Produção</SelectItem>
                    <SelectItem value="support">Apoio</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label>Descrição</Label><Textarea value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descrição do setor..." rows={3} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active ?? true} onCheckedChange={v => setForm({ ...form, is_active: v })} />
              <Label>Setor ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!form.code || !form.name}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Confirmar Exclusão</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita. Deseja realmente excluir este setor?</DialogDescription>
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
