import { TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { cn } from "@/lib/utils";
import { RevenueBarChart } from "./utils";
import { brl } from "./currency";
import type { SuccessMonthlyRevenue, SuccessCashFlow90d } from "../types";

export function RevenueCashflowRow({ revenue12m, cashflow }: { revenue12m: SuccessMonthlyRevenue[]; cashflow: SuccessCashFlow90d }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" /> Faturamento últimos 12 meses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueBarChart data={revenue12m} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-primary" /> Fluxo previsto 90d
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[
            { label: "30 dias", inflow: cashflow.inflow_30, outflow: cashflow.outflow_30 },
            { label: "60 dias", inflow: cashflow.inflow_60, outflow: cashflow.outflow_60 },
            { label: "90 dias", inflow: cashflow.inflow_90, outflow: cashflow.outflow_90 },
          ].map((row) => (
            <div key={row.label} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-medium">{row.label}</span>
                <span className={cn("font-mono tabular-nums", (row.inflow - row.outflow) >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {brl(row.inflow - row.outflow)}
                </span>
              </div>
              <div className="flex gap-1 h-1.5">
                <div className="flex-1 rounded-full bg-emerald-500/20 overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (row.inflow / Math.max(row.inflow, row.outflow, 1)) * 100)}%` }} />
                </div>
                <div className="flex-1 rounded-full bg-red-500/20 overflow-hidden">
                  <div className="h-full bg-red-500" style={{ width: `${Math.min(100, (row.outflow / Math.max(row.inflow, row.outflow, 1)) * 100)}%` }} />
                </div>
              </div>
            </div>
          ))}
          <div className="pt-3 border-t text-xs space-y-1">
            <div className="flex justify-between text-red-500">
              <span>Inadimplência (AR)</span>
              <span className="font-mono">{brl(cashflow.overdue_ar)}</span>
            </div>
            <div className="flex justify-between text-amber-500">
              <span>Vencidos a pagar</span>
              <span className="font-mono">{brl(cashflow.overdue_ap)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
