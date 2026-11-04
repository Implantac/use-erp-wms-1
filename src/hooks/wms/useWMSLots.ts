import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { FiberLotClassificationRow } from './useFiberReceipt';
import { useFiberReceipt } from './useFiberReceipt';

interface StockLotRow {
  id: string;
  lot_number: string;
  product_id?: string | null;
  product_code: string;
  product_name: string;
  supplier?: string | null;
  supplier_id?: string | null;
  manufacture_date?: string | null;
  expiration_date?: string | null;
  quantity: number | string;
  remaining_qty: number | string;
  origin: string;
  origin_reference?: string | null;
  location?: string | null;
  status: string;
  quality_status?: string | null;
  created_at: string;
}

export interface StockLot {
  id: string;
  lotNumber: string;
  productId?: string;
  productCode: string;
  productName: string;
  supplier?: string;
  supplierId?: string;
  manufactureDate?: string;
  expirationDate?: string;
  quantity: number;
  remainingQty: number;
  origin: string;
  originReference?: string;
  location?: string;
  status: string;
  qualityStatus?: string;
  classification?: FiberLotClassificationRow | null;
  createdAt: string;
}

export function useWMSLots() {
  const [lots, setLots] = useState<StockLot[]>([]);
  const [loading, setLoading] = useState(true);
  const { fetchClassifications } = useFiberReceipt();

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_lots')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error(error); toast.error('Erro ao carregar lotes'); }
    else {
      const rows = (data || []) as StockLotRow[];
      let classifications = new Map<string, FiberLotClassificationRow>();
      try {
        classifications = await fetchClassifications(rows.map((row) => row.id));
      } catch (classificationError) {
        // A classificação é complementar ao lote; se a migration ainda não
        // estiver aplicada no ambiente, a lista de lotes continua utilizável.
        console.warn('Classificação de fibra indisponível para os lotes', classificationError);
      }
      setLots(rows.map((r) => ({
        id: r.id, lotNumber: r.lot_number, productId: r.product_id,
        productCode: r.product_code, productName: r.product_name,
        supplier: r.supplier, supplierId: r.supplier_id,
        manufactureDate: r.manufacture_date,
        expirationDate: r.expiration_date, quantity: Number(r.quantity),
        remainingQty: Number(r.remaining_qty), origin: r.origin,
        originReference: r.origin_reference, location: r.location,
        status: r.status, qualityStatus: r.quality_status,
        classification: classifications.get(r.id) ?? null,
        createdAt: r.created_at,
      })));
    }
    setLoading(false);
  }, [fetchClassifications]);

  const create = async (lot: {
    lot_number: string; product_code: string; product_name: string;
    product_id?: string; supplier?: string; manufacture_date?: string;
    expiration_date?: string; quantity: number; origin?: string;
    origin_reference?: string; location?: string;
  }) => {
    const { error } = await supabase.from('stock_lots').insert({
      ...lot, remaining_qty: lot.quantity,
    });
    if (error) { toast.error('Erro ao criar lote'); return false; }
    toast.success('Lote registrado!');
    await fetch();
    return true;
  };

  useEffect(() => { fetch(); }, [fetch]);
  return { lots, loading, refetch: fetch, create };
}
