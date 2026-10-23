import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Factory, Package, Truck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';

/**
 * Operação da rede HOJE (números reais do fluxo oficial, grupo inteiro):
 * o que está sendo separado, o que está na estrada, o que espera decisão
 * e o que as lojas pediram à Fábrica.
 */
export function NetworkTodayPanel() {
  const { currentCompany } = useEnterprise();

  const { data } = useQuery({
    queryKey: ['network-today', currentCompany?.id],
    enabled: !!currentCompany?.id,
    queryFn: async () => {
      const companyId = currentCompany!.id;
      const { data: comps } = await (supabase as any)
        .from('companies')
        .select('id, parent_company_id');
      const mine = (comps || []).find((c: any) => c.id === companyId);
      const root = mine?.parent_company_id || companyId;
      const groupIds = [...new Set([
        root,
        ...(comps || []).filter((c: any) => c.parent_company_id === root).map((c: any) => c.id),
        companyId,
      ])];
      const countOrders = async (statuses: string[]) => {
        const { count } = await (supabase as any)
          .from('stock_transfer_orders')
          .select('id', { count: 'exact', head: true })
          .in('company_id', groupIds)
          .in('current_status', statuses);
        return count ?? 0;
      };
      const [separacao, transito, decisao, fabrica] = await Promise.all([
        countOrders(['RESERVADA', 'SEPARAÇÃO', 'CONFERÊNCIA', 'EXPEDIDA']),
        countOrders(['EM TRÂNSITO']),
        countOrders(['SUGERIDA']),
        (async () => {
          const { count } = await (supabase as any)
            .from('intercompany_replenishment_requests')
            .select('id', { count: 'exact', head: true })
            .eq('group_root_company_id', root)
            .eq('status', 'pendente');
          return count ?? 0;
        })(),
      ]);
      return { separacao, transito, decisao, fabrica };
    },
    staleTime: 30_000,
  });

  const tiles = [
    { icon: ClipboardList, label: 'Aguardando decisão/aprovação', value: data?.decisao ?? 0 },
    { icon: Package, label: 'Em separação / expedição', value: data?.separacao ?? 0 },
    { icon: Truck, label: 'Em trânsito agora', value: data?.transito ?? 0 },
    { icon: Factory, label: 'Pedidos à Fábrica pendentes', value: data?.fabrica ?? 0 },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold">Operação da rede hoje</CardTitle>
        <CardDescription>
          Contagens reais do fluxo oficial no grupo inteiro (indústria, CD e lojas).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <t.icon className="h-4 w-4 text-primary" />
                <span className="text-xl font-black">{t.value}</span>
              </div>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wide">{t.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
