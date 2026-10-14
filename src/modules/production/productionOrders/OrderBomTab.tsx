import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { Layers } from 'lucide-react';

interface Props { productId: string | null }

/** Current product BOM only; NOT a snapshot of this OP and not an inventory operation. */
export function OrderBomTab({ productId }: Props) {
  const { currentCompany } = useEnterprise();
  const companyId = currentCompany?.id;

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['production_bom', companyId, productId],
    enabled: !!companyId && !!productId,
    queryFn: async () => {
      const { data, error } = await supabase.from('production_bom')
        .select('id, quantity, waste_percentage, component:products!production_bom_component_id_fkey(id, code, name, unit)')
        .eq('company_id', companyId!).eq('product_id', productId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!productId) return <p className="py-6 text-sm text-muted-foreground">Esta OP não tem produto vinculado.</p>;
  if (!companyId) return <p className="py-6 text-sm text-muted-foreground">Selecione a empresa para consultar a estrutura.</p>;

  return (
    <div className="space-y-4">
      <div role="note" className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <p>Estrutura <strong>atual do produto</strong>, não revisão congelada desta OP. Consulta sem edição, reserva ou baixa. Quantidades por unidade de saída e conversões ainda precisam ser aprovadas; conclusão da OP permanece bloqueada.</p>
      </div>

      {error ? <p className="text-sm text-destructive">Não foi possível carregar a estrutura atual do produto.</p>
        : isLoading ? <div className="h-20 animate-pulse rounded-lg bg-muted" />
        : items.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nenhum componente na estrutura atual. Não libere a produção sem ficha e roteiro aprovados.</p>
        : <ul className="divide-y divide-border rounded-lg border">
          {items.map(it => <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{it.component?.name ?? 'Componente indisponível'}</p>
              <p className="text-xs text-muted-foreground">{it.component?.code ?? 'Código indisponível'} · perda cadastrada {it.waste_percentage ?? 0}%</p>
            </div>
            <span className="shrink-0 tabular-nums text-foreground">Qtd. cadastrada: {it.quantity} {it.component?.unit ?? 'unidade não informada'}</span>
          </li>)}
        </ul>}
    </div>
  );
}
