import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Checkbox } from '@/ui/base/checkbox';
import { Badge } from '@/ui/base/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Search, Send, RotateCcw } from 'lucide-react';
import { CHANNELS } from './options';
import type { ClientPickerRow } from './types';

interface GenerateInvitesDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channel: string;
  setChannel: (v: string) => void;
  expiresDays: number;
  setExpiresDays: (n: number) => void;
  search: string;
  setSearch: (s: string) => void;
  clients: ClientPickerRow[];
  selectedClients: Set<string>;
  setSelectedClients: (s: Set<string>) => void;
  toggleAllClientsVisible: (v: boolean) => void;
  submit: () => void;
  generating: boolean;
}

export function GenerateInvitesDialog({
  open, onOpenChange, channel, setChannel, expiresDays, setExpiresDays,
  search, setSearch, clients, selectedClients, setSelectedClients,
  toggleAllClientsVisible, submit, generating,
}: GenerateInvitesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Gerar convites</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Canal de envio</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNELS.map((c) => <SelectItem key={c.v} value={c.v}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Link válido por (dias)</Label>
              <Input type="number" min={1} max={365} value={expiresDays} onChange={(e) => setExpiresDays(Number(e.target.value) || 30)} />
            </div>
          </div>

          <div>
            <Label>Buscar cliente</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome do cliente…" className="pl-8" />
            </div>
          </div>

          {clients.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={clients.every((c) => selectedClients.has(c.id))}
                onCheckedChange={(v) => toggleAllClientsVisible(!!v)}
              />
              Selecionar todos os {clients.length} visíveis
            </label>
          )}

          <div className="max-h-64 overflow-y-auto border rounded">
            {clients.map((c) => {
              const hasEmail = !!c.email;
              const hasPhone = !!c.phone;
              const invalid = (channel === 'email' && !hasEmail) || ((channel === 'whatsapp' || channel === 'sms') && !hasPhone);
              return (
                <label key={c.id} className={`flex items-center gap-2 p-2 hover:bg-muted cursor-pointer border-b border-border last:border-0 ${invalid ? 'opacity-60' : ''}`}>
                  <Checkbox
                    checked={selectedClients.has(c.id)}
                    onCheckedChange={(v) => {
                      const next = new Set(selectedClients);
                      if (v) next.add(c.id);
                      else next.delete(c.id);
                      setSelectedClients(next);
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.email ?? '—'} · {c.phone ?? '—'} {c.address_city ? `· ${c.address_city}` : ''}
                    </div>
                  </div>
                  {invalid && <Badge variant="outline" className="text-xs">sem contato</Badge>}
                </label>
              );
            })}
            {clients.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
          </div>
          <p className="text-xs text-muted-foreground">
            {selectedClients.size} selecionado(s). Após gerar, você poderá copiar o link ou disparar pelo WhatsApp/e-mail direto da lista.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={selectedClients.size === 0 || generating}>
            {generating ? <RotateCcw className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Gerar {selectedClients.size} convite(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
