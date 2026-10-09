/**
 * Fase 1 — Enterprise Drill-Down Drawer
 *
 * Global side-panel opened via `window.dispatchEvent(new CustomEvent('drilldown:open', { detail: { entityKey, value, delta, goal } }))`.
 * Provides tabs: Overview (AI + narrative), Data (recent rows), Timeline, Related, Logs.
 */
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/ui/base/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/base/tabs";
import { Badge } from "@/ui/base/badge";
import { supabase } from "@/integrations/supabase/client";
import { getEntity, type PublicTableName } from "@/core/entityRegistry";
import { DRILLDOWN_OPEN_EVENT, type DrillDownOpenPayload } from "./drillDownEvents";
import { AIInsightPanel } from "./AIInsightPanel";
import { Skeleton } from "@/ui/base/skeleton";
import { EmptyState } from "./EmptyState";
import { formatBRL } from "@/lib/formatters";
import { AuditTrailPanel } from "./AuditTrailPanel";
import { Database, ListTree, History } from "lucide-react";


/**
 * O nome da tabela é resolvido em runtime pelo entityRegistry; um único ponto
 * de acesso com superfície mínima evita a inferência profunda do supabase-js.
 */
type ListQuery = {
  select: (cols: string) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> };
};

const dynamicList = (table: PublicTableName) =>
  (supabase.from(table) as unknown as ListQuery).select("*").limit(20);

export function DrillDownDrawer() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<DrillDownOpenPayload | null>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent<DrillDownOpenPayload>).detail;
      if (!detail?.entityKey) return;
      setPayload(detail);
      setOpen(true);
    }
    window.addEventListener(DRILLDOWN_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(DRILLDOWN_OPEN_EVENT, onOpen);
  }, []);

  const entity = payload ? getEntity(payload.entityKey) : undefined;

  useEffect(() => {
    if (!open || !entity?.sourceTable) return;
    let cancelled = false;
    setLoadingRows(true);
    setRows(null);
    (async () => {
      try {
        const { data, error } = await dynamicList(entity.sourceTable);
        if (cancelled) return;
        if (error) throw error;
        setRows(data ?? []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, entity?.sourceTable]);

  if (!entity || !payload) return null;

  const displayValue =
    typeof payload.value === "number"
      ? entity.unit === "currency"
        ? formatBRL(payload.value)
        : entity.unit === "percent"
        ? `${payload.value.toFixed(1)}%`
        : payload.value.toLocaleString("pt-BR")
      : payload.value ?? "—";

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2">
            <SheetTitle>{entity.label}</SheetTitle>
            <Badge variant="outline" className="uppercase text-[10px]">
              {entity.agent}
            </Badge>
          </div>
          <SheetDescription>
            Valor atual:{" "}
            <strong className="text-foreground text-base tabular-nums">{displayValue}</strong>
            {payload.delta?.month != null && (
              <span className={payload.delta.month >= 0 ? " text-success" : " text-destructive"}>
                {" "}
                · {payload.delta.month >= 0 ? "▲" : "▼"} {Math.abs(payload.delta.month).toFixed(1)}% vs mês anterior
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="ai" className="mt-6">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="ai" className="text-xs">Análise IA</TabsTrigger>
            <TabsTrigger value="data" className="text-xs"><Database className="h-3 w-3 mr-1" />Dados</TabsTrigger>
            <TabsTrigger value="related" className="text-xs"><ListTree className="h-3 w-3 mr-1" />Relacionados</TabsTrigger>
            <TabsTrigger value="logs" className="text-xs"><History className="h-3 w-3 mr-1" />Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="mt-4">
            <AIInsightPanel
              entityKey={payload.entityKey}
              value={payload.value}
              delta={payload.delta}
              goal={payload.goal}
            />
          </TabsContent>

          <TabsContent value="data" className="mt-4">
            {loadingRows ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !rows || rows.length === 0 ? (
              <EmptyState
                icon={Database}
                title="Sem registros no período"
                description="Nenhum dado bruto disponível para este indicador."
              />
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {Object.keys(rows[0]).slice(0, 5).map((k) => (
                        <th key={k} className="text-left p-2 font-medium">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        {Object.keys(rows[0]).slice(0, 5).map((k) => (
                          <td key={k} className="p-2 truncate max-w-[150px]">
                            {r[k] != null ? String(r[k]).slice(0, 40) : "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="related" className="mt-4">
            {entity.related?.length ? (
              <ul className="space-y-2">
                {entity.related.map((r) => (
                  <li key={r.table} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-medium text-sm">{r.label}</p>
                      <p className="text-xs text-muted-foreground">Tabela: {r.table}</p>
                    </div>
                    <Badge variant="outline">FK: {r.fk}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={ListTree} title="Sem entidades relacionadas" description="Este indicador não possui outras entidades vinculadas." />
            )}
          </TabsContent>

          <TabsContent value="logs" className="mt-4">
            <AuditTrailPanel entityName={entity.sourceTable ?? payload.entityKey} limit={200} height={420} />

          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
