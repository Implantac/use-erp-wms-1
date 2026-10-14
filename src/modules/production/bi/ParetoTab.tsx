import { Card, CardContent } from '@/ui/base/card';

/** ABC based on sums of unit price-minus-cost is not a profit Pareto. */
export function ParetoTab() {
  return <Card><CardContent className="pt-6 space-y-2">
    <h3 className="font-semibold">Pareto de lucro não apurado</h3>
    <p className="text-sm text-muted-foreground">Preços e custos unitários cadastrados não comprovam lucro realizado. Classificação ABC requer vendas, quantidades e custos efetivos na mesma janela e por produto.</p>
  </CardContent></Card>;
}
