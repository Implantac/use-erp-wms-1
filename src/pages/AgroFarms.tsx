import { useConfirm } from '@/shared/components/confirmContext';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Sprout, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Textarea } from '@/ui/base/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/base/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Badge } from '@/ui/base/badge';
import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { useAgroFarms, useCreateAgroFarm, useDeleteAgroFarm } from '@/hooks/useAgro';
import { EmptyState } from '@/shared/components/EmptyState';
import { toSafeNumber } from '@/lib/numericValidation';

export default function AgroFarms() {
  const confirm = useConfirm();
  const { data: farms = [], isLoading } = useAgroFarms();
  const createFarm = useCreateAgroFarm();
  const deleteFarm = useDeleteAgroFarm();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', location: '', total_area_ha: '', notes: '' });

  const handleSubmit = async () => {
    const area = toSafeNumber(form.total_area_ha, 0, { min: 0 });
    await createFarm.mutateAsync({
      code: form.code,
      name: form.name,
      location: form.location || null,
      total_area_ha: area,
      notes: form.notes || null,
    });
    setForm({ code: '', name: '', location: '', total_area_ha: '', notes: '' });
    setOpen(false);
  };

  const totalArea = farms.reduce((s, f) => s + Number(f.total_area_ha || 0), 0);

  return (
    <PageContainer>
      <PageHeader
        title="Fazendas"
        description="Gestão de propriedades rurais"
        icon={Sprout}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Nova fazenda</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova fazenda</DialogTitle></DialogHeader>
              <div className="grid gap-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Código</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
                  <div><Label>Área (ha)</Label><Input type="number" min={0} value={form.total_area_ha} onChange={(e) => setForm({ ...form, total_area_ha: e.target.value })} /></div>
                </div>
                <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Localização</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                <div><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={!form.code || !form.name || createFarm.isPending}>Cadastrar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Fazendas</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{farms.length}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Área total</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{totalArea.toLocaleString('pt-BR')} ha</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ativas</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{farms.filter(f => f.status === 'active').length}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando…</div>
          ) : farms.length === 0 ? (
            <EmptyState icon={Sprout} title="Nenhuma fazenda cadastrada" description="Cadastre fazendas para gerenciar talhões, safras e operações agrícolas." action={{ label: 'Nova fazenda', onClick: () => setOpen(true), icon: Plus }} />
          
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead><TableHead>Nome</TableHead><TableHead>Localização</TableHead><TableHead className="text-right">Área (ha)</TableHead><TableHead>Status</TableHead><TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {farms.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-mono text-sm">{f.code}</TableCell>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-muted-foreground">{f.location || '—'}</TableCell>
                    <TableCell className="text-right">{Number(f.total_area_ha).toLocaleString('pt-BR')}</TableCell>
                    <TableCell><Badge variant={f.status === 'active' ? 'default' : 'secondary'}>{f.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button asChild variant="ghost" size="icon"><Link to={`/agro/fazendas/${f.id}`}><ChevronRight className="h-4 w-4" /></Link></Button>
                        <Button variant="ghost" size="icon" onClick={async () => { if (await confirm({ title: 'Excluir fazenda?', description: `A fazenda ${f.name} será excluída.`, confirmLabel: 'Excluir', variant: 'destructive' })) deleteFarm.mutate(f.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
