import { TrendingUp, Wallet, Users, ShoppingCart } from "lucide-react";
import { Card, CardContent } from "@/ui/base/card";
import { cn } from "@/lib/utils";
import { brl } from "./currency";
import type { SuccessData, SuccessCashFlow90d } from "../types";

export function KpiRow({ totals, cashflow }: { totals: SuccessData["totals"]; cashflow: SuccessCashFlow90d }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">Receita 12m</p>
            <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <p className="text-xl font-bold tabular-nums">{brl(totals.revenueYTD)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">Fluxo 90d</p>
            <Wallet className={cn("h-3.5 w-3.5", cashflow.net >= 0 ? "text-emerald-500" : "text-red-500")} />
          </div>
          <p className={cn("text-xl font-bold tabular-nums", cashflow.net < 0 && "text-red-500")}>
            {brl(cashflow.net)}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">Clientes ativos</p>
            <Users className="h-3.5 w-3.5 text-primary" />
          </div>
          <p className="text-xl font-bold tabular-nums">{totals.activeCustomers}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">Pedidos abertos</p>
            <ShoppingCart className="h-3.5 w-3.5 text-primary" />
          </div>
          <p className="text-xl font-bold tabular-nums">{totals.ordersOpen}</p>
        </CardContent>
      </Card>
    </div>
  );
}
