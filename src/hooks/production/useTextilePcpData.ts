import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ProductionOrderRow } from './useProductionOrders';
import {
  fetchProductionLotGenealogy,
  fetchProductionMaterialReservations,
  fetchSectorEvents,
  fetchSectorOrderProfile,
  fetchWeavingEvents,
  fetchWeavingOrderProfile,
  type ProductionLotGenealogyRow,
  type ProductionMaterialReservationRow,
  type SectorEventRow,
  type SectorOrderProfileRow,
  type SectorProfileKind,
  type WeavingEventRow,
  type WeavingOrderProfileRow,
} from '@/services/production/textilePcpService';
import { sectorKindFromSectorText } from '@/lib/pcp/sectorProfiles';

export interface TextileBomLine {
  componentId: string;
  componentCode: string;
  componentName: string;
  componentUnit: string;
  quantity: number;
  wastePercentage: number;
}

export interface TextileLotOption {
  id: string;
  productId: string;
  lotNumber: string;
  remainingQty: number;
  qualityStatus: string;
  status: string;
  unitCost: number | null;
  location: string | null;
  balanceAvailable: number;
  balanceReserved: number;
}

interface SnapshotBomLine {
  component_id?: string;
  component_code?: string;
  component_name?: string;
  component_unit?: string;
  quantity?: number;
  waste_percentage?: number;
}

interface OrderSnapshot {
  bom?: SnapshotBomLine[];
}

type OrderWithSnapshot = ProductionOrderRow & {
  technical_snapshot?: OrderSnapshot | null;
  technical_snapshot_at?: string | null;
  technical_snapshot_hash?: string | null;
};

