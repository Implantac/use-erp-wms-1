import { Card, CardContent } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { AlertTriangle, Lightbulb, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OptimizationSuggestion } from './useMLPredictions';

export function OptimizationList({ items }: { items: OptimizationSuggestion[] }) {
  return (
    <div className="space-y-4">
      {items.map((opt, i) => (
        <Card key={i} className={cn('border-l-4', opt.type === 'warning' ? 'border-l-warning' : opt.type === 'improvement' ? 'border-l-success' : 'border-l-primary')}>
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <div className={cn('rounded-full p-2', opt.type === 'warning' ? 'bg-warning/10' : opt.type === 'improvement' ? 'bg-success/10' : 'bg-primary/10')}>
                {opt.type === 'warning' ? <AlertTriangle className="h-5 w-5 text-warning-text" /> : opt.type === 'improvement' ? <Lightbulb className="h-5 w-5 text-success" /> : <Brain className="h-5 w-5 text-primary" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold">{opt.title}</p>
                  <Badge variant="outline" className="text-xs">{opt.kpi}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{opt.description}</p>
                <p className="text-sm font-medium text-primary mt-2">💡 {opt.impact}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
