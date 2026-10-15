import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { BarChart3, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export function CapacityTab({ workCenterData, delayedOPs, today }: { workCenterData: any[]; delayedOPs: any[]; today: Date }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> OPs ativas por centro de trabalho</CardTitle></CardHeader>
        <CardContent>
          {workCenterData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={workCenterData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis /><Tooltip />
                <Bar dataKey="ordens" fill="hsl(var(--primary))" name="Ordens" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground text-center py-8">Sem OPs ativas carregadas</p>}
        </CardContent>
      </Card>
      {delayedOPs.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader><CardTitle className="text-destructive flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> OPs Atrasadas ({delayedOPs.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {delayedOPs.map(o => (
                <div key={o.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div className="flex items-center gap-3"><span className="font-mono font-medium">{o.order_number}</span><span className="text-muted-foreground">{o.product_name}</span></div>
                  <Badge variant="destructive" className="text-xs">{Math.max(1, Math.ceil((today.getTime() - new Date(o.due_date!).getTime()) / 86_400_000))} dia(s) de atraso</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
