import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { LEDGER_LIMIT } from '@/lib/queryLimits';

type WmsMovementRow = Database['public']['Tables']['wms_movements']['Row'];
type WmsMovementInsert = Database['public']['Tables']['wms_movements']['Insert'];
type StockMovementRow = Database['public']['Tables']['stock_movements']['Row'];
type ReceivingRow = Database['public']['Tables']['wms_receiving_orders']['Row'];
type ReceivingUpdate = Database['public']['Tables']['wms_receiving_orders']['Update'];
type PickingRow = Database['public']['Tables']['wms_picking_orders']['Row'];
type PickingUpdate = Database['public']['Tables']['wms_picking_orders']['Update'];
type PackingRow = Database['public']['Tables']['wms_packing_orders']['Row'];
type PackingUpdate = Database['public']['Tables']['wms_packing_orders']['Update'];
type StorageLocationRow = Database['public']['Tables']['wms_storage_locations']['Row'];

export function useWMSMovements() {
  const [movements, setMovements] = useState<Array<ReturnType<typeof mapWmsMovement>>>([]);
  const [loading, setLoading] = useState(true);

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('wms_movements').select('*').order('created_at', { ascending: false }).limit(LEDGER_LIMIT);
    if (error) { console.error(error); toast.error('Erro ao carregar movimentações'); }
    else setMovements((data || []).map(mapWmsMovement));
    setLoading(false);
  }, []);

  const createMovement = async (movement: WmsMovementInsert) => {
    const { error } = await supabase.from('wms_movements').insert(movement);
    if (error) { toast.error('Erro ao criar movimentação'); console.error(error); return false; }
    toast.success('Movimentação registrada! Estoque ERP atualizado automaticamente.');
    await fetchMovements();
    return true;
  };

  useEffect(() => { fetchMovements(); }, [fetchMovements]);
  return { movements, loading, refetch: fetchMovements, createMovement };
}

function mapWmsMovement(r: WmsMovementRow) {
  return {
    id: r.id, productId: r.product_id, productCode: r.product_code, productName: r.product_name,
    type: r.type, fromLocation: r.from_location || '', toLocation: r.to_location || '',
    quantity: Number(r.quantity), reason: r.reason, operator: r.operator || '',
    reference: r.reference, createdAt: r.created_at,
  };
}

export function useStockMovements() {
  const [movements, setMovements] = useState<Array<ReturnType<typeof mapStockMovement>>>([]);
  const [loading, setLoading] = useState(true);

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(LEDGER_LIMIT);
    if (error) { console.error(error); toast.error('Erro ao carregar movimentações de estoque'); }
    else setMovements((data || []).map(mapStockMovement));
    setLoading(false);
  }, []);

  useEffect(() => { fetchMovements(); }, [fetchMovements]);
  return { movements, loading, refetch: fetchMovements };
}

function mapStockMovement(r: StockMovementRow) {
  return {
    id: r.id, documentNumber: r.document_number, productId: r.product_id,
    productCode: r.product_code, productName: r.product_name,
    type: r.type, direction: r.direction, quantity: Number(r.quantity),
    unitCost: Number(r.unit_cost), totalCost: Number(r.total_cost),
    batch: r.batch, fromWarehouse: r.from_warehouse, toWarehouse: r.to_warehouse,
    reference: r.reference, notes: r.notes, operator: r.operator,
    source: r.source, wmsMovementId: r.wms_movement_id, createdAt: r.created_at,
  };
}

export function useWMSReceiving() {
  const [orders, setOrders] = useState<Array<ReturnType<typeof mapReceiving>>>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('wms_receiving_orders').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error); toast.error('Erro ao carregar recebimentos'); }
    else setOrders((data || []).map(mapReceiving));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const update = async (id: string, updates: ReceivingUpdate) => {
    const { error } = await supabase.from('wms_receiving_orders').update(updates).eq('id', id);
    if (error) { toast.error('Erro ao atualizar'); return; }
    await fetch();
  };

  return { orders, loading, refetch: fetch, update };
}

function mapReceiving(r: ReceivingRow) {
  return {
    id: r.id, orderNumber: r.order_number, supplier: r.supplier,
    expectedDate: r.expected_date, receivedDate: r.received_date, dock: r.dock || '',
    itemsCount: r.items_count, receivedItems: r.received_items,
    status: r.status, operator: r.operator, notes: r.notes, createdAt: r.created_at,
  };
}

export function useWMSPicking() {
  const [orders, setOrders] = useState<Array<ReturnType<typeof mapPicking>>>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('wms_picking_orders').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error); toast.error('Erro ao carregar pickings'); }
    else setOrders((data || []).map(mapPicking));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const update = async (id: string, updates: PickingUpdate) => {
    const { error } = await supabase.from('wms_picking_orders').update(updates).eq('id', id);
    if (error) { toast.error('Erro ao atualizar picking'); return false; }
    toast.success('Picking atualizado!');
    await fetch();
    return true;
  };

  const startPicking = async (id: string, operator: string) => {
    return update(id, { status: 'in_progress', assigned_to: operator, started_at: new Date().toISOString() });
  };

  const completePicking = async (id: string) => {
    return update(id, { status: 'completed', completed_at: new Date().toISOString() });
  };

  return { orders, loading, refetch: fetch, update, startPicking, completePicking };
}

