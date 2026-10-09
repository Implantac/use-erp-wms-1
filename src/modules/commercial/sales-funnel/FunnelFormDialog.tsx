import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Textarea } from '@/ui/base/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { FUNNEL_STAGES } from '@/hooks/commercial/useSalesFunnel';

import type { FunnelFormData } from './formDefaults';

export function FunnelFormDialog({
  open, onOpenChange, formData, setFormData, editing, saving, onSave, clients, reps,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  formData: FunnelFormData;
  setFormData: (updater: (p: FunnelFormData) => FunnelFormData) => void;
  editing: boolean;
  saving: boolean;
  onSave: () => void;
  clients: Array<{ id: string; name: string }>;
  reps: Array<{ id: string; name: string }>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar Oportunidade' : 'Nova Oportunidade'}</DialogTitle>
          <DialogDescription>Preencha os dados da oportunidade</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Título *</Label><Input value={formData.title} onChange={e => setFormData(p => ({ ...p, title: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Etapa</Label>
              <Select value={formData.stage} onValueChange={v => setFormData(p => ({ ...p, stage: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FUNNEL_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Valor (R$)</Label><Input type="number" value={formData.value} onChange={e => setFormData(p => ({ ...p, value: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Probabilidade (%)</Label><Input type="number" min="0" max="100" value={formData.probability} onChange={e => setFormData(p => ({ ...p, probability: e.target.value }))} /></div>
            <div><Label>Previsão Fechamento</Label><Input type="date" value={formData.expected_close_date} onChange={e => setFormData(p => ({ ...p, expected_close_date: e.target.value }))} /></div>
          </div>
          <div>
            <Label>Cliente</Label>
            <Select value={formData.client_id} onValueChange={v => setFormData(p => ({ ...p, client_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Representante</Label>
            <Select value={formData.sales_rep_id} onValueChange={v => setFormData(p => ({ ...p, sales_rep_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>{reps.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Contato</Label><Input value={formData.contact_name} onChange={e => setFormData(p => ({ ...p, contact_name: e.target.value }))} /></div>
            <div><Label>Email</Label><Input value={formData.contact_email} onChange={e => setFormData(p => ({ ...p, contact_email: e.target.value }))} /></div>
            <div><Label>Telefone</Label><Input value={formData.contact_phone} onChange={e => setFormData(p => ({ ...p, contact_phone: e.target.value }))} /></div>
          </div>
          <div><Label>Origem</Label><Input value={formData.source} onChange={e => setFormData(p => ({ ...p, source: e.target.value }))} placeholder="Ex: Site, Indicação, Feira..." /></div>
          <div><Label>Descrição</Label><Textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} rows={2} /></div>
          <div><Label>Observações</Label><Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
