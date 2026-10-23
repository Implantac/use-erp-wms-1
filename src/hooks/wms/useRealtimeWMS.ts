import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

/**
 * useRealtimeWMS — assina os canais Postgres do WMS e:
 * 1. Invalida as queries React Query relacionadas.
 * 2. Dispara callback opcional para refetch manual (usado por hooks legados sem React Query).
 * 3. Expõe `connected` e `lastEventAt` para o badge "ao vivo" na UI.
 */
export function useRealtimeWMS(onEvent?: (table: string) => void) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);

  useEffect(() => {
    const tables = [
      'wms_inventory_items',
      'stock_balances',
      'stock_movements',
      'wms_movements',
      'wms_picking_orders',
      'wms_receiving_orders',
      'wms_inventory_counts',
    ] as const;

    const invalidateMap: Record<string, string[][]> = {
      wms_inventory_items: [['wms_inventory'], ['inventory_products']],
      stock_balances: [['stock_balances'], ['wms_inventory']],
      stock_movements: [['stock_movements'], ['inventory_movements']],
      wms_movements: [['wms_movements'], ['stock_movements']],
      wms_picking_orders: [['wms_picking']],
      wms_receiving_orders: [['wms_receiving']],
      wms_inventory_counts: [['wms_inventory']],
    };

    const channel = supabase.channel('wms-realtime-' + Math.random().toString(36).substring(7));

    tables.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          setLastEventAt(new Date());
          (invalidateMap[table] || []).forEach((key) => {
            queryClient.invalidateQueries({ queryKey: key });
          });
          onEvent?.(table);
        },
      );
    });

    channel.subscribe((status) => {
      setConnected(status === 'SUBSCRIBED');
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, onEvent]);

  return { connected, lastEventAt };
}
