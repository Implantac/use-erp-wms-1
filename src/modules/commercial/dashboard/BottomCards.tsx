import { differenceInDays } from 'date-fns';
import { Badge } from '@/ui/base/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Progress } from '@/ui/base/progress';
import { AlertTriangle, MapPin } from 'lucide-react';
import { formatBRL } from '@/lib/formatters';

export interface TopRepItem { name: string; total: number; target: number; orders: number }
export interface TopRegionItem { name: string; total: number; count: number }
export interface StuckOrderItem { id: string; number: string | null; client_name: string | null; created_at: string }
export interface DashboardAlertItem { id: string; severity: string | null; title: string; description?: string | null }

export function TopRepsCard({ topReps }: { topReps: TopRepItem[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium">Top Representantes</CardTitle></CardHeader>
      <CardContent>
        {topReps.length > 0 ? (
          <div className="space-y-3">
            {topReps.map((rep, i) => {
              const pct = rep.target > 0 ? (rep.total / rep.target) * 100 : 0;
              return (
                <div key={rep.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold">{i + 1}</Badge>
                      <div>
                        <span className="text-sm font-medium truncate">{rep.name}</span>
                        <p className="text-[10px] text-muted-foreground">{rep.orders} pedidos</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-primary">{formatBRL(rep.total)}</span>
                  </div>
                  {rep.target > 0 && (
                    <div className="flex items-center gap-2 pl-8">
                      <Progress value={Math.min(pct, 100)} className="h-1 flex-1" />
                      <span className="text-[10px] text-muted-foreground w-10 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (<p className="text-center text-muted-foreground py-10">Sem dados</p>)}
      </CardContent>
    </Card>
  );
}

export function TopRegionsCard({ regions }: { regions: TopRegionItem[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><MapPin className="h-4 w-4" /> Top Regiões</CardTitle></CardHeader>
      <CardContent>
        {regions.length > 0 ? (
          <div className="space-y-3">
            {regions.map((region, i) => (
              <div key={region.name} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold">{i + 1}</Badge>
                  <div>
                    <span className="text-sm font-medium">{region.name}</span>
                    <p className="text-[10px] text-muted-foreground">{region.count} pedidos</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-primary">{formatBRL(region.total)}</span>
              </div>
            ))}
          </div>
        ) : (<p className="text-center text-muted-foreground py-10">Sem dados</p>)}
      </CardContent>
    </Card>
  );
}

export function AlertsInsightsCard({ stuckOrders, alerts, openAlerts }: { stuckOrders: StuckOrderItem[]; alerts: DashboardAlertItem[]; openAlerts: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning-text" />
          Alertas e Insights ({openAlerts + stuckOrders.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {stuckOrders.slice(0, 3).map(o => (
            <div key={o.id} className="flex items-start gap-3 border-b pb-2">
              <Badge variant="destructive" className="mt-0.5 text-[10px]">Travado</Badge>
              <div>
                <p className="text-sm font-medium">Pedido {o.number}</p>
                <p className="text-xs text-muted-foreground">{o.client_name} • pendente há {differenceInDays(new Date(), new Date(o.created_at))} dias</p>
              </div>
            </div>
          ))}
          {alerts.slice(0, 5).map(a => (
            <div key={a.id} className="flex items-start gap-3 border-b pb-2 last:border-0">
              <Badge variant={a.severity === 'high' ? 'destructive' : 'default'} className="mt-0.5 text-[10px]">
                {a.severity === 'high' ? 'Alta' : a.severity === 'medium' ? 'Média' : 'Baixa'}
              </Badge>
              <div>
                <p className="text-sm font-medium">{a.title}</p>
                {a.description && <p className="text-xs text-muted-foreground">{a.description}</p>}
              </div>
            </div>
          ))}
          {alerts.length === 0 && stuckOrders.length === 0 && (
            <p className="text-center text-muted-foreground py-10">Nenhum alerta</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
