import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { Button } from '@/ui/base/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { ShoppingCart } from 'lucide-react';
import { formatNumber } from '@/lib/formatters';
import type { MaterialNeed } from './types';

interface Props {
  materialNeeds: MaterialNeed[];
}

export function MRPPurchaseTab({ materialNeeds }: Props) {
  const deficits = materialNeeds.filter(m => m.coverageKnown && m.deficit > 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" /> Projeção de déficit bruto (pedido bloqueado)
          </CardTitle>
          {deficits.length > 0 && (
            <Button size="sm" disabled title="Exige MRP líquido e pedido transacional homologados">
              Gerar pedido indisponível
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p role="status" className="mb-4 text-sm text-warning">
          Projeção apenas pelo saldo bruto. Não considera reservas, bloqueios, entradas previstas ou unidades incompatíveis.
          Materiais sem saldo, código e unidade unívocos não entram na lista. Não utilize esta lista para emitir pedidos até o cálculo líquido e a gravação atômica serem homologados.
        </p>
        {deficits.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">Nenhum déficit bruto calculado; disponibilidade para compra ainda não foi validada.</p>
        ) : (
          <>
            <div className="mb-4 p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Itens com déficit bruto projetado: <strong className="text-foreground">{deficits.length}</strong></span>
                <span className="text-muted-foreground">Custo: não calculado sem fonte e unidade validadas</span>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Déficit bruto estimado</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Urgência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deficits.map(m => {
                  return (
                    <TableRow key={`${m.materialCode}:${m.unit}`}>
                      <TableCell className="font-medium">{m.materialName}</TableCell>
                      <TableCell className="text-right font-mono font-bold">{formatNumber(m.deficit)}</TableCell>
                      <TableCell>{m.unit}</TableCell>
                      <TableCell>{m.supplier || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <Badge variant={m.status === 'critical' ? 'destructive' : 'secondary'}>
                          {m.status === 'critical' ? 'Baixa cobertura bruta' : 'Cobertura parcial bruta'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
