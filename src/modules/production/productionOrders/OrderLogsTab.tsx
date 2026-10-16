import { EmptyState } from '@/shared/components/EmptyState';
import { History } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useProductionLogs } from '@/hooks/production/useProductionLogs';

export function OrderLogsTab({ orderId }: { orderId: string }) {
  const { logs, loading, loadError, hasCompany } = useProductionLogs(orderId);
  if (!hasCompany) return <p role="alert">Selecione uma empresa para consultar os logs.</p>;
  if (loading) return <p className="text-center py-8 text-muted-foreground">Carregando...</p>;
  if (loadError) return <p role="alert">Falha na consulta de logs; histórico não confirmado.</p>;
  if (logs.length === 0) {
    return <EmptyState icon={History} title="Nenhum registro de histórico" description="Apontamentos e eventos desta OP serão exibidos aqui em tempo real." />;
  }
  return (
    <div className="space-y-2 max-h-[300px] overflow-y-auto">
      {logs.map(log => (
        <div key={log.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
          <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{log.event_type}: {log.description || '-'}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {log.operator && <span>👷 {log.operator}</span>}
              {log.quantity != null && log.quantity > 0 && <span>Quantidade informada: {log.quantity} (unidade não registrada)</span>}
              <span>{format(parseISO(log.created_at), 'dd/MM HH:mm')}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
