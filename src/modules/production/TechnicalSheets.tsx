import { useCallback, useEffect, useState } from 'react';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { useProducts } from '@/hooks/inventory/useProducts';
import type { ArticleSheet } from '@/lib/production/articleSheets';
import { fetchArticleSheets } from '@/services/production/articleSheets';
import { ArticleSheetManagerDialog } from './productionOrders/ArticleSheetManagerDialog';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { KPICard } from '@/shared/components/KPICard';
import { Card, CardContent } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Badge } from '@/ui/base/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/ui/base/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Label } from '@/ui/base/label';
import { Textarea } from '@/ui/base/textarea';
import { Switch } from '@/ui/base/switch';
import type { TechnicalSheetRow } from '@/hooks/production/useTechnicalSheets';
import { useTechnicalSheets } from '@/hooks/production/useTechnicalSheets';
import { Plus, FileText, Pencil, Trash2, Clock, DollarSign, Layers } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';

interface StepEntry { name: string; time_minutes: number; sector: string; [key: string]: unknown; }
interface MaterialEntry { name: string; quantity: number; unit: string; unit_cost: number; [key: string]: unknown; }

export default function TechnicalSheetsPage() {
  const { currentCompany } = useEnterprise();
  const { data: sheetProducts = [] } = useProducts();
  const [articleSheets, setArticleSheets] = useState<ArticleSheet[]>([]);
  const [articleSheetManagerOpen, setArticleSheetManagerOpen] = useState(false);
  const loadArticleSheets = useCallback(async () => {
    if (!currentCompany?.id) return;
    try {
      setArticleSheets(await fetchArticleSheets(currentCompany.id));
    } catch {
      setArticleSheets([]);
    }
  }, [currentCompany?.id]);
  useEffect(() => { void loadArticleSheets(); }, [loadArticleSheets]);
  const { sheets, loading, create, update, remove } = useTechnicalSheets();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TechnicalSheetRow | null>(null);
  const [form, setForm] = useState({ product_code: '', product_name: '', version: '1.0', is_active: true, notes: '' });
  const [steps, setSteps] = useState<StepEntry[]>([]);
  const [materials, setMaterials] = useState<MaterialEntry[]>([]);

  const openNew = () => { setEditing(null); setForm({ product_code: '', product_name: '', version: '1.0', is_active: true, notes: '' }); setSteps([{ name: 'Corte', time_minutes: 15, sector: 'Corte' }]); setMaterials([{ name: 'Tecido', quantity: 1, unit: 'mt', unit_cost: 12 }]); setDialogOpen(true); };
  const openEdit = (sheet: TechnicalSheetRow) => { setEditing(sheet); setForm({ product_code: sheet.product_code, product_name: sheet.product_name, version: sheet.version, is_active: sheet.is_active, notes: sheet.notes || '' }); setSteps(Array.isArray(sheet.steps) ? sheet.steps.map((step) => ({ name: step.name ?? '', time_minutes: step.time_minutes ?? 0, sector: step.work_center ?? '' })) : []); setMaterials(Array.isArray(sheet.materials) ? sheet.materials.map((material) => ({ name: material.name ?? material.componentCode ?? material.material_code ?? '', quantity: material.quantity ?? 0, unit: material.unit ?? '', unit_cost: typeof material.unit_cost === 'number' ? material.unit_cost : 0 })) : []); setDialogOpen(true); };

  const totalTime = steps.reduce((s, st) => s + st.time_minutes, 0);
  const totalMaterialCost = materials.reduce((s, m) => s + m.quantity * m.unit_cost, 0);
  const avgTime = sheets.length > 0 ? (sheets.reduce((s, sh) => s + sh.total_time_minutes, 0) / sheets.length).toFixed(0) : '0';
  const avgCost = sheets.length > 0 ? (sheets.reduce((s, sh) => s + sh.standard_cost, 0) / sheets.length).toFixed(2) : '0.00';

  const handleSave = async () => {
    if (!form.product_code || !form.product_name) return;
    const payload = { ...form, steps, materials, total_time_minutes: totalTime, standard_cost: totalMaterialCost };
    if (editing) await update(editing.id, payload);
    else await create(payload);
    setDialogOpen(false);
  };

  return (
    <PageContainer loading={loading}>
      <PageHeader title="Fichas Técnicas" description="Sequência de produção, materiais e custos por produto">
        <Button variant="outline" onClick={() => setArticleSheetManagerOpen(true)}><FileText className="h-4 w-4 mr-2" /> Ficha do artigo (têxtil, versionada)</Button>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nova Ficha</Button>
      </PageHeader>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard title="Fichas Cadastradas" value={sheets.length} icon={<FileText className="h-5 w-5" />} accentColor="primary" index={0} />
        <KPICard title="Tempo Médio" value={`${avgTime} min`} icon={<Clock className="h-5 w-5" />} accentColor="info" index={1} />
        <KPICard title="Custo Médio Padrão" value={`R$ ${avgCost}`} icon={<DollarSign className="h-5 w-5" />} accentColor="success" index={2} />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Produto</TableHead><TableHead>Código</TableHead><TableHead>Versão</TableHead>
              <TableHead>Etapas</TableHead><TableHead>Tempo Total</TableHead><TableHead>Custo Padrão</TableHead>
              <TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sheets.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="p-4"><EmptyState compact icon={FileText} title="Nenhuma ficha técnica cadastrada" description="Cadastre fichas técnicas com etapas e materiais para padronizar a produção." /></TableCell></TableRow>
              ) : sheets.map(sh => (
                <TableRow key={sh.id}>
                  <TableCell className="font-medium">{sh.product_name}</TableCell>
                  <TableCell className="font-mono text-xs">{sh.product_code}</TableCell>
                  <TableCell>{sh.version}</TableCell>
                  <TableCell>{Array.isArray(sh.steps) ? sh.steps.length : 0}</TableCell>
                  <TableCell>{sh.total_time_minutes} min</TableCell>
                  <TableCell>R$ {sh.standard_cost.toFixed(2)}</TableCell>
                  <TableCell><Badge variant={sh.is_active ? 'default' : 'secondary'}>{sh.is_active ? 'Ativa' : 'Inativa'}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(sh)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(sh.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Editar Ficha Técnica' : 'Nova Ficha Técnica'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Código do Produto</Label><Input value={form.product_code} onChange={e => setForm(f => ({ ...f, product_code: e.target.value }))} /></div>
            <div><Label>Nome do Produto</Label><Input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} /></div>
            <div><Label>Versão</Label><Input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} /></div>
            <div className="flex items-center gap-2 pt-6"><Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} /><Label>Ativa</Label></div>
          </div>
          <div className="space-y-2 mt-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2"><Layers className="h-4 w-4" /> Etapas de Produção</Label>
              <Button size="sm" variant="outline" onClick={() => setSteps(s => [...s, { name: '', time_minutes: 15, sector: '' }])}><Plus className="h-3 w-3 mr-1" /> Etapa</Button>
            </div>
            {steps.map((st, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 items-end">
                <Input placeholder="Nome" value={st.name} onChange={e => { const ns = [...steps]; ns[i].name = e.target.value; setSteps(ns); }} />
                <Input type="number" placeholder="Tempo (min)" value={st.time_minutes} onChange={e => { const ns = [...steps]; ns[i].time_minutes = +e.target.value; setSteps(ns); }} />
                <Input placeholder="Setor" value={st.sector} onChange={e => { const ns = [...steps]; ns[i].sector = e.target.value; setSteps(ns); }} />
                <Button size="icon" variant="ghost" onClick={() => setSteps(s => s.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Tempo total: {totalTime} min</p>
          </div>
          <div className="space-y-2 mt-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Materiais</Label>
              <Button size="sm" variant="outline" onClick={() => setMaterials(m => [...m, { name: '', quantity: 1, unit: 'un', unit_cost: 0 }])}><Plus className="h-3 w-3 mr-1" /> Material</Button>
            </div>
            {materials.map((m, i) => (
              <div key={i} className="grid grid-cols-5 gap-2 items-end">
                <Input placeholder="Material" value={m.name} onChange={e => { const nm = [...materials]; nm[i].name = e.target.value; setMaterials(nm); }} />
                <Input type="number" placeholder="Qtd" value={m.quantity} onChange={e => { const nm = [...materials]; nm[i].quantity = +e.target.value; setMaterials(nm); }} />
                <Input placeholder="Unid" value={m.unit} onChange={e => { const nm = [...materials]; nm[i].unit = e.target.value; setMaterials(nm); }} />
                <Input type="number" placeholder="Custo" value={m.unit_cost} onChange={e => { const nm = [...materials]; nm[i].unit_cost = +e.target.value; setMaterials(nm); }} />
                <Button size="icon" variant="ghost" onClick={() => setMaterials(s => s.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Custo material total: R$ {totalMaterialCost.toFixed(2)}</p>
          </div>
          <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <DialogFooter><Button onClick={handleSave}>{editing ? 'Salvar' : 'Criar'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <ArticleSheetManagerDialog
        open={articleSheetManagerOpen}
        onOpenChange={setArticleSheetManagerOpen}
        products={sheetProducts.map((product) => ({ id: product.id, code: product.code, name: product.name }))}
        sheets={articleSheets}
        onChanged={loadArticleSheets}
      />
    </PageContainer>
  );
}