function mapPicking(r: PickingRow) {
  return {
    id: r.id, orderNumber: r.order_number, salesOrderId: r.sales_order_id,
    customerName: r.customer_name, priority: r.priority,
    itemsCount: r.items_count || 0, pickedItems: r.picked_items || 0,
    status: r.status, assignedTo: r.assigned_to || '', startedAt: r.started_at,
    completedAt: r.completed_at, createdAt: r.created_at,
  };
}

export function useWMSPacking() {
  const [orders, setOrders] = useState<Array<ReturnType<typeof mapPacking>>>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('wms_packing_orders').select('*').order('created_at', { ascending: false });
    if (error) { console.error(error); toast.error('Erro ao carregar packings'); }
    else setOrders((data || []).map(mapPacking));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const update = async (id: string, updates: PackingUpdate) => {
    const { error } = await supabase.from('wms_packing_orders').update(updates).eq('id', id);
    if (error) { toast.error('Erro ao atualizar'); return; }
    await fetch();
  };

  return { orders, loading, refetch: fetch, update };
}

function mapPacking(r: PackingRow) {
  return {
    id: r.id, orderNumber: r.order_number, customerName: r.customer_name,
    volumes: 0, status: r.status, operator: r.operator || '',
    startedAt: r.started_at, completedAt: r.completed_at,
    shippedAt: r.shipped_at, trackingCode: r.tracking_number, createdAt: r.created_at,
  };
}

export function useWMSStorageLocations() {
  const [locations, setLocations] = useState<Array<ReturnType<typeof mapStorageLocation>>>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('wms_storage_locations').select('*').order('code');
    if (error) { console.error(error); toast.error('Erro ao carregar endereços'); }
    else setLocations((data || []).map(mapStorageLocation));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { locations, loading, refetch: fetch };
}

function mapStorageLocation(r: StorageLocationRow) {
  return {
    id: r.id, code: r.code, zone: r.zone, type: r.type,
    capacity: r.capacity, occupied: r.occupied, active: r.active,
    products: [] as unknown[], // simplified
  };
}

export function useWMSDashboardStats() {
  const [stats, setStats] = useState({ receiving: 0, picking: 0, packing: 0, shipped: 0, occupancy: 0, totalLocations: 0, occupied: 0, capacity: 0, receivedItems: 0, shippedVolumes: 0, pendingPickingItems: 0, activeDocks: 0 });
  const [recentMovements, setRecentMovements] = useState<Array<{ id: string; productName: string; type: string; quantity: number; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    const [recRes, pickRes, packRes, storRes, movRes, shipRes, dockRes] = await Promise.all([
      supabase.from('wms_receiving_orders').select('status,received_items'),
      supabase.from('wms_picking_orders').select('status,items_count,picked_items'),
      supabase.from('wms_packing_orders').select('status'),
      supabase.from('wms_storage_locations').select('capacity,occupied').eq('active', true),
      supabase.from('wms_movements').select('*').order('created_at', { ascending: false }).limit(5),
      supabase.from('wms_shipments').select('status,volumes'),
      supabase.from('loading_docks').select('status'),
    ]);
    if ([recRes, pickRes, packRes, storRes, movRes, shipRes, dockRes].some((result) => result.error)) {
      setError(true);
      setLoading(false);
      return;
    }
    setError(false);

    const receiving = (recRes.data || []).filter((r) => ['pending', 'in_progress'].includes(r.status)).length;
    const picking = (pickRes.data || []).filter((r) => ['pending', 'assigned', 'in_progress'].includes(r.status)).length;
    const packing = (packRes.data || []).filter((r) => r.status === 'pending').length;
    const shipped = (packRes.data || []).filter((r) => r.status === 'shipped').length;

    const totalCap = (storRes.data || []).reduce((s: number, l) => s + Number(l.capacity || 0), 0);
    const totalOcc = (storRes.data || []).reduce((s: number, l) => s + Number(l.occupied || 0), 0);

    setStats({
      receiving, picking, packing, shipped,
      occupancy: totalCap > 0 ? Math.round((totalOcc / totalCap) * 100) : 0,
      totalLocations: (storRes.data || []).length,
      occupied: totalOcc,
      capacity: totalCap,
      receivedItems: (recRes.data || []).reduce((sum, row) => sum + Number(row.received_items || 0), 0),
      shippedVolumes: (shipRes.data || []).filter((row) => ['shipped', 'delivered'].includes(row.status)).reduce((sum, row) => sum + Number(row.volumes || 0), 0),
      pendingPickingItems: (pickRes.data || []).filter((row) => ['pending', 'assigned', 'in_progress'].includes(row.status)).reduce((sum, row) => sum + Math.max(0, Number(row.items_count || 0) - Number(row.picked_items || 0)), 0),
      activeDocks: (dockRes.data || []).filter((row) => ['occupied', 'in_progress', 'loading'].includes(row.status)).length,
    });

    setRecentMovements((movRes.data || []).map((r) => ({
      id: r.id, productName: r.product_name, type: r.type,
      quantity: Number(r.quantity), createdAt: r.created_at,
    })));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch();
    const channel = supabase.channel('wms-dashboard-operations-' + Math.random().toString(36).substring(7));
    ['wms_receiving_orders', 'wms_picking_orders', 'wms_packing_orders', 'wms_storage_locations', 'wms_movements', 'wms_shipments', 'loading_docks'].forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => { void fetch(); });
    });
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fetch]);
  return { stats, recentMovements, loading, error, refetch: fetch };
}

/** Views tipadas expostas para os componentes WMS */
export type ReceivingOrderView = ReturnType<typeof mapReceiving>;
export type PickingOrderView = ReturnType<typeof mapPicking>;
