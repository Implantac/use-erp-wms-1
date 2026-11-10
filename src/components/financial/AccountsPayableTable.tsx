import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/base/table';
import { Checkbox } from '@/ui/base/checkbox';
import { Button } from '@/ui/base/button';
import { Eye, DollarSign, Trash2, Receipt } from 'lucide-react';
import { EmptyState } from '@/shared/components/EmptyState';
import { StatusBadge } from '@/shared/components/StatusBadge';
import { formatBRL, formatDate } from '@/lib/formatters';
import { Badge } from '@/ui/base/badge';
import { differenceInDays } from 'date-fns';
import type { AccountPayable } from '@/types/financial';

interface AccountsPayableTableProps {
  accounts: AccountPayable[];
  selectedIds: Set<string>;
  onToggleOne: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  onPay: (account: AccountPayable) => void;
  onDelete: (id: string) => void;
  onView: (account: AccountPayable) => void;
}

export function AccountsPayableTable({
  accounts,
  selectedIds,
  onToggleOne,
  onToggleAll,
  allSelected,
  onPay,
  onDelete,
  onView
}: AccountsPayableTableProps) {
  const now = new Date();

  const getAgingBadge = (dueDate: string, status: string) => {
    if (status === 'paid' || status === 'cancelled') return null;
    const days = differenceInDays(now, new Date(dueDate));
    if (days <= 0) return null;
    if (days <= 7) return <Badge variant="outline" className="text-warning-text border-warning/30 bg-warning/10 text-xs">{days}d</Badge>;
    if (days <= 30) return <Badge variant="outline" className="text-warning-text border-warning/50 bg-warning/20 text-xs">{days}d</Badge>;
    return <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/5 text-xs">{days}d</Badge>;
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox checked={allSelected} onCheckedChange={onToggleAll} />
          </TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead>Fornecedor</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="text-right">Saldo</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="p-0">
              <EmptyState icon={Receipt} title="Nenhuma conta a pagar" description="Cadastre títulos ou importe do módulo de compras para acompanhar seus pagamentos." />
            </TableCell>
          </TableRow>
        ) : (
          accounts.map((account) => (
            <TableRow key={account.id} className={selectedIds.has(account.id) ? "bg-muted/50" : ""}>
              <TableCell>
                {account.status !== 'paid' && account.status !== 'cancelled' && (
                  <Checkbox checked={selectedIds.has(account.id)} onCheckedChange={() => onToggleOne(account.id)} />
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {formatDate(account.due_date)}
                  {getAgingBadge(account.due_date, account.status)}
                </div>
              </TableCell>
              <TableCell className="font-medium">{account.supplier}</TableCell>
              <TableCell>
                <div className="max-w-[200px] truncate" title={account.description}>
                  {account.description}
                </div>
              </TableCell>
              <TableCell><Badge variant="outline" className="font-normal">{account.category}</Badge></TableCell>
              <TableCell className="text-right">{formatBRL(account.amount)}</TableCell>
              <TableCell className="text-right font-medium text-destructive">
                {formatBRL(account.open_amount ?? account.amount)}
              </TableCell>
              <TableCell><StatusBadge type="payment" status={account.status} /></TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="icon" onClick={() => onView(account)}><Eye className="h-4 w-4" /></Button>
                  {(account.status !== 'paid' && account.status !== 'cancelled') && (
                    <Button variant="ghost" size="icon" className="text-success" onClick={() => onPay(account)}><DollarSign className="h-4 w-4" /></Button>
                  )}
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => onDelete(account.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
