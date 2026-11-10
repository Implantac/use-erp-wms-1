import { useState } from "react";
import { usePurchaseApprovalMetrics } from "@/hooks/purchasing/usePurchaseApprovalMetrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Badge } from "@/ui/base/badge";
import { Button } from "@/ui/base/button";
import { Skeleton } from "@/ui/base/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/ui/base/table";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Activity, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";

const currency = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);

export default function PurchaseApprovalsMetrics() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = usePurchaseApprovalMetrics(days);

  if (isLoading) {
    return (
      <main className="space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-8 w-80" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </main>
    );
  }

  const totals = data?.totals ?? {
    total: 0, pending: 0, approved: 0, rejected: 0,
    breached: 0, breach_rate: 0, avg_lead_time_hours: 0,
  };

  return (
    <main className="space-y-6 p-6" aria-label="Indicadores de aprovações de compras">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Indicadores de Aprovações</h1>
          <p className="text-sm text-muted-foreground">
            Últimos {days} dias · lead time, breach de SLA e ranking
          </p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? "default" : "outline"}
              onClick={() => setDays(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{totals.total}</p>
              </div>
              <Activity className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="mt-2 flex gap-2 text-xs">
              <Badge variant="outline">{totals.pending} pend.</Badge>
              <Badge variant="outline">{totals.approved} aprov.</Badge>
              <Badge variant="outline">{totals.rejected} rej.</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Lead Time Médio</p>
                <p className="text-2xl font-bold">
                  {totals.avg_lead_time_hours.toFixed(1)}h
                </p>
              </div>
              <Clock className="h-5 w-5 text-info" aria-hidden />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Da submissão à decisão</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Taxa de Breach</p>
                <p className="text-2xl font-bold">{totals.breach_rate.toFixed(1)}%</p>
              </div>
              <AlertTriangle
                className={`h-5 w-5 ${totals.breach_rate > 20 ? "text-destructive" : "text-warning-text"}`}
                aria-hidden
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {totals.breached} vencidas de {totals.total}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Aprovação Líquida</p>
                <p className="text-2xl font-bold">
                  {totals.total > 0
                    ? ((totals.approved / totals.total) * 100).toFixed(0)
                    : 0}%
                </p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {totals.rejected > 0 && (
                <span className="inline-flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-destructive" /> {totals.rejected} rejeições
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evolução Diária</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.timeline ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="submitted" stroke="hsl(var(--primary))" name="Submetidas" />
                <Line type="monotone" dataKey="approved" stroke="hsl(var(--success))" name="Aprovadas" />
                <Line type="monotone" dataKey="rejected" stroke="hsl(var(--destructive))" name="Rejeitadas" />
                <Line type="monotone" dataKey="breached" stroke="hsl(var(--warning))" name="Vencidas" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranking por Aprovador</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aprovador</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Aprov.</TableHead>
                  <TableHead className="text-right">Rej.</TableHead>
                  <TableHead className="text-right">Média (h)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.by_approver ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Sem decisões no período
                    </TableCell>
                  </TableRow>
                ) : (
                  data!.by_approver.map((r) => (
                    <TableRow key={r.approver}>
                      <TableCell className="font-mono text-xs">
                        {r.approver.slice(0, 8)}…
                      </TableCell>
                      <TableCell className="text-right">{r.total}</TableCell>
                      <TableCell className="text-right text-success">{r.approved}</TableCell>
                      <TableCell className="text-right text-destructive">{r.rejected}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(r.avg_hours).toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranking por Comprador</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Comprador</TableHead>
                  <TableHead className="text-right">POs</TableHead>
                  <TableHead className="text-right">Aprov.</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.by_requester ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Sem submissões no período
                    </TableCell>
                  </TableRow>
                ) : (
                  data!.by_requester.map((r) => (
                    <TableRow key={r.requester}>
                      <TableCell className="font-mono text-xs">
                        {r.requester.slice(0, 8)}…
                      </TableCell>
                      <TableCell className="text-right">{r.total}</TableCell>
                      <TableCell className="text-right text-success">{r.approved}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {currency(Number(r.total_amount))}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
