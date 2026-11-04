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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';

const emptyForm = { code: '', name: '', type: '', sector: '', active: true, minLoadKg: '', maxLoadKg: '', usefulBathVolumeL: '', setupMinutes: '', cleaningMinutes: '', colorSequencingRule: '' };

/** Setores canônicos das centrais de PCP (o setor casa por texto normalizado). */
const SECTOR_OPTIONS = ['Fiação', 'Malharia', 'Tecelagem', 'Tinturaria', 'Beneficiamento/Acabamento'];

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
      sector: machine.sector ?? '', active: machine.active,
      minLoadKg: machine.min_load_kg !== null && machine.min_load_kg !== undefined ? String(machine.min_load_kg) : '',
      maxLoadKg: machine.max_load_kg !== null && machine.max_load_kg !== undefined ? String(machine.max_load_kg) : '',
      usefulBathVolumeL: machine.useful_bath_volume_l !== null && machine.useful_bath_volume_l !== undefined ? String(machine.useful_bath_volume_l) : '',
      setupMinutes: machine.setup_time_minutes !== null && machine.setup_time_minutes !== undefined ? String(machine.setup_time_minutes) : '',
      cleaningMinutes: machine.cleaning_time_minutes !== null && machine.cleaning_time_minutes !== undefined ? String(machine.cleaning_time_minutes) : '',
      colorSequencingRule: machine.color_sequencing_rule ?? '' });
    setOpen(true);
  };
  const numberOrNull = (value: string) => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const save = async () => {
    if (saving || !form.code.trim() || !form.name.trim() || !form.type.trim()) return;
    setSaving(true);
    try {
      const values = { code: form.code.trim(), name: form.name.trim(), type: form.type.trim(),
        sector: form.sector.trim() || null, active: form.active,
        min_load_kg: numberOrNull(form.minLoadKg), max_load_kg: numberOrNull(form.maxLoadKg),
        useful_bath_volume_l: numberOrNull(form.usefulBathVolumeL),
        setup_time_minutes: numberOrNull(form.setupMinutes),
        cleaning_time_minutes: numberOrNull(form.cleaningMinutes),
        color_sequencing_rule: form.colorSequencingRule || null };
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
        <div>
          <Label htmlFor="machine-sector">Setor</Label>
          <Select value={form.sector || '__none__'} onValueChange={v => setForm({ ...form, sector: v === '__none__' ? '' : v })}>
            <SelectTrigger id="machine-sector"><SelectValue placeholder="Sem setor definido" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Sem setor definido (aparece em todas as centrais)</SelectItem>
              {SECTOR_OPTIONS.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
              {form.sector && !SECTOR_OPTIONS.includes(form.sector) ? <SelectItem value={form.sector}>{form.sector} (texto atual)</SelectItem> : null}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2"><Switch id="machine-active" checked={form.active} onCheckedChange={active => setForm({ ...form, active })} /><Label htmlFor="machine-active">Ativo para seleção</Label></div>
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">Carga validada da partida (tinturaria, quando aplicável)</p>
          <div><Label htmlFor="machine-min-load">Carga mínima (kg)</Label><Input id="machine-min-load" type="number" min="0" step="0.01" value={form.minLoadKg} onChange={e => setForm({ ...form, minLoadKg: e.target.value })} /></div>
          <div><Label htmlFor="machine-max-load">Carga máxima (kg)</Label><Input id="machine-max-load" type="number" min="0" step="0.01" value={form.maxLoadKg} onChange={e => setForm({ ...form, maxLoadKg: e.target.value })} /></div>
          <div><Label htmlFor="machine-bath-volume">Volume útil do banho (L)</Label><Input id="machine-bath-volume" type="number" min="0" step="0.01" value={form.usefulBathVolumeL} onChange={e => setForm({ ...form, usefulBathVolumeL: e.target.value })} /></div>
          <p className="text-[11px] text-muted-foreground">Preencha só com limites validados pela empresa. Vazio = sem validação de carga para esta máquina.</p>
        </div>
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">Tempos de troca de artigo/cor (programação finita)</p>
          <div><Label htmlFor="machine-setup">Setup na troca (min)</Label><Input id="machine-setup" type="number" min="0" step="1" value={form.setupMinutes} onChange={e => setForm({ ...form, setupMinutes: e.target.value })} /></div>
          <div><Label htmlFor="machine-cleaning">Limpeza na troca (min)</Label><Input id="machine-cleaning" type="number" min="0" step="1" value={form.cleaningMinutes} onChange={e => setForm({ ...form, cleaningMinutes: e.target.value })} /></div>
          <p className="text-[11px] text-muted-foreground">Com os tempos preenchidos, a programação exige setup + limpeza entre produções de artigos diferentes nesta máquina. Mesmo artigo em sequência não exige troca. Vazio = nenhum tempo presumido.</p>
        </div>
        <div className="space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">Sequenciamento de cor nesta máquina (tinturaria)</p>
          <div>
            <Label htmlFor="machine-color-rule">Regra formal de cor</Label>
            <Select value={form.colorSequencingRule || '__none__'} onValueChange={v => setForm({ ...form, colorSequencingRule: v === '__none__' ? '' : v })}>
              <SelectTrigger id="machine-color-rule"><SelectValue placeholder="Não configurada" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Não configurada (só sugestão na tela)</SelectItem>
                <SelectItem value="light_to_dark">Claro → escuro: clareamento entre partidas é bloqueado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-[11px] text-muted-foreground">Com a regra ativa, o banco compara o L* alvo das partidas vizinhas nesta máquina e rejeita clareamento. Sem L* informado na partida, não há referência e nada é bloqueado.</p>
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <Button disabled={saving || !form.code.trim() || !form.name.trim() || !form.type.trim()} onClick={() => void save()}>{saving ? 'Salvando...' : 'Salvar'}</Button>
      </DialogFooter>
    </DialogContent></Dialog>
  </PageContainer>;
}
