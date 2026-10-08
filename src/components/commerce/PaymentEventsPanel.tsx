import { useMemo, useState, useEffect } from "react";
import { CheckCircle2, X, Search, Inbox, ArrowUpDown } from "lucide-react";
import { Card, CardContent } from "@/ui/base/card";
import { Badge } from "@/ui/base/badge";
import { Button } from "@/ui/base/button";
import { Input } from "@/ui/base/input";
import { Label } from "@/ui/base/label";
import { Skeleton } from "@/ui/base/skeleton";
import { Separator } from "@/ui/base/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/base/select";
import { usePaymentEventsForStorefront } from "@/hooks/usePaymentEvents";
import { MultiSelectPopover, FilterChip } from "./payment-events/FilterControls";
import { EventItem } from "./payment-events/EventItem";
import { PaginationBar } from "./payment-events/PaginationBar";
import { WebhookInfoCard } from "./payment-events/WebhookInfoCard";

type SortKey = "created_at" | "provider";
type SortDir = "asc" | "desc";
const PER_PAGE_OPTIONS = [10, 25, 50, 100];

const STATUS_OPTIONS = [
  { value: "pending", label: "Pendente" },
  { value: "processing", label: "Processando" },
  { value: "paid", label: "Pago" },
  { value: "failed", label: "Falhou" },
  { value: "refunded", label: "Estornado" },
  { value: "expired", label: "Expirado" },
];

interface OrderLite { id: string; order_number: string; }
interface Props { storefrontId: string; orders: OrderLite[]; projectRef?: string; }

