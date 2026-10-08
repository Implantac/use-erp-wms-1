// Approved SQL status CHECK from 20260807204950; these are display stages only.
// Progression must remain disabled until a server-side transition/authorization is homologated.
export const SUPPLY_CHAIN_STATUS_ORDER = [
  'requested', 'approved', 'picking', 'picked', 'shipped',
  'in_transit', 'received', 'checked', 'completed',
] as const;
