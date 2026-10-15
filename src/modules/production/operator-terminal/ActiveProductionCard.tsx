import { Play, Pause, CheckCircle, Timer, Layers, Plus, Minus, AlertOctagon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Input } from '@/ui/base/input';
import { Progress } from '@/ui/base/progress';
import { cn } from '@/lib/utils';
import { toSafeNumber } from '@/lib/numericValidation';

type Entry = {
  status: string;
  order_number: string;
  operation_name: string;
};
type Order = {
  product_name: string;
  produced_quantity: number;
  quantity: number;
  unit?: string;
  client_name?: string | null;
};

type Props = {
  entry: Entry;
  order: Order | null | undefined;
  progressPct: number;
  producedQty: number;
  rejectedQty: number;
  onChangeProduced: (v: number) => void;
  onChangeRejected: (v: number) => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onReportProblem: () => void;
};

export function ActiveProductionCard({
  entry, order, progressPct,
  producedQty, rejectedQty, onChangeProduced, onChangeRejected,
  onPause, onResume, onFinish, onReportProblem,
}: Props) {
  const started = entry.status === 'started';
  return (
    <Card className={cn('border-2', started ? 'border-success' : 'border-warning')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Timer className="h-5 w-5" /> Produção em Andamento
          </CardTitle>
          <Badge variant={started ? 'default' : 'secondary'} className="text-sm">
            {started ? '▶ Produzindo' : '⏸ Pausado'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-xl bg-muted space-y-1">
          <p className="text-sm text-muted-foreground">OP: {entry.order_number}</p>
          <p className="font-semibold text-lg">{order?.product_name || entry.operation_name}</p>
          <p className="text-sm flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" /> {entry.operation_name}
          </p>
          {order?.client_name && <p className="text-sm">Cliente: {order.client_name}</p>}
        </div>

        <div className="text-center py-6 rounded-xl bg-card border">
          <p className="text-lg font-semibold">Tempo líquido não mensurado</p>
          <p className="text-sm text-muted-foreground mt-2">Pausas ainda não possuem início/fim persistidos.</p>
        </div>

        {order && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progresso da OP</span>
              <span className="font-bold">{progressPct.toFixed(0)}%</span>
            </div>
            <Progress value={Math.min(progressPct, 100)} className="h-3" />
            <p className="text-sm text-center text-muted-foreground">
              {order.produced_quantity}/{order.quantity} {order.unit}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <QtyStepper label="✅ Quantidade boa" value={producedQty} onChange={onChangeProduced} />
          <QtyStepper label="❌ Quantidade refugada" value={rejectedQty} onChange={onChangeRejected} />
        </div>

        <p className="text-sm text-muted-foreground">Unidade conforme a OP: {order?.unit || 'não informada'}. Produtividade não mensurada.</p>

        <div className="grid grid-cols-2 gap-3">
          {started ? (
            <Button size="lg" variant="secondary" className="h-20 text-xl font-bold" onClick={onPause}>
              <Pause className="h-7 w-7 mr-2" /> PAUSAR
            </Button>
          ) : (
            <Button size="lg" variant="default" className="h-20 text-xl font-bold" onClick={onResume}>
              <Play className="h-7 w-7 mr-2" /> RETOMAR
            </Button>
          )}
          <Button
            size="lg"
            className="h-20 text-xl font-bold bg-success hover:bg-success/90 text-success-foreground"
            onClick={onFinish}
          >
            <CheckCircle className="h-7 w-7 mr-2" /> FINALIZAR
          </Button>
        </div>

        <Button size="lg" variant="destructive" className="w-full h-14 text-lg font-bold" onClick={onReportProblem}>
          <AlertOctagon className="h-6 w-6 mr-2" /> REPORTAR PROBLEMA
        </Button>
      </CardContent>
    </Card>
  );
}

function QtyStepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-center block">{label}</label>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-14 w-14 shrink-0 text-lg"
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          <Minus className="h-5 w-5" />
        </Button>
        <Input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(toSafeNumber(e.target.value))}
          className="h-14 text-2xl text-center font-bold"
        />
        <Button
          variant="outline"
          size="icon"
          className="h-14 w-14 shrink-0 text-lg"
          onClick={() => onChange(value + 1)}
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