export function PaymentEventsPanel({ storefrontId, orders, projectRef }: Props) {
  const { data: events = [], isLoading } = usePaymentEventsForStorefront(storefrontId);
  const baseUrl = projectRef ? `https://${projectRef}.supabase.co` : String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
  const webhookUrl = `${baseUrl}/functions/v1/psp-webhook`;

  const [providers, setProviders] = useState<string[]>([]);
  const [statusBefore, setStatusBefore] = useState<string[]>([]);
  const [statusAfter, setStatusAfter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [orderQuery, setOrderQuery] = useState<string>("");
  const [sortPrimary, setSortPrimary] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const orderIdToNumber = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((o) => map.set(o.id, o.order_number));
    return map;
  }, [orders]);

  const availableProviders = useMemo(
    () => Array.from(new Set(events.map((e) => e.provider))).sort(),
    [events],
  );

  const filtered = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const toTs = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;

    return events.filter((e) => {
      if (providers.length > 0 && !providers.includes(e.provider)) return false;
      if (statusBefore.length > 0 && (!e.status_before || !statusBefore.includes(e.status_before))) return false;
      if (statusAfter.length > 0 && (!e.status_after || !statusAfter.includes(e.status_after))) return false;
      const ts = new Date(e.processed_at).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      if (q) {
        const orderNumber = e.order_id ? (orderIdToNumber.get(e.order_id) ?? "").toLowerCase() : "";
        const rawId = (e.order_id ?? "").toLowerCase();
        const ext = (e.external_id ?? "").toLowerCase();
        if (!orderNumber.includes(q) && !rawId.includes(q) && !ext.includes(q)) return false;
      }
      return true;
    });
  }, [events, providers, statusBefore, statusAfter, dateFrom, dateTo, orderQuery, orderIdToNumber]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: typeof arr[number], b: typeof arr[number], k: SortKey) => {
      if (k === "created_at") return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      return a.provider.localeCompare(b.provider, "pt-BR") * dir;
    };
    const secondary: SortKey = sortPrimary === "created_at" ? "provider" : "created_at";
    arr.sort((a, b) => cmp(a, b, sortPrimary) || cmp(a, b, secondary));
    return arr;
  }, [filtered, sortPrimary, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  useEffect(() => { if (page > totalPages) setPage(1); }, [page, totalPages]);
  useEffect(() => { setPage(1); }, [providers, statusBefore, statusAfter, dateFrom, dateTo, orderQuery, perPage, sortPrimary, sortDir]);

  const paginated = useMemo(() => sorted.slice((page - 1) * perPage, page * perPage), [sorted, page, perPage]);

  const activeFilters =
    providers.length + statusBefore.length + statusAfter.length +
    (dateFrom ? 1 : 0) + (dateTo ? 1 : 0) + (orderQuery.trim() ? 1 : 0);

  function clearFilters() {
    setProviders([]); setStatusBefore([]); setStatusAfter([]);
    setDateFrom(""); setDateTo(""); setOrderQuery("");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
      <WebhookInfoCard webhookUrl={webhookUrl} />

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h3 className="font-medium text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Eventos de pagamento
              <Badge variant="outline" className="text-xs">
                {sorted.length}{sorted.length !== events.length && ` / ${events.length}`}
              </Badge>
            </h3>
            {activeFilters > 0 && (
              <Button variant="ghost" size="xs" onClick={clearFilters} className="text-xs h-8">
                <X className="h-3 w-3 mr-1" /> Limpar
              </Button>
            )}
          </div>

          <div className="grid gap-2 md:grid-cols-2 mb-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Buscar por nº do pedido, ID ou external_id" value={orderQuery} onChange={(e) => setOrderQuery(e.target.value)} className="h-9 pl-7 text-xs" />
            </div>
            <div className="flex gap-2">
              <MultiSelectPopover label="Provedor" options={availableProviders.map((p) => ({ value: p, label: p }))} selected={providers} onChange={setProviders} />
              <MultiSelectPopover label="Status antes" options={STATUS_OPTIONS} selected={statusBefore} onChange={setStatusBefore} />
              <MultiSelectPopover label="Status depois" options={STATUS_OPTIONS} selected={statusAfter} onChange={setStatusAfter} />
            </div>
            <div className="flex items-center gap-2 md:col-span-2">
              <Label className="text-xs text-muted-foreground shrink-0">Período:</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-xs" max={dateTo || undefined} />
              <span className="text-xs text-muted-foreground">até</span>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-xs" min={dateFrom || undefined} />
            </div>
          </div>

          {activeFilters > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {providers.map((p) => <FilterChip key={`p-${p}`} label={`Provedor: ${p}`} onRemove={() => setProviders(providers.filter((x) => x !== p))} />)}
              {statusBefore.map((s) => <FilterChip key={`sb-${s}`} label={`Antes: ${s}`} onRemove={() => setStatusBefore(statusBefore.filter((x) => x !== s))} />)}
              {statusAfter.map((s) => <FilterChip key={`sa-${s}`} label={`Depois: ${s}`} onRemove={() => setStatusAfter(statusAfter.filter((x) => x !== s))} />)}
              {dateFrom && <FilterChip label={`De: ${dateFrom}`} onRemove={() => setDateFrom("")} />}
              {dateTo && <FilterChip label={`Até: ${dateTo}`} onRemove={() => setDateTo("")} />}
              {orderQuery.trim() && <FilterChip label={`Busca: ${orderQuery}`} onRemove={() => setOrderQuery("")} />}
            </div>
          )}

          <Separator className="mb-3" />

          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : events.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              Nenhum evento recebido ainda. Configure o webhook no seu PSP para começar.
            </p>
          ) : sorted.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <Inbox className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">Nenhum evento encontrado</p>
              <p className="text-xs text-muted-foreground">Não há eventos de pagamento que correspondam aos filtros selecionados.</p>
              <Button variant="outline" size="sm" onClick={clearFilters} className="mt-2">Limpar filtros</Button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap mb-3 text-xs">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs text-muted-foreground">Ordenar por:</Label>
                <Select value={sortPrimary} onValueChange={(v) => setSortPrimary(v as SortKey)}>
                  <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created_at">Data de criação</SelectItem>
                    <SelectItem value="provider">Provedor</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortDir} onValueChange={(v) => setSortDir(v as SortDir)}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Decrescente</SelectItem>
                    <SelectItem value="asc">Crescente</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-[10px] text-muted-foreground ml-1">
                  Secundário: {sortPrimary === "created_at" ? "provedor" : "data"}
                </span>
              </div>

              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {paginated.map((e) => (
                  <EventItem key={e.id} event={e} orderNumber={e.order_id ? orderIdToNumber.get(e.order_id) : null} />
                ))}
              </div>

              <PaginationBar
                page={page}
                totalPages={totalPages}
                perPage={perPage}
                total={sorted.length}
                perPageOptions={PER_PAGE_OPTIONS}
                onPageChange={setPage}
                onPerPageChange={setPerPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
