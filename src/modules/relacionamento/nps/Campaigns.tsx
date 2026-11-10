import { useConfirm } from '@/shared/components/confirmContext';
import type { Tables } from '@/integrations/supabase/types';
import type { NPSCampaignInput } from './hooks/campaigns';
import { useState } from 'react';
import { useNPSCampaigns, useCreateCampaign, useUpdateCampaign, useDeleteCampaign } from './hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Textarea } from '@/ui/base/textarea';
import { Label } from '@/ui/base/label';
import { Badge } from '@/ui/base/badge';
import { Skeleton } from '@/ui/base/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/ui/base/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Plus, Trash2, Edit2, Play, Pause } from 'lucide-react';

export default function Campaigns() {
  const confirm = useConfirm();
  const { data: campaigns = [], isLoading } = useNPSCampaigns();
  const create = useCreateCampaign();
  const update = useUpdateCampaign();
  const del = useDeleteCampaign();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tables<'nps_campaigns'> | null>(null);
  const [form, setForm] = useState<NPSCampaignInput>({ name: '', description: '', title: 'Como avalia sua experiência?', subtitle: 'Sua opinião é essencial', message: '', primary_color: '#FF9800', survey_type: 'rnps', status: 'draft' });

  const openNew = () => { setEditing(null); setForm({ name: '', description: '', title: 'Como avalia sua experiência?', subtitle: 'Sua opinião é essencial', message: '', primary_color: '#FF9800', survey_type: 'rnps', status: 'draft' }); setOpen(true); };
  const openEdit = (c: Tables<'nps_campaigns'>) => { setEditing(c); setForm(c); setOpen(true); };

  const submit = () => {
    if (editing) update.mutate({ id: editing.id, ...form }, { onSuccess: () => setOpen(false) });
    else create.mutate(form, { onSuccess: () => setOpen(false) });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Campanhas</h2>
          <p className="text-sm text-muted-foreground">Crie e gerencie pesquisas NPS relacionais e transacionais.</p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" /> Nova campanha</Button>
      </div>

      {isLoading ? <Skeleton className="h-64" /> : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2 flex flex-row justify-between items-start">
                <div>
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{c.description}</p>
                </div>
                <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>{c.status}</Badge>
              </CardHeader>
              <CardContent className="flex justify-between items-center pt-2">
                <span className="text-xs text-muted-foreground">{c.survey_type}</span>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => update.mutate({ id: c.id, status: c.status === 'active' ? 'paused' : 'active' })}>
                    {c.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Edit2 className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={async () => { if (await confirm({ title: 'Excluir campanha?', description: 'A campanha será removida permanentemente.', confirmLabel: 'Excluir', variant: 'destructive' })) del.mutate(c.id); }}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {campaigns.length === 0 && <p className="col-span-full text-muted-foreground text-sm">Nenhuma campanha ainda. Crie a primeira.</p>}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Nova'} campanha</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="col-span-2"><Label>Descrição</Label><Textarea value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div><Label>Título</Label><Input value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Subtítulo</Label><Input value={form.subtitle ?? ''} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></div>
            <div className="col-span-2"><Label>Mensagem principal</Label><Textarea value={form.message ?? ''} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={2} /></div>
            <div><Label>Tipo</Label>
              <Select value={form.survey_type} onValueChange={(v) => setForm({ ...form, survey_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rnps">Relacional (rNPS)</SelectItem>
                  <SelectItem value="tnps">Transacional (tNPS)</SelectItem>
                  <SelectItem value="enps">Colaboradores (eNPS)</SelectItem>
                  <SelectItem value="custom">Personalizada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Cor</Label><Input type="color" value={form.primary_color ?? '#FF9800'} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} /></div>
            <div><Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="scheduled">Agendada</SelectItem>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="paused">Pausada</SelectItem>
                  <SelectItem value="ended">Encerrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Data início</Label><Input type="datetime-local" value={form.start_date?.slice(0, 16) ?? ''} onChange={(e) => setForm({ ...form, start_date: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
            <div><Label>Data fim</Label><Input type="datetime-local" value={form.end_date?.slice(0, 16) ?? ''} onChange={(e) => setForm({ ...form, end_date: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={!form.name}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
