import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import type { ProductionOrderRow } from '@/hooks/production/useProductionOrders';
import {
  calculateNetMaterialNeeds,
  getOrderNetCoverage,
  type NetMrpBomLine,
  type NetMaterialNeed,
  type OrderMaterialCoverage,
} from '@/lib/pcp/netMrp';

interface OrderSnapshotRow {
  id: string;
  technical_snapshot?: { bom?: Array<{ component_id?: string; quantity?: number; waste_percentage?: number }> } | null;
}

interface PurchaseOrderItemJoin {
  product_id: string;
  quantity: number;
  received_quantity: number;
  purchase_orders: { status: string; expected_delivery: string | null } | null;
}

export function useNetMRP(orders: ProductionOrderRow[]) {
  const { company } = useActiveTenant();
  const companyId = company?.id;
  const [needs, setNeeds] = useState<NetMaterialNeed[]>([]);
  const [bomLines, setBomLines] = useState<NetMrpBomLine[]>([]);
  const [orderSnapshotLines, setOrderSnapshotLines] = useState<Map<string, NetMrpBomLine[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeOrders = useMemo(
    () => orders.filter((order) => ['planned', 'waiting_material', 'in_progress', 'paused'].includes(order.status)),
    [orders],
  );

  const fetchData = useCallback(async () => {
    if (!companyId) {
      setNeeds([]);
      setBomLines([]);
      setOrderSnapshotLines(new Map());
      setOrderSnapshotLines(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [bomResult, productResult, balanceResult, lotResult, purchaseResult, snapshotResult] = await Promise.all([
        supabase.from('production_bom').select('product_id, component_id, quantity, waste_percentage').eq('company_id', companyId),
        supabase.from('products').select('id, code, name, unit, min_stock, standard_batch_size, lead_time_days').eq('company_id', companyId),
        supabase.from('stock_balances').select('product_id, quantity, reserved_qty, stock_status, lot_id').eq('company_id', companyId),
        supabase.from('stock_lots').select('id, quality_status').eq('company_id', companyId),
        supabase.from('purchase_order_items')
          .select('product_id, quantity, received_quantity, purchase_orders(status, expected_delivery)')
          .eq('company_id', companyId),
        activeOrders.length
          ? supabase.from('production_orders').select('id, technical_snapshot').eq('company_id', companyId).in('id', activeOrders.map((order) => order.id))
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (bomResult.error) throw bomResult.error;
      if (productResult.error) throw productResult.error;
      if (balanceResult.error) throw balanceResult.error;
      if (lotResult.error) throw lotResult.error;
      if (purchaseResult.error) throw purchaseResult.error;

      const verifiedLotIds = new Set(
        (lotResult.data ?? [])
          .filter((lot) => ['approved', 'released', 'aprovado', 'aprovada', 'liberado', 'liberada'].includes(lot.quality_status.toLowerCase()))
          .map((lot) => lot.id),
      );
      const snapshotLinesByOrder = new Map<string, NetMrpBomLine[]>();
      if (!snapshotResult.error) {
        for (const row of (snapshotResult.data ?? []) as unknown as OrderSnapshotRow[]) {
          const snapshotLines = (row.technical_snapshot?.bom ?? [])
            .filter((line) => line.component_id)
            .map((line) => {
              const order = activeOrders.find((candidate) => candidate.id === row.id);
              return {
                productId: order?.product_id ?? '',
                componentId: line.component_id as string,
                quantity: Number(line.quantity ?? 0),
                wastePercentage: line.waste_percentage ?? null,
              };
            });
          if (snapshotLines.length) snapshotLinesByOrder.set(row.id, snapshotLines);
        }
      }
      const lines = (bomResult.data ?? []).map((line) => ({
        productId: line.product_id,
        componentId: line.component_id,
        quantity: Number(line.quantity ?? 0),
        wastePercentage: line.waste_percentage,
      }));
      const requirementDate = activeOrders
        .map((order) => order.due_date)
        .filter((date): date is string => Boolean(date))
        .sort()[0] ?? null;
      const calculated = calculateNetMaterialNeeds({
        orders: activeOrders.map((order) => ({
          id: order.id,
          productId: order.product_id,
          quantity: order.quantity,
          producedQuantity: order.produced_quantity,
          bomLines: snapshotLinesByOrder.get(order.id),
        })),
        bomLines: lines,
        products: (productResult.data ?? []).map((product) => ({
          id: product.id,
          code: product.code,
          name: product.name,
          unit: product.unit,
          minStock: product.min_stock,
          standardBatchSize: product.standard_batch_size,
          leadTimeDays: product.lead_time_days,
        })),
        balances: (balanceResult.data ?? []).map((balance) => ({
          productId: balance.product_id,
          quantity: Number(balance.quantity ?? 0),
          reservedQty: Number(balance.reserved_qty ?? 0),
          stockStatus: balance.stock_status,
          qualityKnown: balance.lot_id ? verifiedLotIds.has(balance.lot_id) : false,
        })),
        purchases: ((purchaseResult.data ?? []) as unknown as PurchaseOrderItemJoin[])
          .filter((item) => item.purchase_orders)
          .map((item) => ({
            productId: item.product_id,
            quantity: Number(item.quantity ?? 0),
            receivedQuantity: Number(item.received_quantity ?? 0),
            status: item.purchase_orders?.status ?? '',
            expectedDelivery: item.purchase_orders?.expected_delivery ?? null,
          })),
        requirementDate,
      });
      setBomLines(lines);
      setOrderSnapshotLines(snapshotLinesByOrder);
      setNeeds(calculated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Erro ao calcular MRP líquido');
      setNeeds([]);
      setBomLines([]);
      setOrderSnapshotLines(new Map());
    } finally {
      setLoading(false);
    }
  }, [activeOrders, companyId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const coverageByOrder = useMemo(() => {
    const map = new Map<string, OrderMaterialCoverage>();
    for (const order of activeOrders) {
      map.set(order.id, getOrderNetCoverage(
        { id: order.id, productId: order.product_id, quantity: order.quantity, producedQuantity: order.produced_quantity, bomLines: orderSnapshotLines.get(order.id) },
        bomLines,
        needs,
      ));
    }
    return map;
  }, [activeOrders, bomLines, needs, orderSnapshotLines]);

  return { needs, bomLines, coverageByOrder, activeOrders, loading, error, refetch: fetchData };
}
