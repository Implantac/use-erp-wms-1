import { useEffect, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import { Badge } from "@/ui/base/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/base/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui/base/table";
import type { ProductionOrderRow } from "@/hooks/production/useProductionOrders";
import type { TextileBomLine } from "@/hooks/production/useTextilePcpData";
import { buildOrderCostComparison, type ConsumptionCostLine } from "@/lib/pcp/orderCostComparison";
import { fetchComponentReferenceCosts, fetchOrderConsumptions } from "@/services/production/orderCosts";
import { formatBRL, formatNumber } from "@/lib/formatters";

export function OrderCostPanel({ order, bomLines }: { order: ProductionOrderRow; bomLines: TextileBomLine[] }) {
  const [consumptions, setConsumptions] = useState<ConsumptionCostLine[]>([]);
  const [referenceCosts, setReferenceCosts] = useState<Map<string, number | null>>(new Map());
  const [loadError, setLoadError] = useState(false);

  const componentIds = useMemo(() => bomLines.map((line) => line.componentId), [bomLines]);
  const componentKey = componentIds.join(",");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchOrderConsumptions(order.id),
      fetchComponentReferenceCosts(order.company_id, componentIds),
    ])
      .then(([rows, costs]) => {
        if (cancelled) return;
        setConsumptions(rows);
        setReferenceCosts(costs);
        setLoadError(false);
      })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
    // componentKey resume a ficha; componentIds é derivado dela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id, order.company_id, componentKey]);

  const comparison = useMemo(() => buildOrderCostComparison({
    plannedQuantity: order.quantity,
    bomLines: bomLines.map((line) => ({
      componentCode: line.componentCode,
      componentName: line.componentName,
      quantityPerUnit: line.quantity,
      wastePercentage: line.wastePercentage,
      referenceCost: referenceCosts.get(line.componentId) ?? null,
    })),
    consumptions,
  }), [order.quantity, bomLines, referenceCosts, consumptions]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4" /> Custo previsto × real de materiais desta OP
        </CardTitle>
        <CardDescription>
          Previsto = ficha (quantidade × perda) × custo de referência cadastrado do componente.
          Real = consumo registrado × custo do lote consumido. Sem custo cadastrado, o item fica
          de fora e o total é marcado como parcial — nenhum custo é estimado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <p role="alert" className="text-sm text-destructive">Falha ao carregar consumos/custos; o confronto não pôde ser montado.</p>
        ) : comparison.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem ficha de materiais para esta OP; não há previsto para confrontar.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                Previsto: {comparison.plannedCoverage === "none" ? "sem custo de referência" : formatBRL(comparison.plannedTotal)}
                {comparison.plannedCoverage === "partial" ? " (parcial)" : ""}
              </Badge>
              <Badge variant="secondary">
                Real: {comparison.hasActual ? formatBRL(comparison.actualTotal) : "sem consumo registrado"}
                {comparison.hasActual && !comparison.actualCostComplete ? " (incompleto)" : ""}
              </Badge>
              {comparison.variance !== null && comparison.variancePct !== null ? (
                <Badge variant={comparison.variance > 0 ? "destructive" : "default"}>
                  Variação: {formatBRL(comparison.variance)} ({comparison.variancePct > 0 ? "+" : ""}{formatNumber(comparison.variancePct)}%)
                </Badge>
              ) : (
                <Badge variant="outline">Variação: aguardando previsto completo e consumo real</Badge>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Componente</TableHead>
                  <TableHead className="text-right">Qtd. prevista</TableHead>
                  <TableHead className="text-right">Custo previsto</TableHead>
                  <TableHead className="text-right">Qtd. real</TableHead>
                  <TableHead className="text-right">Custo real</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.lines.map((line) => (
                  <TableRow key={line.componentCode}>
                    <TableCell>
                      <span className="font-medium">{line.componentCode}</span>
                      <span className="block text-xs text-muted-foreground">{line.componentName}</span>
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(line.plannedQty)}</TableCell>
                    <TableCell className="text-right">
                      {line.plannedCost !== null ? formatBRL(line.plannedCost) : <span className="text-xs text-muted-foreground">sem custo de referência</span>}
                    </TableCell>
                    <TableCell className="text-right">{line.actualQty > 0 ? formatNumber(line.actualQty) : "—"}</TableCell>
                    <TableCell className="text-right">
                      {line.actualCost !== null ? formatBRL(line.actualCost) : <span className="text-xs text-muted-foreground">{line.actualQty > 0 ? "sem custo do lote" : "sem consumo"}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
