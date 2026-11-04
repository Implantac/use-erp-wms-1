import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Button } from "@/ui/base/button";
import { Badge } from "@/ui/base/badge";
import { Input } from "@/ui/base/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/ui/base/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui/base/table";
import { EmptyState } from "@/shared/components/EmptyState";
import { Search, Search as SearchIcon } from "lucide-react";
import { decisionMeta, type Decision, type Lot } from "./types";
import { formatFiberClassificationSummary } from "@/lib/wms/fiberReceipt";

export type FilterValue = "all" | "pending" | Decision;

export function LotsTable({
  lots,
  loading,
  search,
  onSearch,
  filter,
  onFilter,
  onInspect,
}: {
  lots: Lot[];
  loading: boolean;
  search: string;
  onSearch: (v: string) => void;
  filter: FilterValue;
  onFilter: (v: FilterValue) => void;
  onInspect: (lot: Lot) => void;
}) {
  const filtered = lots.filter((l) => {
    if (filter === "pending" && l.quality_status && l.quality_status !== "pending") return false;
    if (filter !== "all" && filter !== "pending" && l.quality_status !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        l.lot_number?.toLowerCase().includes(s) ||
        l.product_code?.toLowerCase().includes(s) ||
        l.product_name?.toLowerCase().includes(s) ||
        l.supplier?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <CardTitle>Lotes para Inspeção</CardTitle>
          <div className="flex gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                placeholder="Buscar lote, SKU, fornecedor…"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                className="pl-8 w-64"
                aria-label="Buscar lote"
              />
            </div>
            <Select value={filter} onValueChange={(v) => onFilter(v as FilterValue)}>
              <SelectTrigger className="w-40" aria-label="Filtrar por status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="approved">Aprovados</SelectItem>
                <SelectItem value="quarantine">Quarentena</SelectItem>
                <SelectItem value="rejected">Rejeitados</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            icon={SearchIcon}
            title="Nenhum lote encontrado"
            description="Ajuste os filtros ou aguarde novos lotes chegarem via recebimento."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="text-right">Qtde</TableHead>
                <TableHead>Validade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 100).map((l) => {
                const st = (l.quality_status ?? "pending") as Decision | "pending";
                const meta = st === "pending" ? null : decisionMeta[st];
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-xs">{l.lot_number}</TableCell>
                    <TableCell>
                      <div className="text-sm">{l.product_code}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">{l.product_name}</div>
                      {formatFiberClassificationSummary(l.fiber_classification) && (
                        <div className="text-xs text-muted-foreground truncate max-w-[240px]">
                          {formatFiberClassificationSummary(l.fiber_classification)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{l.supplier ?? "—"}</TableCell>
                    <TableCell className="text-right">{l.remaining_qty ?? l.quantity ?? 0}</TableCell>
                    <TableCell className="text-xs">{l.expiration_date ?? "—"}</TableCell>
                    <TableCell>
                      {meta ? (
                        <Badge className={meta.cls}>{meta.label}</Badge>
                      ) : (
                        <Badge variant="outline">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => onInspect(l)}>
                        Inspecionar
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
  );
}
