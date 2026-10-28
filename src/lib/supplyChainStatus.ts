// Approved SQL status CHECK from 20260807204950; these are display stages only.
// Estes são apenas os estágios de EXIBIÇÃO. O avanço real é pela RPC
// transition_stock_transfer (servidor valida estado, papéis e estoque);
export const SUPPLY_CHAIN_STATUS_ORDER = [
  'requested', 'approved', 'picking', 'picked', 'shipped',
  'in_transit', 'received', 'checked', 'completed',
] as const;
