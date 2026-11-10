import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { MapPin, Factory, Store, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { Skeleton } from '@/ui/base/skeleton';

interface UnitPosition {
  id: string;
  name: string;
  tipo: string;
  available: number;
  inTransit: number;
  skus: number;
}

const FACTORY_TIPOS = ['industria', 'FACTORY', 'cd', 'DISTRIBUTION_CENTER'];

export function NetworkMap() {
  const { currentBranch, currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['network-map', companyId],
    queryFn: async (): Promise<UnitPosition[]> => {
      const [{ data: branches }, { data: balances }] = await Promise.all([
        (supabase as any).from('branches').select('id, name, tipo').eq('company_id', companyId).eq('is_active', true),
        (supabase as any)
          .from('stock_balances')
          .select('branch_id, quantity, reserved_qty, in_transit_qty')
          .eq('company_id', companyId),
      ]);

      const map = new Map<string, UnitPosition>();
      (branches || []).forEach((b: any) =>
        map.set(b.id, { id: b.id, name: b.name, tipo: b.tipo, available: 0, inTransit: 0, skus: 0 }),
      );
      (balances || []).forEach((s: any) => {
        const unit = map.get(s.branch_id);
        if (!unit) return;
        unit.available += Number(s.quantity || 0) - Number(s.reserved_qty || 0);
        unit.inTransit += Number(s.in_transit_qty || 0);
        if (Number(s.quantity || 0) > 0) unit.skus += 1;
      });
      return Array.from(map.values());
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 2,
  });

  const units = data || [];
  const suppliers = units.filter((u) => FACTORY_TIPOS.includes(u.tipo));
  const stores = units.filter((u) => !FACTORY_TIPOS.includes(u.tipo));

  return (
    <Card className="bg-accent/20 border-dashed overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" /> Mapa de Estoque da Rede
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : units.length === 0 ? (
          <p className="text-[11px] text-muted-foreground py-6 text-center">
            Nenhuma unidade ativa cadastrada nesta empresa.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {suppliers.map((u) => (
                <div key={u.id} className="bg-background border-2 border-primary/60 rounded-lg p-3 text-center">
                  <p className="text-[10px] font-black uppercase text-primary flex items-center justify-center gap-1">
                    <Factory className="h-3 w-3" /> {u.name}
                  </p>
                  <p className="text-lg font-bold">{Math.round(u.available)} un</p>
                  <p className="text-[9px] text-muted-foreground">{u.skus} SKUs disponíveis</p>
                </div>
              ))}
              {suppliers.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center">Sem fábrica/CD cadastrado.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {stores.map((u) => {
                const isCurrent = u.id === currentBranch?.id;
                const status = u.available <= 0 ? 'critical' : u.skus < 3 ? 'attention' : 'ok';
                return (
                  <div
                    key={u.id}
                    className={cn(
                      'bg-background border rounded p-2 text-center',
                      isCurrent && 'ring-1 ring-primary ring-offset-1 ring-offset-background',
                    )}
                  >
                    <p className="text-[9px] font-bold flex items-center justify-center gap-1 truncate">
                      <Store className="h-3 w-3" /> {isCurrent ? 'Minha Loja' : u.name}
                    </p>
                    <p
                      className={cn(
                        'text-sm font-bold',
                        status === 'critical' ? 'text-destructive' : status === 'attention' ? 'text-warning-text' : 'text-success',
                      )}
                    >
                      {Math.round(u.available)} un
                    </p>
                    {u.inTransit > 0 && (
                      <p className="text-[9px] text-violet-500 flex items-center justify-center gap-1">
                        <Package className="h-2.5 w-2.5" /> {Math.round(u.inTransit)} a caminho
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
