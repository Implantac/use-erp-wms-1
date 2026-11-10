import { Receipt, Eye, Printer, MoreHorizontal, XCircle, Undo2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Badge } from '@/ui/base/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/base/dropdown-menu';
import { EmptyState } from '@/shared/components/EmptyState';
import { formatBRL } from '@/lib/formatters';
import type { NFCe } from '@/types/fiscal';
import { StatusBadge, PaymentBadge } from './constants';

type Props = {
  nfces: NFCe[];
  onView: (n: NFCe) => void;
  onReprint: (n: NFCe) => void;
  onReturn: (n: NFCe) => void;
  onCancel: (n: NFCe) => void;
};

const fmtDate = (v: string) => format(new Date(v), 'dd/MM/yyyy HH:mm', { locale: ptBR });

export function NFCeTable({ nfces, onView, onReprint, onReturn, onCancel }: Props) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Terminal</TableHead>
              <TableHead>Pagamento</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nfces.map((nfce) => (
              <TableRow key={nfce.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{nfce.number}</div>
                    <div className="text-xs text-muted-foreground">Série {nfce.series}</div>
                  </div>
                </TableCell>
                <TableCell>{fmtDate(nfce.issueDate)}</TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium">{nfce.terminalId}</div>
                    <div className="text-xs text-muted-foreground">{nfce.operatorName}</div>
                  </div>
                </TableCell>
                <TableCell><PaymentBadge method={nfce.paymentMethod} /></TableCell>
                <TableCell className="font-medium">{formatBRL(nfce.total)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge status={nfce.status} />
                    {nfce.returnStatus === 'partial' && (
                      <Badge variant="outline" className="border-warning/40 text-warning-text gap-1">
                        <Undo2 className="h-3 w-3" /> Dev. parcial
                      </Badge>
                    )}
                    {nfce.returnStatus === 'full' && (
                      <Badge variant="outline" className="border-destructive/40 text-destructive gap-1">
                        <Undo2 className="h-3 w-3" /> Devolvida
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onView(nfce)}>
                        <Eye className="mr-2 h-4 w-4" /> Visualizar
                      </DropdownMenuItem>
                      {nfce.status === 'authorized' && (
                        <>
                          <DropdownMenuItem onClick={() => onReprint(nfce)}>
                            <Printer className="mr-2 h-4 w-4" /> Reimprimir Cupom
                          </DropdownMenuItem>
                          {nfce.returnStatus !== 'full' && (
                            <DropdownMenuItem onClick={() => onReturn(nfce)}>
                              <Undo2 className="mr-2 h-4 w-4" /> Devolver itens
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onCancel(nfce)} className="text-destructive">
                            <XCircle className="mr-2 h-4 w-4" /> Cancelar NFC-e
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {nfces.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EmptyState
                    icon={Receipt}
                    title="Nenhuma NFC-e encontrada"
                    description="Emita uma nova NFC-e ou ajuste os filtros para visualizar registros."
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
