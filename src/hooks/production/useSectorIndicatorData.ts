import { useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import type { SectorKind } from '@/lib/pcp/sectorProfiles';
import type { YarnProductLike } from '@/lib/pcp/productFilters';
import {
  fetchSectorIndicatorEvents,
  type SectorIndicatorEventRow,
} from '@/services/production/textilePcpService';

const looseClient = supabase as unknown as {
  from<T>(table: string): {
    select(columns: string): {
      eq(column: string, value: string): PromiseLike<{ data: T | null; error: { message: string } | null }>;
    } & PromiseLike<{ data: T | null; error: { message: string } | null }>;
  };
};

interface ProductRow extends YarnProductLike {
  id: string;
  code: string;
  name: string;
  category_id: string | null;
  status?: string | null;
}

/**
 * Dados reais (somente leitura) para indicadores e prontidão da central:
 * eventos do setor inteiro e produtos com categoria resolvida. Sem dado,
 * devolve listas vazias — os indicadores exibem "sem dados", nunca estimam.
 */
export function useSectorIndicatorData(
  companyId: string | null,
  kind: SectorKind,
  weavingOrderIds: readonly string[],
  refreshKey = 0,
) {
  const [events, setEvents] = useState<SectorIndicatorEventRow[]>([]);
  const [products, setProducts] = useState<YarnProductLike[]>([]);
  const orderIdsKey = weavingOrderIds.join(',');

  useEffect(() => {
    if (!companyId) {
      setEvents([]);
      setProducts([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const ids = orderIdsKey ? orderIdsKey.split(',') : [];
      const [eventRows, productResult, categoryResult] = await Promise.all([
        fetchSectorIndicatorEvents(companyId, kind, ids).catch(() => [] as SectorIndicatorEventRow[]),
        looseClient.from<ProductRow[]>('products')
          .select('id, code, name, category_id, subcategory, status')
          .eq('company_id', companyId),
        looseClient.from<Array<{ id: string; name: string }>>('categories')
          .select('id, name'),
      ]);
      if (cancelled) return;
      setEvents(eventRows);
      const categoryNames = new Map((categoryResult.data ?? []).map((category) => [category.id, category.name]));
      setProducts(
        (productResult.data ?? []).filter((product) => !product.status || product.status === 'active').map((product) => ({
          ...product,
          category_name: product.category_id ? categoryNames.get(product.category_id) ?? null : null,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, kind, orderIdsKey, refreshKey]);

  return { events, products };
}
