import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const PIE_COLORS = ['hsl(var(--primary))', 'hsl(var(--warning))', 'hsl(var(--info))', 'hsl(var(--success))', 'hsl(var(--destructive))'];

export function ProductivityTab({ operatorData, statusPieData }: { operatorData: any[]; statusPieData: any[] }) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Apontamentos concluídos hoje por operador</CardTitle></CardHeader>
        <CardContent>
          {operatorData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={operatorData}>
                <XAxis dataKey="name" fontSize={11} /><YAxis /><Tooltip />
                <Bar dataKey="entries" fill="hsl(var(--primary))" name="Apontamentos" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-muted-foreground py-8">Sem apontamentos hoje</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Distribuição por Status</CardTitle></CardHeader>
        <CardContent>
          {statusPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label>
                  {statusPieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-center text-muted-foreground py-8">Sem dados</p>}
        </CardContent>
      </Card>
    </div>
  );
}
