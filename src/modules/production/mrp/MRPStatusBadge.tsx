import { Badge } from '@/ui/base/badge';

export function MRPStatusBadge({ status }: { status: string }) {
  if (status === 'unverified') return <Badge variant="outline">Não verificável: saldo/lote</Badge>;
  if (status === 'critical') return <Badge variant="destructive">Sem cobertura líquida</Badge>;
  if (status === 'partial') return <Badge className="bg-warning/15 text-warning border-warning/30">Cobertura líquida parcial</Badge>;
  return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Cobertura líquida OK</Badge>;
}
