import { Eye, Trash2, DollarSign, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { EmptyState } from '@/shared/components/EmptyState';
import { formatBRL } from '@/lib/formatters';
import { toastSuccess } from '@/lib/toastHelpers';
import { getAgingBadge } from './helpers';

type Account = {
  id: string; description: string; invoice_number?: string | null;
  client_name: string; due_date: string; status: string;
  amount: number | string; original_amount?: number | string | null;
  open_amount?: number | string | null; paid_amount?: number | string | null;
  installment_number?: number | null; total_installments?: number | null;
};

type Props = {
  accounts: Account[];
  now: Date;
  onReceive: (a: Account) => void;
  onView: (a: Account) => void;
  onDelete: (id: string) => void;
};

export function ReceivableTable({ accounts, now, onReceive, onView, onDelete }: Props) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Original</TableHead>
              <TableHead className="text-right">Em Aberto</TableHead>
              <TableHead className="text-right">Pago</TableHead>
              <TableHead>Parcela</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell>
                  <div>
                    <div className="font-medium">{account.description}</div>
                    {account.invoice_number && <div className="text-xs text-muted-foreground">{account.invoice_number}</div>}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{account.client_name}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{format(new Date(account.due_date), 'dd/MM/yyyy', { locale: ptBR })}</span>
                    {getAgingBadge(account.due_date, account.status, now)}
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm">{formatBRL(Number(account.original_amount ?? account.amount))}</TableCell>
                <TableCell className="text-right text-sm font-medium">{formatBRL(Number(account.open_amount ?? account.amount))}</TableCell>
                <TableCell className="text-right text-sm text-success">{formatBRL(Number(account.paid_amount ?? 0))}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {account.total_installments && account.total_installments > 1
                    ? `${account.installment_number}/${account.total_installments}`
                    : '-'}
                </TableCell>
                <TableCell><StatusBadge type="payment" status={account.status} /></TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {account.status !== 'paid' && account.status !== 'cancelled' && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-success hover:text-success" onClick={() => onReceive(account)} title="Registrar recebimento">
                          <DollarSign className="h-4 w-4" />
                        </Button>
                        {(account.status === 'overdue' || (account.status === 'pending' && new Date(account.due_date) < now)) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-warning-text hover:text-warning-text" title="Enviar cobrança"
                            onClick={() => toastSuccess('Lembrete enviado', `Cobrança enviada para ${account.client_name}`)}>
                            <Mail className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(account)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(account.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="p-4">
                  <EmptyState
                    compact
                    title="Nenhuma conta encontrada"
                    description="Ajuste os filtros ou registre um novo lançamento para começar."
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
