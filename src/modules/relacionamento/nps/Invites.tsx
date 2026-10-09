import { useEffect, useMemo, useState } from 'react';
import { useNPSCampaigns, useNPSInvites, useGenerateInvites } from './hooks';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { Skeleton } from '@/ui/base/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/base/select';
import { Send, Copy, Mail, Search, Trash2, Download } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeDialog } from './QRCodeDialog';
import { useConfirm } from '@/shared/components/confirmContext';
import { KPI, type BulkResult } from './invites/parts';
import { CHANNELS, PAGE_SIZE } from './invites/options';
import { useTokensMap } from './invites/useTokensMap';
import { InvitesTable } from './invites/InvitesTable';
import { GenerateInvitesDialog } from './invites/GenerateInvitesDialog';
import { BulkResultDialog } from './invites/BulkResultDialog';
import { useInvitesFilters } from './invites/useInvitesFilters';
import { useInvitesActions } from './invites/useInvitesActions';

export default function Invites() {
  const { data: campaigns = [], isLoading: campaignsLoading } = useNPSCampaigns();
  const [campaignId, setCampaignId] = useState<string | undefined>();
  useEffect(() => {
    if (!campaignId && campaigns.length > 0) setCampaignId(campaigns[0].id);
  }, [campaigns, campaignId]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [textFilter, setTextFilter] = useState('');
  const [page, setPage] = useState(1);
  const { data: invites = [], isLoading } = useNPSInvites(campaignId);
  const generate = useGenerateInvites();
  const { currentCompany } = useEnterprise();
  const activeCompanyId = currentCompany?.id;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState('link');
  const [expiresDays, setExpiresDays] = useState<number>(30);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const [selectedInvites, setSelectedInvites] = useState<Set<string>>(new Set());
  const [bulkResult, setBulkResult] = useState<BulkResult>(null);
  const confirm = useConfirm();

  const { data: clients = [] } = useQuery({
    queryKey: ['nps', 'clients-picker', activeCompanyId, search],
    enabled: !!activeCompanyId && open,
    queryFn: async () => {
      const { data } = await supabase
        .from('clients')
        .select('id,name,email,phone,address_city,segment')
        .eq('company_id', activeCompanyId)
        .ilike('name', `%${search}%`)
        .limit(50);
      return data ?? [];
    },
  });

  const { filteredInvites, totalPages, currentPage, pageInvites, stats } = useInvitesFilters(
    invites, statusFilter, channelFilter, textFilter, page,
  );

  const tokensByInvite = useTokensMap(pageInvites);

  const { revoke, sendInvites, resend, shareUrl, copyAllLinks, exportCsv, inviteNameById } =
    useInvitesActions(invites, setBulkResult, setSelectedInvites);

  const submit = () => {
    if (!campaignId || selectedClients.size === 0) return;
    generate.mutate(
      { campaign_id: campaignId, client_ids: Array.from(selectedClients), channel, expires_in_days: expiresDays },
      { onSuccess: () => { setOpen(false); setSelectedClients(new Set()); } },
    );
  };

  const toggleAllClientsVisible = (checked: boolean) => {
    const s = new Set(selectedClients);
    clients.forEach((c) => { if (checked) s.add(c.id); else s.delete(c.id); });
    setSelectedClients(s);
  };

  const togglePageSelection = (checked: boolean) => {
    const s = new Set(selectedInvites);
    pageInvites.forEach((i) => { if (checked) s.add(i.id); else s.delete(i.id); });
    setSelectedInvites(s);
  };

  const selectedSendable = Array.from(selectedInvites).filter((id) => {
    const inv = filteredInvites.find((i) => i.id === id);
    return inv && ['pending', 'failed', 'bounced'].includes(inv.status) && inv.channel === 'email';
  });

  const confirmSendBulk = async () => {
    if (selectedSendable.length === 0) return;
    const ok = await confirm({
      title: `Enviar ${selectedSendable.length} convite(s) por e-mail?`,
      description: 'Os convites elegíveis (pendentes ou com falha, canal e-mail) serão disparados agora.',
      confirmLabel: 'Enviar',
    });
    if (ok) sendInvites.mutate(selectedSendable);
  };

  const confirmRevokeBulk = async () => {
    const ids = Array.from(selectedInvites);
    if (ids.length === 0) return;
    const ok = await confirm({
      title: `Revogar ${ids.length} convite(s)?`,
      description: 'Links revogados deixam de aceitar respostas. Esta ação não pode ser desfeita.',
      confirmLabel: 'Revogar',
      variant: 'destructive',
    });
    if (ok) revoke.mutate(ids);
  };

  const confirmRevokeOne = async (id: string) => {
    const ok = await confirm({
      title: 'Revogar convite?',
      description: `O link enviado para ${inviteNameById(id)} deixará de funcionar.`,
      confirmLabel: 'Revogar',
      variant: 'destructive',
    });
    if (ok) revoke.mutate([id]);
  };

  const allPageChecked = pageInvites.length > 0 && pageInvites.every((i) => selectedInvites.has(i.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <div>
          <h2 className="text-lg font-semibold">Convites</h2>
          <p className="text-sm text-muted-foreground">Envie a pesquisa por link, e-mail, WhatsApp, SMS ou QR Code.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportCsv(filteredInvites)}><Download className="mr-2 h-4 w-4" /> Exportar CSV</Button>
          <Button variant="outline" size="sm" onClick={async () => {
            const ok = await confirm({ title: 'Enviar todos os convites pendentes?', description: 'Serão disparados até 50 convites por vez.', confirmLabel: 'Enviar' });
            if (ok) sendInvites.mutate(undefined);
          }} disabled={sendInvites.isPending}>
            <Mail className="mr-2 h-4 w-4" /> Enviar pendentes
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (!campaignId) {
                toast.error(campaigns.length === 0 ? 'Crie uma campanha antes de gerar convites.' : 'Selecione uma campanha.');
                return;
              }
              setOpen(true);
            }}
            disabled={campaignsLoading}
            title={campaigns.length === 0 ? 'Crie uma campanha primeiro' : undefined}
          >
            <Send className="mr-2 h-4 w-4" /> Gerar convites
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <KPI label="Total" value={stats.total} />
        <KPI label="Enviados" value={stats.sent} tone="default" />
        <KPI label="Abertos" value={stats.opened} sub={`${stats.openRate}%`} tone="info" />
        <KPI label="Respondidos" value={stats.responded} sub={`${stats.responseRate}%`} tone="success" />
        <KPI label="Pendentes" value={stats.pending} tone="warn" />
        <KPI label="Falhas" value={stats.bounced} tone="danger" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <Label>Campanha</Label>
          <Select value={campaignId} onValueChange={(v) => { setCampaignId(v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="sent">Enviado</SelectItem>
              <SelectItem value="opened">Aberto</SelectItem>
              <SelectItem value="responded">Respondido</SelectItem>
              <SelectItem value="bounced">Falha</SelectItem>
              <SelectItem value="revoked">Revogado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Canal</Label>
          <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v); setPage(1); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {CHANNELS.map((c) => <SelectItem key={c.v} value={c.v}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Buscar</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={textFilter} onChange={(e) => { setTextFilter(e.target.value); setPage(1); }} placeholder="Cliente, e-mail ou telefone" className="pl-8" />
          </div>
        </div>
      </div>

      {selectedInvites.size > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <span>{selectedInvites.size} selecionado(s)</span>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => copyAllLinks(selectedInvites)}><Copy className="mr-2 h-3.5 w-3.5" /> Copiar links</Button>
            <Button size="sm" variant="outline" onClick={confirmSendBulk} disabled={selectedSendable.length === 0 || sendInvites.isPending}>
              <Mail className="mr-2 h-3.5 w-3.5" /> Enviar por e-mail ({selectedSendable.length})
            </Button>
            <Button size="sm" variant="outline" onClick={confirmRevokeBulk} disabled={revoke.isPending}>
              <Trash2 className="mr-2 h-3.5 w-3.5 text-red-500" /> Revogar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedInvites(new Set())}>Limpar</Button>
          </div>
        </div>
      )}

      {isLoading ? <Skeleton className="h-64" /> : (
        <InvitesTable
          pageInvites={pageInvites}
          filteredInvites={filteredInvites}
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={PAGE_SIZE}
          campaignId={campaignId}
          tokensByInvite={tokensByInvite}
          selectedInvites={selectedInvites}
          setSelectedInvites={setSelectedInvites}
          allPageChecked={allPageChecked}
          togglePageSelection={togglePageSelection}
          setQrUrl={(u) => setQrUrl(u)}
          shareUrl={shareUrl}
          resendMutate={(id) => resend.mutate(id)}
          resendPending={resend.isPending}
          confirmRevokeOne={confirmRevokeOne}
          setPage={setPage}
        />
      )}

      <GenerateInvitesDialog
        open={open}
        onOpenChange={setOpen}
        channel={channel}
        setChannel={setChannel}
        expiresDays={expiresDays}
        setExpiresDays={setExpiresDays}
        search={search}
        setSearch={setSearch}
        clients={clients}
        selectedClients={selectedClients}
        setSelectedClients={setSelectedClients}
        toggleAllClientsVisible={toggleAllClientsVisible}
        submit={submit}
        generating={generate.isPending}
      />

      <QRCodeDialog open={!!qrUrl} onOpenChange={(v) => !v && setQrUrl(null)} url={qrUrl ?? ''} />

      <BulkResultDialog bulkResult={bulkResult} onClose={() => setBulkResult(null)} />
    </div>
  );
}
