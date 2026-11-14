import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/ui/base/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/base/dialog';
import {
  INTERCOMPANY_RELEASE_OPERATIONAL_ENABLED, RELEASE_ACTIVATION_MESSAGE, formatReleaseQuantity,
  releasePresentation, type ReleasePresentationInput,
} from '@/lib/store/intercompanyRelease';
import { finalizeIntercompanyProduction } from '@/services/production/intercompanyReleaseService';

interface Props extends ReleasePresentationInput {
  canManage?: boolean; scopeToken: string | null; authorizationMessage?: string | null;
  onRefresh?: () => Promise<unknown>;
}
export function IntercompanyReleaseSummary(props: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const attempted = useRef(new Set<string>());
  const signature = JSON.stringify([props.scopeToken, props.requestId]);
  const currentRequest = useRef(signature); currentRequest.current = signature;
  useEffect(() => { setOpen(false); setMessage(null); setPending(false); setRefreshing(false); }, [signature]);
  const presentation = releasePresentation(props);
  const canReview = presentation.canReview && props.canManage === true && !!props.scopeToken;
  useEffect(() => { if (!canReview) setOpen(false); }, [canReview]);
  const release = props.release;

  async function refresh() {
    if (!props.onRefresh || refreshing) return;
    setRefreshing(true);
    try { await props.onRefresh(); }
    catch { if (currentRequest.current === signature) setMessage('Reconsulta não confirmada; ação permanece bloqueada.'); }
    finally { if (currentRequest.current === signature) setRefreshing(false); }
  }
  async function confirm() {
    // Deliberate source-level lock, NOT a fiscal flag or runtime/environment override.
    if (!INTERCOMPANY_RELEASE_OPERATIONAL_ENABLED || !canReview || inFlight.current || attempted.current.has(signature)) return;
    const token = props.scopeToken;
    inFlight.current = true; attempted.current.add(signature); setPending(true); setMessage(null);
    try {
      const result = await finalizeIntercompanyProduction(props.requestId);
      if (currentRequest.current !== signature) return;
      setMessage(result.idempotent_replay ? 'Disponibilização recuperada sem duplicação.' : 'Pedido pendente e reserva confirmados; fiscal e expedição bloqueados.');
    } catch {
      if (currentRequest.current === signature) setMessage('Resultado não confirmado. Reconsulte o lastro antes de qualquer nova decisão. Esta tela não reenviará a tentativa; timeout não comprova rollback.');
    } finally {
      inFlight.current = false;
      if (currentRequest.current === signature) setPending(false);
      // Re-reading may confirm a committed result. It never retries the mutation.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['intercompany-production-releases', token] }),
        queryClient.invalidateQueries({ queryKey: ['factory-inbox'] }),
        queryClient.invalidateQueries({ queryKey: ['group-requests'] }),
      ]);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-primary/20 p-3 text-xs" aria-label="Disponibilização da produção">
      <p role={['error', 'incompatible', 'inconsistent'].includes(presentation.kind) ? 'alert' : 'status'}>{presentation.label}</p>
      {release && presentation.kind === 'reserved' && (
        <dl className="grid gap-1 break-all sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Pedido vinculado (ID)</dt><dd>{release.sales_order_id}</dd></div>
          <div><dt className="text-muted-foreground">Lote produzido (ID)</dt><dd>{release.output_lot_id}</dd></div>
          <div><dt className="text-muted-foreground">Reservado</dt><dd>{formatReleaseQuantity(release.quantity, release.unit)}</dd></div>
          <div><dt className="text-muted-foreground">Gestor (ID) / registro</dt><dd>{release.released_by} · {new Date(release.released_at).toLocaleString('pt-BR')}</dd></div>
        </dl>
      )}
      {presentation.kind === 'awaiting' && <p className="text-muted-foreground">Nenhum lastro visível nesta leitura. RLS pode ocultar registros; isto não prova ausência global.</p>}
      {canReview && <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Ver disponibilização gerencial</Button>}
      {presentation.kind === 'awaiting' && !props.canManage && <p className="text-muted-foreground">Ação restrita a admin/manager com a indústria raiz ativa e papéis confirmados.</p>}
      {props.authorizationMessage && <p role="alert">{props.authorizationMessage}</p>}
      {props.onRefresh && props.scopeToken && <Button size="sm" variant="ghost" disabled={refreshing || pending || props.readState === 'loading'} onClick={() => void refresh()}>Reconsultar lastro (sem reenviar)</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disponibilizar produção</DialogTitle>
            <DialogDescription>Solicitação {props.requestId}. A ação cria pedido pendente e reserva o lote da conclusão vinculada; não baixa estoque nem libera fiscal/expedição.</DialogDescription>
          </DialogHeader>
          <p className="text-sm" role="status">{RELEASE_ACTIVATION_MESSAGE}</p>
          {message && <p role="status" className="text-sm">{message}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
            <Button disabled={!INTERCOMPANY_RELEASE_OPERATIONAL_ENABLED || !canReview || pending || attempted.current.has(signature)} onClick={() => void confirm()}>
              Criar pedido pendente e reserva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
