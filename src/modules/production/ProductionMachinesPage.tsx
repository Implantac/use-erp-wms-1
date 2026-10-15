import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { useProductionMachines, type ProductionMachine } from '@/hooks/production/useProductionMachines';
import { Card, CardContent } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Switch } from '@/ui/base/switch';
import { Badge } from '@/ui/base/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';

const emptyForm = { code: '', name: '', type: '', sector: '', active: true };

/** Generic registry: a loom is a machine type chosen by the customer, not a separate stock/capacity ledger. */
export default function ProductionMachinesPage() {
  const { currentCompany } = useEnterprise();
  const { machines, loading, loadError, create, update } = useProductionMachines();
  const [editing, setEditing] = useState<ProductionMachine | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const newMachine = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const editMachine = (machine: ProductionMachine) => {
    setEditing(machine);
    setForm({ code: machine.code, name: machine.name, type: machine.type,
      sector: machine.sector ?? '', active: machine.active });
    setOpen(true);
  };
  const save = async () => {
    if (saving || !form.code.trim() || !form.name.trim() || !form.type.trim()) return;
    setSaving(true);
    try {
      const values = { code: form.code.trim(), name: form.name.trim(), type: form.type.trim(),
        sector: form.sector.trim() || null, active: form.active };
      const ok = editing ? await update(editing.id, values) : await create(values);
      if (ok) { setOpen(false); setEditing(null); setForm(emptyForm); }
    } finally { setSaving(false); }
  };

  return <PageContainer loading={loading}>
    <PageHeader title="Cadastro de equipamentos" description="Máquinas por empresa: informe o tipo conforme sua operação (tear, fiação, tinturaria etc.). Não mede produção ou paradas automaticamente.">
      <Button onClick={newMachine} disabled={!currentCompany}><Plus className="h-4 w-4 mr-1" /> Cadastrar equipamento</Button>
    </PageHeader>
    {!currentCompany ? <p role="alert" className="text-sm text-muted-foreground">Selecione uma empresa para consultar equipamentos.</p>
      : loadError ? <p role="alert" className="text-sm text-destructive">Falha ao consultar equipamentos. Nenhum cadastro pode ser confirmado.</p>
      : <Card><CardContent className="pt-6">
        <p className="text-xs text-muted-foreground mb-4">Cadastro físico distinto da capacidade por turno. Estado operacional, operador e OP são somente leitura aqui; apontamentos exigem validação própria.</p>
        {machines.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum equipamento cadastrado para a empresa selecionada.</p>
          : <Table><TableHeader><TableRow>
            <TableHead>Código</TableHead><TableHead>Equipamento</TableHead><TableHead>Tipo</TableHead>
            <TableHead>Setor</TableHead><TableHead>Estado registrado</TableHead><TableHead>Ativo</TableHead><TableHead>Ação</TableHead>
          </TableRow></TableHeader><TableBody>{machines.map(machine => <TableRow key={machine.id}>
            <TableCell className="font-mono">{machine.code}</TableCell><TableCell>{machine.name}</TableCell>
            <TableCell>{machine.type}</TableCell><TableCell>{machine.sector || '—'}</TableCell>
            <TableCell>{machine.status || 'Não informado'}</TableCell>
            <TableCell><Badge variant={machine.active ? 'default' : 'secondary'}>{machine.active ? 'Ativo' : 'Inativo'}</Badge></TableCell>
            <TableCell><Button size="sm" variant="outline" onClick={() => editMachine(machine)} aria-label={`Editar ${machine.name}`}><Pencil className="h-4 w-4 mr-1" /> Editar</Button></TableCell>
          </TableRow>)}</TableBody></Table>}
      </CardContent></Card>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent>
      <DialogHeader><DialogTitle>{editing ? 'Editar equipamento' : 'Novo equipamento'}</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label htmlFor="machine-code">Código *</Label><Input id="machine-code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
        <div><Label htmlFor="machine-name">Nome *</Label><Input id="machine-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label htmlFor="machine-type">Tipo *</Label><Input id="machine-type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} placeholder="Nome definido pela empresa" /></div>
        <div><Label htmlFor="machine-sector">Setor</Label><Input id="machine-sector" value={form.sector} onChange={e => setForm({ ...form, sector: e.target.value })} /></div>
        <div className="flex items-center gap-2"><Switch id="machine-active" checked={form.active} onCheckedChange={active => setForm({ ...form, active })} /><Label htmlFor="machine-active">Ativo para seleção</Label></div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button disabled={saving || !form.code.trim() || !form.name.trim() || !form.type.trim()} onClick={() => void save()}>{saving ? 'Salvando...' : 'Salvar'}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  </PageContainer>;
}
