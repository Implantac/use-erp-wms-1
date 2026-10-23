import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, ClipboardCheck, Truck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { purchasingService } from '@/services/purchasing/purchasingService';
import { formatBRL, formatDate } from '@/lib/formatters';

const OPEN = ['draft', 'pending_approval', 'approved', 'sent', 'confirmed', 'partially_received'];
const APPROVAL = ['draft', 'pending_approval'];
const INBOUND = ['approved', 'sent', 'confirmed', 'partially_received'];

/**
 * Fila do dia de Compras: o que aprovar, o que está atrasado para chegar
 * e o que vem aí — tudo dos pedidos reais, sem estimativa.
 */
export function PurchasingDailyQueue() {
  const ordersQuery = useQuery({
    queryKey: ['purchasing-daily-queue'],
    queryFn: () => purchasingService.getPurchaseOrders(),
    staleTime: 30_000,
  });
  const orders = ordersQuery.data || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const approval = orders.filter((o: any) => APPROVAL.includes(o.status));
  const late = orders.filter(
    (o: any) =>
      INBOUND.includes(o.status) &&
      o.expected_delivery &&
      new Date(o.expected_delivery) < today,
  );
  const upcoming = orders
    .filter(
      (o: any) =>
        INBOUND.includes(o.status) &&
        o.expected_delivery &&
        new Date(o.expected_delivery) >= today,
    )
    .sort((a: any, b: any) => String(a.expected_delivery).localeCompare(String(b.expected_delivery)));

  const sections = [
    {
      icon: ClipboardCheck,
      title: `Para aprovar hoje (${approval.length})`,
      rows: approval.slice(0, 5).map((o: any) => ({
        id: o.id,
        main: `${o.number} · ${o.supplier_name || 'fornecedor'}`,
        sub: `pedido em ${formatDate(o.date)} · ${formatBRL(Number(o.total || 0))}`,
      })),
      empty: 'Nenhum pedido aguardando aprovação.',
    },
    {
      icon: AlertTriangle,
      title: `Atrasados (${late.length})`,
      rows: late.slice(0, 5).map((o: any) => ({
        id: o.id,
        main: `${o.number} · ${o.supplier_name || 'fornecedor'}`,
        sub: `previsto para ${formatDate(o.expected_delivery)} · ${formatBRL(Number(o.total || 0))}`,
      })),
      empty: 'Nenhuma entrega atrasada.',
    },
    {
      icon: Truck,
      title: `Chegando (${upcoming.length})`,
      rows: upcoming.slice(0, 5).map((o: any) => ({
        id: o.id,
        main: `${o.number} · ${o.supplier_name || 'fornecedor'}`,
        sub: `previsto para ${formatDate(o.expected_delivery)} · ${formatBRL(Number(o.total || 0))}`,
      })),
      empty: 'Nada previsto para os próximos dias.',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold">Fila do dia — Compras</CardTitle>
        <CardDescription>
          Aprovações pendentes, atrasos e próximas chegadas dos pedidos reais.{' '}
          <Link to="/compras/pedidos" className="font-bold text-primary underline">
            Abrir pedidos
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-3">
        {sections.map((s) => (
          <div key={s.title} className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
              <s.icon className="h-4 w-4 text-primary" /> {s.title}
            </p>
            {s.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{s.empty}</p>
            ) : (
              s.rows.map((r) => (
                <div key={r.id} className="rounded-lg border p-2">
                  <p className="text-sm font-bold">{r.main}</p>
                  <p className="text-xs text-muted-foreground">{r.sub}</p>
                </div>
              ))
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Mantém o tipo de status aberto documentado para evolução da fila.
export const PURCHASING_OPEN_STATUSES = OPEN;
