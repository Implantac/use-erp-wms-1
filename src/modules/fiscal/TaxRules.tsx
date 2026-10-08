import { useState, useMemo } from 'react';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Switch } from '@/ui/base/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/ui/base/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/base/tabs';
import { Plus, Pencil, Trash2, Search, Calculator, Sparkles } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { useTaxRules, useUpsertTaxRule, useDeleteTaxRule, type TaxRule } from '@/hooks/fiscal/useTaxRules';
import { toSafeNumber } from '@/lib/numericValidation';

const empty: Partial<TaxRule> = {
  name: '',
  ncm: '',
  cfop: '',
  operation_type: 'saida',
  tax_regime: 'simples',
  tax_framework: 'current',
  icms_cst: '102',
  icms_rate: 0,
  pis_cst: '01',
  pis_rate: 0,
  cofins_cst: '01',
  cofins_rate: 0,
  ibs_rate: 0,
  cbs_rate: 0,
  priority: 100,
  active: true,
};

export default function TaxRulesPage() {
  const { data: rules = [], isLoading } = useTaxRules();
  const upsert = useUpsertTaxRule();
  const del = useDeleteTaxRule();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<TaxRule>>(empty);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return rules.filter(
      (r) =>
        !s ||
        r.name.toLowerCase().includes(s) ||
        r.ncm?.toLowerCase().includes(s) ||
        r.cfop?.toLowerCase().includes(s)
    );
  }, [rules, search]);

  const openNew = () => {
    setEditing(empty);
    setOpen(true);
  };
  const openEdit = (r: TaxRule) => {
    setEditing(r);
    setOpen(true);
  };
  const save = async () => {
    if (!editing.name) return;
    await upsert.mutateAsync({ ...editing, name: editing.name });
    setOpen(false);
  };

  return (
    <PageContainer>
      <PageHeader
        title="Cadastro de parâmetros fiscais"
        description="Parâmetros de referência; não substituem classificação CST/cClassTrib nem autorizam emissão IBS/CBS."
      />

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, NCM ou CFOP..."
            className="pl-9"
          />
        </div>
        <Button size="lg" onClick={openNew} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Nova Regra Híbrida
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Regras de Tributação ({filtered.length})</CardTitle>
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Regra Atual</Badge>
            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">IBS / CBS</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operação / Nome</TableHead>
                <TableHead>NCM/CFOP</TableHead>
                <TableHead>Framework</TableHead>
                <TableHead className="text-right text-blue-600">ICMS %</TableHead>
                <TableHead className="text-right text-purple-600">IBS %</TableHead>
                <TableHead className="text-right text-purple-600">CBS %</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="p-4"><EmptyState compact icon={Calculator} title="Nenhuma regra cadastrada" description="Configure alíquotas de ICMS, PIS, COFINS e IPI por NCM e UF." /></TableCell></TableRow>
              ) : (
                filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold">{r.name}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">{r.operation_type} - {r.tax_regime}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs">
                        <span>NCM: {r.ncm || '—'}</span>
                        <span>CFOP: {r.cfop || '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={
                        r.tax_framework === 'hybrid' ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white border-0' : 
                        r.tax_framework === 'reform_ibs_cbs' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                      }>
                        {r.tax_framework === 'hybrid' ? 'Híbrido' : r.tax_framework === 'reform_ibs_cbs' ? 'IBS/CBS' : 'Atual'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-blue-600">{Number(r.icms_rate).toFixed(2)}%</TableCell>
                    <TableCell className="text-right font-medium text-purple-600">{Number(r.ibs_rate).toFixed(2)}%</TableCell>
                    <TableCell className="text-right font-medium text-purple-600">{Number(r.cbs_rate).toFixed(2)}%</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={r.active ? 'default' : 'secondary'}>{r.active ? 'Ativa' : 'Inativa'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => confirm(`Remover?`) && del.mutate(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              {editing.id ? 'Editar' : 'Nova'} Regra Fiscal Adaptativa
            </DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="current" className="w-full">
            <div className="flex items-center justify-between mb-4 bg-muted/50 p-2 rounded-lg">
               <Label className="font-bold">Regime de Tributação:</Label>
               <Select
                  value={editing.tax_framework}
                  onValueChange={(v) => setEditing({ ...editing, tax_framework: v as 'current' | 'reform_ibs_cbs' | 'hybrid' })}
                >
                  <SelectTrigger className="w-[250px] bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Somente Regra Atual (ICMS/PIS/COFINS)</SelectItem>
                    <SelectItem value="reform_ibs_cbs">Somente Reforma (IBS/CBS)</SelectItem>
                    <SelectItem value="hybrid">Híbrido (Concomitante)</SelectItem>
                  </SelectContent>
                </Select>
            </div>

            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="current" className="data-[state=active]:text-blue-600">Regra Atual</TabsTrigger>
              <TabsTrigger value="reform" className="data-[state=active]:text-purple-600">IBS / CBS (Reforma)</TabsTrigger>
            </TabsList>

            <div className="grid grid-cols-2 gap-4 mt-4 mb-4 border-b pb-4">
               <div className="col-span-2">
                  <Label>Identificação da Regra *</Label>
                  <Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ex: Venda Interna Mercadoria" />
               </div>
               <div>
                  <Label>NCM</Label>
                  <Input value={editing.ncm || ''} onChange={(e) => setEditing({ ...editing, ncm: e.target.value })} />
               </div>
               <div>
                  <Label>CFOP</Label>
                  <Input value={editing.cfop || ''} onChange={(e) => setEditing({ ...editing, cfop: e.target.value })} />
               </div>
            </div>

            <TabsContent value="current" className="space-y-4">
              <div className="grid grid-cols-3 gap-4 p-4 bg-blue-50/30 rounded-xl border border-blue-100">
                <div className="space-y-2">
                  <Label>ICMS CST</Label>
                  <Input value={editing.icms_cst || ''} onChange={(e) => setEditing({ ...editing, icms_cst: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>ICMS %</Label>
                  <Input type="number" step="0.01" value={editing.icms_rate ?? 0} onChange={(e) => setEditing({ ...editing, icms_rate: toSafeNumber(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>PIS %</Label>
                  <Input type="number" step="0.01" value={editing.pis_rate ?? 0} onChange={(e) => setEditing({ ...editing, pis_rate: toSafeNumber(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>COFINS %</Label>
                  <Input type="number" step="0.01" value={editing.cofins_rate ?? 0} onChange={(e) => setEditing({ ...editing, cofins_rate: toSafeNumber(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>IPI %</Label>
                  <Input type="number" step="0.01" value={editing.ipi_rate ?? 0} onChange={(e) => setEditing({ ...editing, ipi_rate: toSafeNumber(e.target.value) })} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="reform" className="space-y-4">
              <div className="grid grid-cols-3 gap-4 p-4 bg-purple-50/30 rounded-xl border border-purple-100">
                <div className="space-y-2">
                  <Label className="text-purple-700">IBS % (Estadual/Mun.)</Label>
                  <Input type="number" step="0.01" value={editing.ibs_rate ?? 0} onChange={(e) => setEditing({ ...editing, ibs_rate: toSafeNumber(e.target.value) })} className="border-purple-200 focus-visible:ring-purple-500" />
                </div>
                <div className="space-y-2">
                  <Label className="text-purple-700">CBS % (Federal)</Label>
                  <Input type="number" step="0.01" value={editing.cbs_rate ?? 0} onChange={(e) => setEditing({ ...editing, cbs_rate: toSafeNumber(e.target.value) })} className="border-purple-200 focus-visible:ring-purple-500" />
                </div>
                <div className="space-y-2">
                  <Label className="text-purple-700">IS % (Seletivo)</Label>
                  <Input type="number" step="0.01" value={editing.is_is_rate ?? 0} onChange={(e) => setEditing({ ...editing, is_is_rate: toSafeNumber(e.target.value) })} className="border-purple-200 focus-visible:ring-purple-500" />
                </div>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-2">
                 <Sparkles className="h-4 w-4 text-amber-600 mt-0.5" />
                 <p className="text-[11px] text-amber-800">
                    As alíquotas cadastradas aqui não constituem validação legal de IBS/CBS. A emissão depende de CST, cClassTrib, leiaute vigente e homologação por documento e regime.
                 </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6 border-t pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={!editing.name || upsert.isPending} className="bg-primary">Salvar Regra</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
