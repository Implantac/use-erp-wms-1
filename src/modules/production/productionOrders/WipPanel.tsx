import { useEffect, useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { Badge } from "@/ui/base/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/base/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/ui/base/table";
import { buildWipPanel, type WipOrderInput } from "@/lib/pcp/wipPanel";
import { fetchWipSteps } from "@/services/production/wipPanel";
import { formatNumber } from "@/lib/formatters";
import { productionOrderStatusLabel } from "./orderPresentation";

function ageVariant(ageDays: number): "default" | "secondary" | "destructive" | "outline" {
  if (ageDays > 15) return "destructive";
  if (ageDays > 7) return "secondary";
  return "outline";
}

export function WipPanel({
  orders,
  noun,
  onOpenOrder,
}: {
  orders: Array<WipOrderInput & { company_id: string }>;
  noun: string;
  onOpenOrder: (orderId: string) => void;
}) {
  const [stepsVersion, setStepsVersion] = useState<{ key: string; steps: Awaited<ReturnType<typeof fetchWipSteps>> }>({ key: "", steps: [] });
  const [loadError, setLoadError] = useState(false);

  const openOrders = useMemo(
    () => orders.filter((order) => !["completed", "cancelled", "canceled"].includes(order.status.toLowerCase())),
    [orders],
  );
  const orderKey = openOrders.map((order) => order.id).join(",");
  const companyId = openOrders[0]?.company_id ?? null;

  useEffect(() => {
    if (!companyId || openOrders.length === 0) {
      setStepsVersion({ key: orderKey, steps: [] });
      return;
    }
    let cancelled = false;
    fetchWipSteps(companyId, openOrders.map((order) => order.id))
      .then((steps) => { if (!cancelled) { setStepsVersion({ key: orderKey, steps }); setLoadError(false); } })
      .catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; };
    // orderKey/companyId resumem a lista; openOrders é derivado deles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, orderKey]);

  const panel = useMemo(
    () => buildWipPanel(openOrders, stepsVersion.key === orderKey ? stepsVersion.steps : [], Date.now()),
    [openOrders, orderKey, stepsVersion],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock3 className="h-4 w-4" /> Trabalho em processo (WIP) da {noun}
        </CardTitle>
        <CardDescription>
          OPs abertas por etapa atual do roteiro e idade real da ordem. A etapa atual é a primeira não
          concluída; idade e permanência são contadas das datas gravadas — nada é estimado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <p role="alert" className="text-sm text-destructive">Falha ao carregar as etapas das OPs; o WIP por etapa não pôde ser montado.</p>
        ) : panel.totalOpen === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma OP aberta de {noun} neste momento.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {panel.byStep.map((group) => (
                <Badge key={group.stepName} variant="secondary">
                  {group.stepName}: {group.orders} OP(s) · mais antiga há {group.oldestAgeDays} dia(s)
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {panel.byBucket.map((item) => (
                <Badge key={item.bucket} variant="outline">{item.bucket}: {item.orders} OP(s)</Badge>
              ))}
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>OP</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Etapa atual</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Na etapa há</TableHead>
                  <TableHead className="text-right">Idade da OP</TableHead>
                  <TableHead className="text-right">Restante</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {panel.rows.map((row) => (
                  <TableRow key={row.orderId} className="cursor-pointer" onClick={() => onOpenOrder(row.orderId)}>
                    <TableCell className="font-medium">{row.orderNumber}</TableCell>
                    <TableCell>{row.productName}</TableCell>
                    <TableCell>{row.currentStepName}{row.currentStepSector ? <span className="text-xs text-muted-foreground"> · {row.currentStepSector}</span> : null}</TableCell>
                    <TableCell>{productionOrderStatusLabel(row.status)}</TableCell>
                    <TableCell className="text-right">{row.daysInCurrentStep} dia(s)</TableCell>
                    <TableCell className="text-right"><Badge variant={ageVariant(row.ageDays)}>{row.ageDays} dia(s)</Badge></TableCell>
                    <TableCell className="text-right">{formatNumber(row.remainingQty)} {row.unit}</TableCell>
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
