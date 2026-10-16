import { useState } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Badge } from '@/ui/base/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/ui/base/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Label } from '@/ui/base/label';
import { Textarea } from '@/ui/base/textarea';
import { useProductCosts, type ProductCost } from '@/hooks/production/useProductCosts';
import { KPICard } from '@/shared/components/KPICard';
import { Plus, DollarSign, TrendingUp, AlertTriangle, Calculator, Search, Pencil, Trash2 } from 'lucide-react';
import { Skeleton } from '@/ui/base/skeleton';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/formatters';
import { toSafeNumber } from '@/lib/numericValidation';
import { EmptyState } from '@/shared/components/EmptyState';

export default function ProductCostsPage() {
  const { costs, loading, createCost, updateCost, deleteCost, calculateCost, avgMargin, lowMarginProducts } = useProductCosts();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<ProductCost | null>(null);
  const [form, setForm] = useState({
    product_code: '', product_name: '', raw_material_cost: 0, labor_rate_per_hour: 0,
    production_time_minutes: 0, operational_cost: 0, sale_price: 0, notes: '',
  });

  const filtered = costs.filter(c => !search || c.product_name.toLowerCase().includes(search.toLowerCase()) || c.product_code.toLowerCase().includes(search.toLowerCase()));

  // Live preview calculation
  const preview = calculateCost(form.raw_material_cost, form.labor_rate_per_hour, form.production_time_minutes, form.operational_cost, form.sale_price);

  const openNew = () => {
    setEditingCost(null);
    setForm({ product_code: '', product_name: '', raw_material_cost: 0, labor_rate_per_hour: 0, production_time_minutes: 0, operational_cost: 0, sale_price: 0, notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (c: ProductCost) => {
    setEditingCost(c);
    setForm({
      product_code: c.product_code, product_name: c.product_name, raw_material_cost: c.raw_material_cost,
      labor_rate_per_hour: c.labor_rate_per_hour, production_time_minutes: c.production_time_minutes,
      operational_cost: c.operational_cost, sale_price: c.sale_price, notes: c.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.product_code || !form.product_name) return;
    if (editingCost) {
      await updateCost(editingCost.id, form);
    } else {
      await createCost(form);
    }
    setDialogOpen(false);
  };

  if (loading) {
    return <PageContainer><Skeleton className="h-10 w-64" /><div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div></PageContainer>;
  }

  return (
    <PageContainer>
      <PageHeader title="Custo e Lucro por Produto" description="Cálculo real de custo de produção, margem e lucratividade">
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Novo Custo</Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <KPICard title="Margem Média" value={`${avgMargin.toFixed(1)}%`} icon={<TrendingUp className="h-5 w-5" />} accentColor="success" index={0} />
        <KPICard title="Margem Baixa" value={lowMarginProducts.length} subtitle="produtos < 15%" icon={<AlertTriangle className="h-5 w-5" />} accentColor="warning" index={3} />
      </div>

      {lowMarginProducts.length > 0 && (
        <Card className="border-warning/30">
          <CardHeader><CardTitle className="flex items-center gap-2 text-warning"><AlertTriangle className="h-5 w-5" /> Produtos com Margem Baixa (&lt;15%)</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowMarginProducts.map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div><span className="font-mono mr-2">{c.product_code}</span>{c.product_name}</div>
                  <div className="flex items-center gap-3">
                    <span className="text-destructive font-bold">{c.profit_margin.toFixed(1)}%</span>
                    <span className="text-xs text-muted-foreground">Custo: R$ {c.total_cost.toFixed(2)} | Venda: R$ {c.sale_price.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" /> Análise de Custos</CardTitle>
            <div className="relative flex-1 max-w-sm ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Código</TableHead><TableHead>Produto</TableHead><TableHead>Mat. Prima</TableHead>
              <TableHead>Mão de Obra</TableHead><TableHead>Operacional</TableHead><TableHead>Custo Total</TableHead>
              <TableHead>Preço Venda</TableHead><TableHead>Lucro</TableHead><TableHead>Margem</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="p-0"><EmptyState icon={Calculator} title="Nenhum custo cadastrado" description="Cadastre custos de produtos para calcular margem, lucro e ponto de equilíbrio." action={{ label: 'Novo custo', onClick: () => setDialogOpen(true), icon: Plus }} /></TableCell></TableRow>
              ) : filtered.map(c => (
                <TableRow key={c.id} className={cn(c.profit_margin < 15 && 'bg-destructive/5')}>
                  <TableCell className="font-mono">{c.product_code}</TableCell>
                  <TableCell className="font-medium">{c.product_name}</TableCell>
                  <TableCell>R$ {Number(c.raw_material_cost).toFixed(2)}</TableCell>
                  <TableCell>R$ {Number(c.labor_cost).toFixed(2)}</TableCell>
                  <TableCell>R$ {Number(c.operational_cost).toFixed(2)}</TableCell>
                  <TableCell className="font-bold">R$ {Number(c.total_cost).toFixed(2)}</TableCell>
                  <TableCell>R$ {Number(c.sale_price).toFixed(2)}</TableCell>
                  <TableCell className={cn('font-bold', c.profit_value >= 0 ? 'text-green-600' : 'text-destructive')}>
                    R$ {Number(c.profit_value).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.profit_margin >= 30 ? 'default' : c.profit_margin >= 15 ? 'secondary' : 'destructive'}>
                      {c.profit_margin.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteCost(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Cost Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingCost ? 'Editar Custo' : 'Novo Custo de Produto'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Código</Label><Input value={form.product_code} onChange={e => setForm({ ...form, product_code: e.target.value })} /></div>
              <div><Label>Produto</Label><Input value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Custo Mat. Prima (R$)</Label><Input type="number" step="0.01" value={form.raw_material_cost} onChange={e => setForm({ ...form, raw_material_cost: toSafeNumber(e.target.value) })} /></div>
              <div><Label>Custo Operacional (R$)</Label><Input type="number" step="0.01" value={form.operational_cost} onChange={e => setForm({ ...form, operational_cost: toSafeNumber(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Valor/Hora Mão de Obra (R$)</Label><Input type="number" step="0.01" value={form.labor_rate_per_hour} onChange={e => setForm({ ...form, labor_rate_per_hour: toSafeNumber(e.target.value) })} /></div>
              <div><Label>Tempo Produção (min)</Label><Input type="number" value={form.production_time_minutes} onChange={e => setForm({ ...form, production_time_minutes: toSafeNumber(e.target.value) })} /></div>
            </div>
            <div><Label>Preço de Venda (R$)</Label><Input type="number" step="0.01" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: toSafeNumber(e.target.value) })} /></div>

            {/* Live Preview */}
            <Card className="bg-muted/50">
              <CardContent className="p-4">
                <p className="text-sm font-medium mb-2">📊 Cálculo em Tempo Real</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Mão de Obra: <span className="font-bold">R$ {preview.labor_cost.toFixed(2)}</span></div>
                  <div>Custo Total: <span className="font-bold">R$ {preview.total_cost.toFixed(2)}</span></div>
                  <div>Lucro: <span className={cn('font-bold', preview.profit_value >= 0 ? 'text-green-600' : 'text-destructive')}>R$ {preview.profit_value.toFixed(2)}</span></div>
                  <div>Margem: <span className={cn('font-bold', preview.profit_margin >= 15 ? 'text-green-600' : 'text-destructive')}>{preview.profit_margin.toFixed(1)}%</span></div>
                </div>
              </CardContent>
            </Card>

            <div><Label>Observações</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingCost ? 'Salvar' : 'Cadastrar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
