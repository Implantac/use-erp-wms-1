import { Card, CardContent } from '@/ui/base/card';
import { AlertTriangle, Lightbulb, CheckCircle2, RefreshCw, ShoppingCart } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStoreReplenishment } from '@/hooks/operational/store/useStoreReplenishment';

export function PrescriptiveAlert() {
  const { recommendations, createRequest, isSubmitting } = useStoreReplenishment();
  const [processing, setProcessing] = useState<string | null>(null);

  const critical = recommendations.filter((r) => r.urgency === 'critical').slice(0, 3);
  if (critical.length === 0) return null;

  const handleApprove = async (productId: string) => {
    const rec = critical.find((r) => r.productId === productId);
    if (!rec) return;
    setProcessing(productId);
    try {
      // Caminho único da Loja: solicitação SEM origem; quem decide a
      // origem (outra Loja, CD ou fábrica) é a análise do almoxarifado.
      await createRequest({
        recommendation: rec,
        quantity: rec.suggestedQty,
      });
    } finally {
      setProcessing(null);
    }
  };

  return (
    <Card className="border-l-4 border-l-destructive bg-destructive/5 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-destructive">Risco de ruptura ({critical.length})</h4>
            <p className="text-[11px] text-muted-foreground">Ações recomendadas para hoje</p>
          </div>
        </div>

        <div className="space-y-2">
          {critical.map((rec) => (
            <div key={rec.productId} className="bg-background/60 p-3 rounded border border-destructive/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold">
                <Lightbulb className="h-3 w-3 text-warning" /> {rec.productName}
              </div>
              <p className="text-[11px] text-muted-foreground">{rec.reason}</p>
              {rec.sourceBranchId ? (
                <Button
                  size="sm"
                  disabled={isSubmitting || processing === rec.productId}
                  onClick={() => handleApprove(rec.productId)}
                  className="w-full h-8 gap-2 text-xs"
                  variant="destructive"
                >
                  {processing === rec.productId ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3" />
                  )}
                  Solicitar {rec.suggestedQty} un de {rec.sourceBranchName}
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="w-full h-8 gap-2 text-xs" asChild>
                  <Link to="/compras/pedidos">
                    <ShoppingCart className="h-3 w-3" /> Abrir pedido de compra
                  </Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
