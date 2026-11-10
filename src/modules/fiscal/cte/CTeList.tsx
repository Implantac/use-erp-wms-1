import { usePrompt } from '@/shared/components/confirmContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Button } from '@/ui/base/button';
import { EmptyState } from '@/shared/components/EmptyState';
import { FiscalStatusBadge } from '@/components/fiscal/FiscalStatusBadge';
import { formatBRL } from '@/lib/formatters';
import { format } from 'date-fns';
import { Truck, Send, Ban } from 'lucide-react';

interface Props {
  ctes: any[];
  isLoading: boolean;
  onTransmit: (id: string) => void;
  onCancel: (id: string, reason: string) => void;
}

export function CTeList({ ctes, isLoading, onTransmit, onCancel }: Props) {
  const ask = usePrompt();
  return (
    <Card>
      <CardHeader><CardTitle>Conhecimentos de Transporte</CardTitle></CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Carregando…</div>
        ) : ctes.length === 0 ? (
          <EmptyState icon={Truck} title="Nenhum CT-e cadastrado" description="Emita o primeiro Conhecimento de Transporte Eletrônico para suas operações logísticas." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow><TableHead>Número</TableHead><TableHead>Emissão</TableHead><TableHead>Transportadora</TableHead><TableHead>Origem→Destino</TableHead><TableHead className="text-right">Frete</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {ctes.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.number}</TableCell>
                  <TableCell>{format(new Date(c.issue_date), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>{c.carrier_name}</TableCell>
                  <TableCell className="text-sm">{c.sender_uf} → {c.recipient_uf}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(Number(c.freight_value))}</TableCell>
                  <TableCell><FiscalStatusBadge status={c.status} /></TableCell>
                  <TableCell className="text-right space-x-1">
                    {c.status === 'draft' && <Button size="sm" variant="outline" onClick={() => onTransmit(c.id)}><Send className="h-3 w-3" /></Button>}
                    {c.status === 'authorized' && <Button size="sm" variant="ghost" onClick={async () => { const r = await ask({ title: 'Cancelar CT-e', description: 'A justificativa é obrigatória para o cancelamento.', inputLabel: 'Justificativa', placeholder: 'Motivo do cancelamento', required: true, multiline: true, confirmLabel: 'Cancelar CT-e', variant: 'destructive' }); if (r) onCancel(c.id, r); }}><Ban className="h-3 w-3" /></Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
