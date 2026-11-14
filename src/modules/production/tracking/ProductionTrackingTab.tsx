import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { Button } from '@/ui/base/button';
import { Card, CardContent } from '@/ui/base/card';
import { Input } from '@/ui/base/input';
import { Label } from '@/ui/base/label';
import { SECTOR_LABELS } from '@/lib/pcp/sectorProfiles';
import { productionOrderPriorityLabel, productionOrderStatusLabel, parseValidDueDate, getOrderOverdueDays } from '../productionOrders/orderPresentation';
import { allowedTrackingSectors, buildTrackingCsv, CANONICAL_SECTOR_NOTE, defaultTrackingFilters, displayTrackingNumber,
  SECTOR_KEYS, TRACKING_PAGE_SIZE, trackingPageSummary, trackingProgress, trackingQuantityIssues, type TrackingFilters } from './productionTrackingModel';
import { useProductionTracking } from './useProductionTracking';

const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
function dateLabel(value: string | null) {
  const date = parseValidDueDate(value);
  return date ? date.toLocaleDateString('pt-BR') : 'Não informada';
}

export function ProductionTrackingTab() {
  const context = useEnterprise();
  const token = JSON.stringify([context.userId, context.currentCompany?.id, context.currentBranch?.id, context.activeChannel]);
  const [selection, setSelection] = useState(() => ({ token, filters: defaultTrackingFilters(), page: 0 }));
  const [exportError, setExportError] = useState<string | null>(null);
  const current = selection.token === token ? selection : { token, filters: defaultTrackingFilters(), page: 0 };
  useEffect(() => { setSelection({ token, filters: defaultTrackingFilters(), page: 0 }); setExportError(null); }, [token]);
  const report = useProductionTracking(current.filters, current.page);
  const data = report.ready && !report.error && report.data?.contextKey === report.contextKey ? report.data : undefined;
  const allowed = report.access ? allowedTrackingSectors(report.access) : [];
  const sectorOptions = allowed ?? SECTOR_KEYS;
  const summary = data ? trackingPageSummary(data.rows) : null;
  function change<K extends keyof TrackingFilters>(key: K, value: TrackingFilters[K]) {
    setSelection({ token, filters: { ...current.filters, [key]: value }, page: 0 }); setExportError(null);
  }
  function changePage(page: number) { setSelection({ ...current, page }); setExportError(null); }

  function exportPage() {
    if (!data || !report.ready || report.error || report.refreshing || data.contextKey !== report.contextKey || !data.rows.length) return;
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([buildTrackingCsv(data.rows)], { type: 'text/csv;charset=utf-8;' }));
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `acompanhamento_OPs_pagina_${data.page + 1}_${current.filters.start}_${current.filters.end}.csv`;
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setExportError(null);
    } catch { setExportError('Não foi possível gerar o CSV. Nenhuma exportação foi confirmada.'); }
    finally { if (url) URL.revokeObjectURL(url); }
  }

  return (
    <section className="min-w-0 space-y-4" aria-label="Acompanhamento de produção">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-semibold">Acompanhamento de produção</h2>
          <p className="text-xs text-muted-foreground">Somente leitura. Quantidades registradas na OP, sem conciliação de estoque ou homologação operacional.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!report.ready || report.refreshing} onClick={() => void report.refresh()}>Atualizar leitura</Button>
          <Button variant="outline" disabled={!data?.rows.length || !!report.error || !report.ready || report.refreshing} onClick={exportPage}>Exportar página atual (CSV)</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Empresa: {context.currentCompany?.name || 'não selecionada'} · Unidade: {context.currentBranch?.name || 'recorte autorizado da empresa'} · Canal do contexto: {context.activeChannel}. A OP não possui filtro por coluna de canal neste relatório.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div><Label htmlFor="tracking-start">Criação da OP — início</Label><Input id="tracking-start" type="date" value={current.filters.start} onChange={e => change('start', e.target.value)} /></div>
        <div><Label htmlFor="tracking-end">Criação da OP — fim</Label><Input id="tracking-end" type="date" value={current.filters.end} onChange={e => change('end', e.target.value)} /></div>
        <div className="sm:col-span-2"><Label htmlFor="tracking-search">Buscar OP, SKU, produto ou cliente</Label><Input id="tracking-search" maxLength={120} value={current.filters.search} onChange={e => change('search', e.target.value)} /></div>
        <div><Label htmlFor="tracking-status">Status</Label><select id="tracking-status" className={selectClass} value={current.filters.status} onChange={e => change('status', e.target.value)}>
          <option value="all">Todos os status</option>{['draft', 'planned', 'waiting_material', 'in_progress', 'outsourced', 'paused', 'finishing', 'quality_check', 'completed', 'cancelled', 'canceled'].map(s => <option key={s} value={s}>{productionOrderStatusLabel(s)}</option>)}
        </select></div>
        <div><Label htmlFor="tracking-priority">Prioridade</Label><select id="tracking-priority" className={selectClass} value={current.filters.priority} onChange={e => change('priority', e.target.value)}>
          <option value="all">Todas</option>{['urgent', 'high', 'medium', 'low'].map(s => <option key={s} value={s}>{productionOrderPriorityLabel(s)}</option>)}
        </select></div>
        <div><Label htmlFor="tracking-sector">Setor canônico</Label><select id="tracking-sector" className={selectClass} value={current.filters.sector} onChange={e => change('sector', e.target.value as TrackingFilters['sector'])} disabled={!report.access}>
          <option value="all">Recorte autorizado</option>{sectorOptions.map(s => <option key={s} value={s}>{SECTOR_LABELS[s]}</option>)}
        </select></div>
        <div><Label htmlFor="tracking-branch">Unidade operacional</Label><select id="tracking-branch" className={selectClass} value={context.currentBranch?.id ?? current.filters.branchId ?? ''} disabled={!!context.currentBranch} onChange={e => change('branchId', e.target.value || null)}>
          {!context.currentBranch && <option value="">Recorte autorizado da empresa</option>}
          {context.allBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select></div>
      </div>
      <p className="text-xs text-muted-foreground">Filtros ativos: criação {current.filters.start || 'inválida'} a {current.filters.end || 'inválida'} · status {current.filters.status === 'all' ? 'todos' : productionOrderStatusLabel(current.filters.status)} · prioridade {current.filters.priority === 'all' ? 'todas' : productionOrderPriorityLabel(current.filters.priority)} · busca {current.filters.search || 'sem busca'} · fuso {Intl.DateTimeFormat().resolvedOptions().timeZone}.</p>
      {!report.ready && <p role="status">Selecione uma empresa e aguarde a resolução do contexto para consultar as OPs.</p>}
      {report.loading && <p role="status">Consultando acesso e OPs…</p>}
      {report.error && <p role="alert" className="text-sm text-destructive">{report.error instanceof Error ? report.error.message : 'Consulta indisponível.'} Os totais não estão confirmados.</p>}
      {exportError && <p role="alert" className="text-sm text-destructive">{exportError}</p>}
      {data && !report.error && <>
        {data.canonicalSectorScope && <p role="status" className="text-xs text-muted-foreground">{CANONICAL_SECTOR_NOTE}</p>}
        <p className="text-xs text-muted-foreground">Última leitura concluída: {new Date(data.loadedAt).toLocaleString('pt-BR')} · {data.rows.length} registros nesta página · {data.total === null ? 'total não apurado' : `${data.total} no recorte consultado`}.</p>
        {summary && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[['OPs nesta página', summary.total], ['Em produção nesta página', summary.inProgress], ['Concluídas nesta página', summary.completed], ['Atrasadas nesta página', summary.late]].map(([label, value]) => (
            <Card key={label}><CardContent className="p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></CardContent></Card>
          ))}
        </div>}
        <div className="max-w-full overflow-x-auto rounded-md border">
          <table className="w-full text-left text-sm">
            <caption className="p-2 text-left text-xs text-muted-foreground">Página {data.page + 1} · até {TRACKING_PAGE_SIZE} OPs. Produzido/planejado não representa eficiência, OEE ou qualidade aprovada.</caption>
            <thead className="bg-muted/40"><tr>{['OP / produto', 'Cliente / unidade', 'Setor / centro', 'Planejado', 'Produzido / rejeitado', 'Status / prioridade', 'Prazo / progresso', 'Ação'].map(h => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>{data.rows.map(row => {
              const progress = trackingProgress(row); const late = getOrderOverdueDays(row); const quantityIssues = trackingQuantityIssues(row);
              return <tr key={row.id} className="border-t align-top">
                <td className="p-3"><p className="font-medium">{row.order_number}</p><p>{row.product_code} — {row.product_name}</p></td>
                <td className="p-3"><p>{row.client_name || 'Não informado'}</p><p className="break-all text-xs text-muted-foreground">{context.allBranches.find(b => b.id === row.branch_id)?.name || row.branch_id || 'Unidade não informada'}</p></td>
                <td className="p-3"><p>{row.sector || 'Não informado'}</p><p className="text-xs text-muted-foreground">{row.work_center || 'Centro não informado'}</p></td>
                <td className="p-3 whitespace-nowrap">{displayTrackingNumber(row.quantity)} {row.unit || '(unidade não informada)'}</td>
                <td className="p-3"><p>{displayTrackingNumber(row.produced_quantity)} {row.unit}</p><p className="text-xs text-muted-foreground">Rejeitado: {row.rejected_quantity === null ? 'Não informado' : displayTrackingNumber(row.rejected_quantity)}</p>
                  {quantityIssues.length > 0 && <p role="alert" className="text-xs text-destructive">Conferir quantidades: {quantityIssues.join(' · ')}.</p>}</td>
                <td className="p-3"><p>{productionOrderStatusLabel(row.status)}</p><p className="text-xs text-muted-foreground">{productionOrderPriorityLabel(row.priority)}</p></td>
                <td className="p-3"><p>{dateLabel(row.due_date)}{late > 0 ? ` · ${late}d de atraso` : ''}</p><p className="text-xs">{progress.label}</p><p className="text-xs text-muted-foreground">Início: {dateLabel(row.start_date)} · conclusão: {dateLabel(row.completed_date)}</p></td>
                <td className="p-3"><Button variant="outline" size="sm" asChild><Link to={`/producao/ordens?q=${encodeURIComponent(row.order_number)}`}>Abrir OP</Link></Button></td>
              </tr>;
            })}</tbody>
          </table>
          {!data.rows.length && <p className="p-4 text-sm">{data.total === 0 ? 'Nenhuma OP no recorte consultado.' : 'Página sem resultados; ajuste os filtros ou volte uma página.'}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" disabled={data.page === 0 || report.refreshing} onClick={() => changePage(data.page - 1)}>Página anterior</Button>
          <p className="text-xs text-muted-foreground">Exportação limitada explicitamente à página exibida.</p>
          <Button variant="outline" disabled={!data.hasNext || report.refreshing} onClick={() => changePage(data.page + 1)}>Próxima página</Button>
        </div>
      </>}
    </section>
  );
}
