import { EmptyState } from '@/shared/components/EmptyState';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Progress } from '@/ui/base/progress';
import { Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/formatters';
import { MRPStatusBadge } from './MRPStatusBadge';
import type { NetMaterialNeed } from '@/lib/pcp/netMrp';

export function MRPNeedsTab({ materialNeeds }: { materialNeeds: NetMaterialNeed[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" /> Necessidades líquidas de material
        </CardTitle>
      </CardHeader>
      <CardContent>
        {materialNeeds.length === 0 ? (
          <EmptyState
            icon={Calculator}
            title="Nenhuma necessidade calculada"
            description="Verifique se as OPs ativas possuem BOM em production_bom e saldo/lotes no estoque."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Bruta</TableHead>
                <TableHead className="text-right">Físico</TableHead>
                <TableHead className="text-right">Reservado</TableHead>
                <TableHead className="text-right">Bloq./não verif.</TableHead>
                <TableHead className="text-right">Disponível</TableHead>
                <TableHead className="text-right">Compras abertas</TableHead>
                <TableHead className="text-right">Líquida</TableHead>
                <TableHead>Cobertura</TableHead>
                <TableHead>Lead time</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materialNeeds.map((need) => {
                const coverage = need.grossRequirement > 0
                  ? Math.min(100, ((need.available + need.onOrder) / (need.grossRequirement + need.safetyStock)) * 100)
                  : 100;
                return (
                  <TableRow key={need.componentId} className={cn(need.status === 'critical' && 'bg-destructive/5')}>
                    <TableCell>
                      <div><span className="font-medium">{need.materialName}</span><span className="ml-2 text-xs text-muted-foreground">{need.materialCode}</span></div>
                      <div className="mt-1 flex flex-wrap gap-1">{need.relatedOPs.slice(0, 3).map((op) => <Badge key={op} variant="outline" className="text-[10px]">{op.slice(0, 8)}</Badge>)}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(need.grossRequirement)} {need.unit}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(need.physicalStock)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(need.reserved)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(need.blockedOrUnverified)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(need.available)}</TableCell>
                    <TableCell className="text-right font-mono">{formatNumber(need.onOrder)}{need.draftPurchase > 0 ? <span className="block text-[10px] text-muted-foreground">+ {formatNumber(need.draftPurchase)} em rascunho (não conta)</span> : null}</TableCell>
                    <TableCell className={cn('text-right font-mono font-bold', need.netRequirement > 0 ? 'text-destructive' : 'text-green-600')}>{formatNumber(need.netRequirement)}</TableCell>
                    <TableCell><div className="flex items-center gap-2"><Progress value={coverage} className="h-2 w-16" /><span className="text-xs">{Math.round(coverage)}%</span></div></TableCell>
                    <TableCell>{need.leadTimeDays !== null ? `${need.leadTimeDays} d${need.lateRisk ? ' · risco' : ''}` : '—'}</TableCell>
                    <TableCell><MRPStatusBadge status={need.status} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <p className="mt-4 text-xs text-muted-foreground">Fórmula auditável: líquida = máx(0, bruta com perda + estoque mínimo − disponível − compras abertas). Disponível exclui reservado, saldo bloqueado e saldo sem lote liberado. Pedido em rascunho é exibido, mas nunca conta como entrada.</p>
      </CardContent>
    </Card>
  );
}