export function useTextilePcpData(order: ProductionOrderRow | null) {
  const [bomLines, setBomLines] = useState<TextileBomLine[]>([]);
  const [lots, setLots] = useState<TextileLotOption[]>([]);
  const [reservations, setReservations] = useState<ProductionMaterialReservationRow[]>([]);
  const [genealogy, setGenealogy] = useState<ProductionLotGenealogyRow[]>([]);
  const [weavingProfile, setWeavingProfile] = useState<WeavingOrderProfileRow | null>(null);
  const [weavingEvents, setWeavingEvents] = useState<WeavingEventRow[]>([]);
  const [sectorProfile, setSectorProfile] = useState<SectorOrderProfileRow | null>(null);
  const [sectorEvents, setSectorEvents] = useState<SectorEventRow[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const orderIdRef = useRef<string | null>(null);
  orderIdRef.current = order?.id ?? null;

  const fetchData = useCallback(async () => {
    if (!order) {
      setBomLines([]);
      setLots([]);
      setReservations([]);
      setGenealogy([]);
      setWeavingProfile(null);
      setWeavingEvents([]);
      setSectorProfile(null);
      setSectorEvents([]);
      setSnapshotAt(null);
      setLoading(false);
      return;
    }
    const currentOrderId = order.id;
    setLoading(true);
    setError(null);
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('production_orders')
        .select('*')
        .eq('id', order.id)
        .eq('company_id', order.company_id)
        .single();
      if (orderError) throw orderError;
      const orderWithSnapshot = orderData as unknown as OrderWithSnapshot;
      const snapshotLines = orderWithSnapshot.technical_snapshot?.bom ?? [];
      setSnapshotAt(orderWithSnapshot.technical_snapshot_at ?? null);

      let lines: TextileBomLine[] = snapshotLines
        .filter((line) => line.component_id)
        .map((line) => ({
          componentId: line.component_id as string,
          componentCode: line.component_code ?? '',
          componentName: line.component_name ?? '',
          componentUnit: line.component_unit ?? '',
          quantity: Number(line.quantity ?? 0),
          wastePercentage: Number(line.waste_percentage ?? 0),
        }));

      if (lines.length === 0 && order.product_id) {
        const { data: bomData, error: bomError } = await supabase
          .from('production_bom')
          .select('component_id, quantity, waste_percentage')
          .eq('company_id', order.company_id)
          .eq('product_id', order.product_id);
        if (bomError) throw bomError;
        const componentIds = [...new Set((bomData ?? []).map((line) => line.component_id))];
        const { data: productData, error: productError } = componentIds.length
          ? await supabase.from('products').select('id, code, name, unit').eq('company_id', order.company_id).in('id', componentIds)
          : { data: [], error: null };
        if (productError) throw productError;
        const productMap = new Map((productData ?? []).map((product) => [product.id, product]));
        lines = (bomData ?? []).map((line) => {
          const product = productMap.get(line.component_id);
          return {
            componentId: line.component_id,
            componentCode: product?.code ?? '',
            componentName: product?.name ?? '',
            componentUnit: product?.unit ?? '',
            quantity: Number(line.quantity ?? 0),
            wastePercentage: Number(line.waste_percentage ?? 0),
          };
        });
      }

      const sectorKind = sectorKindFromSectorText(order.sector);
      const profileKind: SectorProfileKind | null =
        sectorKind && sectorKind !== 'tecelagem' ? sectorKind : null;
      const componentIds = [...new Set(lines.map((line) => line.componentId))];
      const [lotResult, balanceResult, reservationRows, genealogyRows, profile, events, sectorProfileRow, sectorEventRows] = await Promise.all([
        componentIds.length
          ? supabase.from('stock_lots').select('id, product_id, lot_number, remaining_qty, quality_status, status, unit_cost, location')
            .eq('company_id', order.company_id).in('product_id', componentIds).order('lot_number')
          : Promise.resolve({ data: [], error: null }),
        componentIds.length
          ? supabase.from('stock_balances').select('product_id, lot_id, quantity, reserved_qty')
            .eq('company_id', order.company_id).in('product_id', componentIds)
          : Promise.resolve({ data: [], error: null }),
        fetchProductionMaterialReservations(order.id),
        fetchProductionLotGenealogy(order.id),
        fetchWeavingOrderProfile(order.id),
        fetchWeavingEvents(order.id),
        profileKind ? fetchSectorOrderProfile(order.id, profileKind) : Promise.resolve(null),
        profileKind ? fetchSectorEvents(order.id) : Promise.resolve([] as SectorEventRow[]),
      ]);
      if (lotResult.error) throw lotResult.error;
      if (balanceResult.error) throw balanceResult.error;
      if (orderIdRef.current !== currentOrderId) return;

      const balanceByLot = new Map<string, { available: number; reserved: number }>();
      for (const balance of balanceResult.data ?? []) {
        if (!balance.lot_id) continue;
        const current = balanceByLot.get(balance.lot_id) ?? { available: 0, reserved: 0 };
        current.available += Math.max(0, Number(balance.quantity ?? 0) - Number(balance.reserved_qty ?? 0));
        current.reserved += Number(balance.reserved_qty ?? 0);
        balanceByLot.set(balance.lot_id, current);
      }

      setBomLines(lines);
      setLots((lotResult.data ?? []).map((lot) => ({
        id: lot.id,
        productId: lot.product_id,
        lotNumber: lot.lot_number,
        remainingQty: Number(lot.remaining_qty ?? 0),
        qualityStatus: lot.quality_status,
        status: lot.status,
        unitCost: lot.unit_cost,
        location: lot.location,
        balanceAvailable: balanceByLot.get(lot.id)?.available ?? 0,
        balanceReserved: balanceByLot.get(lot.id)?.reserved ?? 0,
      })));
      setReservations(reservationRows);
      setGenealogy(genealogyRows);
      setWeavingProfile(profile);
      setWeavingEvents(events);
      setSectorProfile(sectorProfileRow);
      setSectorEvents(sectorEventRows);
    } catch (caught) {
      if (orderIdRef.current !== currentOrderId) return;
      const message = caught instanceof Error ? caught.message : 'Erro ao carregar execução do PCP';
      setError(message);
      setBomLines([]);
      setLots([]);
    } finally {
      if (orderIdRef.current === currentOrderId) setLoading(false);
    }
  }, [order]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  return {
    bomLines,
    lots,
    reservations,
    genealogy,
    weavingProfile,
    weavingEvents,
    sectorProfile,
    sectorEvents,
    snapshotAt,
    loading,
    error,
    refetch: fetchData,
  };
}
