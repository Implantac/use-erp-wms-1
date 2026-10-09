import { useState } from 'react';
import { useRFID } from '@/hooks/system/useRFIDQuery';
import type { TagType } from '@/types/rfid';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Badge } from '@/ui/base/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/base/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Plus, Tag, RefreshCw, Trash2, Search } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useConfirm } from '@/shared/components/confirmContext';

const tagTypeLabels: Record<string, string> = { product: 'Produto', pallet: 'Palete', location: 'Local', asset: 'Ativo' };
const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Ativa', variant: 'default' },
  inactive: { label: 'Inativa', variant: 'secondary' },
  lost: { label: 'Perdida', variant: 'destructive' },
  damaged: { label: 'Danificada', variant: 'outline' },
};

export default function RFIDTagsPage() {
  const { tags, tagsLoading: loading, refreshTags, createTag: create, deleteTag: remove } = useRFID();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    epc: '', tagType: 'product', productCode: '', productName: '', batch: '', palletId: '', location: '',
  });

  const filtered = tags.filter(t =>
    t.epc.toLowerCase().includes(search.toLowerCase()) ||
    (t.productName || '').toLowerCase().includes(search.toLowerCase()) ||
    (t.productCode || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!form.epc) return;
    await create({
      epc: form.epc, tagType: form.tagType as TagType, productCode: form.productCode || undefined,
      productName: form.productName || undefined, batch: form.batch || undefined,
      palletId: form.palletId || undefined, location: form.location || undefined,
    });
    setOpen(false);
    setForm({ epc: '', tagType: 'product', productCode: '', productName: '', batch: '', palletId: '', location: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tags RFID</h1>
          <p className="text-muted-foreground">Gerencie as etiquetas RFID vinculadas a produtos e paletes</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refreshTags()}><RefreshCw className="h-4 w-4 mr-1" /> Atualizar</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" /> Nova Tag</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Registrar Tag RFID</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><Label>EPC (Código Eletrônico) *</Label><Input value={form.epc} onChange={e => setForm(p => ({ ...p, epc: e.target.value }))} placeholder="E200 0017 2209 0148 0820 6857" className="font-mono" /></div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={form.tagType} onValueChange={v => setForm(p => ({ ...p, tagType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="product">Produto</SelectItem>
                      <SelectItem value="pallet">Palete</SelectItem>
                      <SelectItem value="location">Local</SelectItem>
                      <SelectItem value="asset">Ativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Código Produto</Label><Input value={form.productCode} onChange={e => setForm(p => ({ ...p, productCode: e.target.value }))} /></div>
                <div><Label>Nome Produto</Label><Input value={form.productName} onChange={e => setForm(p => ({ ...p, productName: e.target.value }))} /></div>
                <div><Label>Lote</Label><Input value={form.batch} onChange={e => setForm(p => ({ ...p, batch: e.target.value }))} /></div>
                <div><Label>ID Palete</Label><Input value={form.palletId} onChange={e => setForm(p => ({ ...p, palletId: e.target.value }))} /></div>
                <div><Label>Localização</Label><Input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} /></div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleSubmit}>Salvar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <Tag className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{tags.length}</p><p className="text-xs text-muted-foreground">Total Tags</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-2xl font-bold">{tags.filter(t => t.status === 'active').length}</p>
          <p className="text-xs text-muted-foreground">Ativas</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-2xl font-bold">{tags.filter(t => t.tagType === 'product').length}</p>
          <p className="text-xs text-muted-foreground">Produtos</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-2xl font-bold">{tags.filter(t => t.tagType === 'pallet').length}</p>
          <p className="text-xs text-muted-foreground">Paletes</p>
        </CardContent></Card>
      </div>

      {/* Search and Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Tags Registradas</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por EPC ou produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Carregando...</p>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Tag} title="Nenhuma tag RFID" description="Cadastre tags EPC para rastrear produtos, paletes e ativos em tempo real." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>EPC</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Última Leitura</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(tag => {
                  const cfg = statusConfig[tag.status] || statusConfig.inactive;
                  return (
                    <TableRow key={tag.id}>
                      <TableCell className="font-mono text-xs">{tag.epc}</TableCell>
                      <TableCell><Badge variant="outline">{tagTypeLabels[tag.tagType] || tag.tagType}</Badge></TableCell>
                      <TableCell>{tag.productName || '-'}<br /><span className="text-xs text-muted-foreground">{tag.productCode}</span></TableCell>
                      <TableCell>{tag.batch || '-'}</TableCell>
                      <TableCell>{tag.location || '-'}</TableCell>
                      <TableCell><Badge variant={cfg.variant}>{cfg.label}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {tag.lastReadAt ? format(new Date(tag.lastReadAt), "dd/MM HH:mm", { locale: ptBR }) : 'Nunca'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" aria-label={`Excluir tag ${tag.epc}`} onClick={async () => {
                          const approved = await confirm({ title: 'Excluir tag RFID?', description: `A tag ${tag.epc} será removida.`, confirmLabel: 'Excluir', variant: 'destructive' });
                          if (approved) await remove(tag.id);
                        }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
