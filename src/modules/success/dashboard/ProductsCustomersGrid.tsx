import { Link } from "react-router-dom";
import {
  Snowflake, Sparkles, Flame, Layers, Users, Truck, AlertTriangle, ChevronRight,
} from "lucide-react";
import { Badge } from "@/ui/base/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { cn } from "@/lib/utils";
import { brl } from "./currency";
import type { SuccessData } from "../types";

type ProductsCustomersGridProps = Pick<
  SuccessData,
  "slowMoving" | "topMargin" | "bestSellers" | "subcategoryStock" | "topCustomers" | "topSuppliers" | "delinquents" | "totals"
>;

export function ProductsCustomersGrid({
  slowMoving, topMargin, bestSellers, subcategoryStock, topCustomers, topSuppliers, delinquents, totals,
}: ProductsCustomersGridProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Produtos sem giro */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <Link to="/success/produtos/sem-giro" className="group inline-flex items-center gap-1.5 hover:underline underline-offset-4">
              <CardTitle className="flex items-center gap-2 text-base group-hover:text-primary transition-colors">
                <Snowflake className="h-4 w-4 text-amber-500" /> Produtos sem giro
              </CardTitle>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
            <Badge variant="outline" className="text-[10px]">
              {totals.stagnantSkuCount} SKUs · {brl(totals.stagnantCapital)}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">0 vendas nos últimos 90 dias · ordenado por capital imobilizado · <Link to="/success/produtos/sem-giro" className="text-primary hover:underline">ver todos</Link></p>
        </CardHeader>
        <CardContent className="space-y-2">
          {slowMoving.length === 0 && <p className="text-sm text-muted-foreground">Todos os SKUs venderam nos últimos 90 dias. 🎉</p>}
          {slowMoving.map((p) => (
            <div key={p.product_code} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.product_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {p.product_code} · estoque {p.quantity.toLocaleString("pt-BR")} {p.unit} · margem {p.margin_pct}%
                </p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="font-mono font-semibold text-amber-500">{brl(p.capital_locked)}</p>
                <p className="text-[10px] text-muted-foreground">capital parado</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Top margem */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-emerald-500" /> Produtos com maior margem
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">Ranking por lucro real gerado (margem × vendas 90d)</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {topMargin.length === 0 && <p className="text-sm text-muted-foreground">Sem vendas nos últimos 90 dias.</p>}
          {topMargin.map((p) => (
            <div key={p.product_code} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.product_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {p.product_code} · vendeu {p.sold_last_90d} un · {brl(p.revenue_last_90d)}
                </p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="font-mono font-semibold text-emerald-500">{p.margin_pct}%</p>
                <p className="text-[10px] text-muted-foreground">margem</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Best sellers */}
      <Card>
        <CardHeader className="pb-3">
          <Link to="/success/produtos/mais-vendidos" className="group inline-flex items-center gap-1.5 hover:underline underline-offset-4">
            <CardTitle className="flex items-center gap-2 text-base group-hover:text-primary transition-colors">
              <Flame className="h-4 w-4 text-red-500" /> Mais vendidos (90d)
            </CardTitle>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
          <p className="text-[11px] text-muted-foreground">Produtos que puxam o faturamento · <Link to="/success/produtos/mais-vendidos" className="text-primary hover:underline">ver todos</Link></p>
        </CardHeader>
        <CardContent className="space-y-2">
          {bestSellers.length === 0 && <p className="text-sm text-muted-foreground">Sem vendas.</p>}
          {bestSellers.map((p) => (
            <div key={p.product_code} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.product_name}</p>
                <p className="text-[11px] text-muted-foreground">{p.product_code} · {p.sold_last_90d} un vendidas</p>
              </div>
              <p className="font-mono font-semibold text-right shrink-0 ml-3">{brl(p.revenue_last_90d)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Estoque por família */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-primary" /> Estoque por família
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">Giro e estagnação por categoria de confecção</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {subcategoryStock.slice(0, 6).map((s) => (
            <div key={s.subcategory} className="border-b last:border-0 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{s.subcategory}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{brl(s.capital_locked)}</p>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{s.skus} SKUs · {s.stock_qty.toLocaleString("pt-BR")} un · vendeu {s.sold_90d}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-mono",
                    s.stagnation_pct >= 40 ? "border-amber-500/40 text-amber-500" :
                    s.stagnation_pct >= 20 ? "border-blue-500/40 text-blue-500" :
                    "border-emerald-500/40 text-emerald-500"
                  )}
                >
                  {s.stagnation_pct}% parado
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Melhores clientes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" /> Melhores clientes
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">Volume de compra nos últimos 12 meses</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {topCustomers.map((c) => {
            const inactive = (c.last_purchase_days ?? 0) > 60;
            return (
              <div key={c.client_id ?? c.client_name} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.client_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.orders} pedido(s)
                    {c.last_purchase_days != null && (
                      <span className={cn(" · ", inactive ? "text-amber-500" : "text-muted-foreground")}>
                        {inactive ? `⚠ ${c.last_purchase_days}d sem comprar` : `há ${c.last_purchase_days}d`}
                      </span>
                    )}
                  </p>
                </div>
                <p className="font-mono font-semibold text-right shrink-0 ml-3">{brl(c.total)}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Top fornecedores */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Truck className="h-4 w-4 text-primary" /> Top fornecedores (90d)
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">Concentração de compras · economia potencial renegociando 5%</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {topSuppliers.length === 0 && <p className="text-sm text-muted-foreground">Sem ordens de compra nos últimos 90d.</p>}
          {topSuppliers.map((s) => (
            <div key={s.supplier_name} className="border-b last:border-0 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate font-medium">{s.supplier_name}</p>
                <p className="font-mono font-semibold">{brl(s.spend_90d)}</p>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{s.orders} pedido(s) · {s.share_pct}% do total</span>
                <span className="text-emerald-500">Economia ≈ {brl(s.potential_savings)}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Inadimplentes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-red-500" /> Clientes inadimplentes
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">Contas vencidas · priorize acima de 30 dias</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {delinquents.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum vencido. 🎉</p>
          )}
          {delinquents.map((d, i) => (
            <div key={i} className="flex items-center justify-between border-b last:border-0 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.client_name}</p>
                <p className="text-[11px] text-muted-foreground">{d.invoice} · {d.days_overdue}d atraso</p>
              </div>
              <p className="font-mono font-semibold text-red-500 text-right shrink-0 ml-3">{brl(d.amount)}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
