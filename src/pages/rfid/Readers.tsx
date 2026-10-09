import { useState } from 'react';
import type { ReaderStatus } from '@/types/rfid';
import { useRFID } from '@/hooks/system/useRFIDQuery';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Badge } from '@/ui/base/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/ui/base/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Plus, Radio, Wifi, WifiOff, Settings, Trash2, RefreshCw } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useConfirm } from '@/shared/components/confirmContext';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Ativo', variant: 'default' },
  inactive: { label: 'Inativo', variant: 'secondary' },
  maintenance: { label: 'Manutenção', variant: 'outline' },
  error: { label: 'Erro', variant: 'destructive' },
};

export default function RFIDReadersPage() {
  const { readers, readersLoading: loading, refreshReaders, createReader: create, deleteReader: remove } = useRFID();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '', name: '', location: '', zone: '', ipAddress: '', port: '',
    model: '', manufacturer: '', antennaCount: '1', status: 'active',
  });

  const handleSubmit = async () => {
    if (!form.code || !form.name) return;
    await create({
      code: form.code, name: form.name, location: form.location || undefined,
      zone: form.zone || undefined, ipAddress: form.ipAddress || undefined,
      port: form.port ? Number(form.port) : undefined, model: form.model || undefined,
      manufacturer: form.manufacturer || undefined, antennaCount: Number(form.antennaCount),
      status: form.status as ReaderStatus,
    });
    setOpen(false);
    setForm({ code: '', name: '', location: '', zone: '', ipAddress: '', port: '', model: '', manufacturer: '', antennaCount: '1', status: 'active' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leitores RFID</h1>
          <p className="text-muted-foreground">Gerencie os leitores RFID do armazém</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refreshReaders()}><RefreshCw className="h-4 w-4 mr-1" /> Atualizar</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-1" /> Novo Leitor</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>Cadastrar Leitor RFID</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Código *</Label><Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="READER-001" /></div>
                <div><Label>Nome *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Leitor Doca 1" /></div>
                <div><Label>Localização</Label><Input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Doca 01" /></div>
                <div><Label>Zona</Label><Input value={form.zone} onChange={e => setForm(p => ({ ...p, zone: e.target.value }))} placeholder="Recebimento" /></div>
                <div><Label>IP</Label><Input value={form.ipAddress} onChange={e => setForm(p => ({ ...p, ipAddress: e.target.value }))} placeholder="192.168.1.100" /></div>
                <div><Label>Porta</Label><Input type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: e.target.value }))} placeholder="5084" /></div>
                <div><Label>Modelo</Label><Input value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))} placeholder="FX9600" /></div>
                <div><Label>Fabricante</Label><Input value={form.manufacturer} onChange={e => setForm(p => ({ ...p, manufacturer: e.target.value }))} placeholder="Zebra" /></div>
                <div><Label>Antenas</Label><Input type="number" value={form.antennaCount} onChange={e => setForm(p => ({ ...p, antennaCount: e.target.value }))} /></div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="inactive">Inativo</SelectItem>
                      <SelectItem value="maintenance">Manutenção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={handleSubmit}>Salvar</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <Radio className="h-8 w-8 text-primary" />
          <div><p className="text-2xl font-bold">{readers.length}</p><p className="text-xs text-muted-foreground">Total Leitores</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <Wifi className="h-8 w-8 text-green-500" />
          <div><p className="text-2xl font-bold">{readers.filter(r => r.status === 'active').length}</p><p className="text-xs text-muted-foreground">Ativos</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <Settings className="h-8 w-8 text-amber-500" />
          <div><p className="text-2xl font-bold">{readers.filter(r => r.status === 'maintenance').length}</p><p className="text-xs text-muted-foreground">Manutenção</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex items-center gap-3">
          <WifiOff className="h-8 w-8 text-destructive" />
          <div><p className="text-2xl font-bold">{readers.filter(r => r.status === 'error').length}</p><p className="text-xs text-muted-foreground">Com Erro</p></div>
        </CardContent></Card>
      </div>

      {/* Readers Table */}
      <Card>
        <CardHeader><CardTitle>Leitores Cadastrados</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Carregando...</p>
          ) : readers.length === 0 ? (
            <EmptyState icon={Radio} title="Nenhum leitor RFID" description="Cadastre leitores fixos ou móveis para capturar leituras EPC de tags automaticamente." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Antenas</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último Sinal</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readers.map(reader => {
                  const cfg = statusConfig[reader.status] || statusConfig.inactive;
                  return (
                    <TableRow key={reader.id}>
                      <TableCell className="font-mono text-sm">{reader.code}</TableCell>
                      <TableCell className="font-medium">{reader.name}</TableCell>
                      <TableCell>{reader.location || '-'}</TableCell>
                      <TableCell className="font-mono text-sm">{reader.ipAddress || '-'}</TableCell>
                      <TableCell>{reader.model || '-'}</TableCell>
                      <TableCell className="text-center">{reader.antennaCount}</TableCell>
                      <TableCell><Badge variant={cfg.variant}>{cfg.label}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {reader.lastHeartbeat ? format(new Date(reader.lastHeartbeat), "dd/MM HH:mm", { locale: ptBR }) : 'Nunca'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" aria-label={`Excluir leitor ${reader.name}`} onClick={async () => {
                          const approved = await confirm({ title: 'Excluir leitor RFID?', description: `O leitor ${reader.name} será removido.`, confirmLabel: 'Excluir', variant: 'destructive' });
                          if (approved) await remove(reader.id);
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
