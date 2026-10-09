import type { EntityKey } from '@/core/entityRegistry';

export const DRILLDOWN_OPEN_EVENT = 'drilldown:open';
export interface DrillDownOpenPayload {
  entityKey: EntityKey;
  value?: number | string;
  delta?: { day?: number; week?: number; month?: number; year?: number };
  goal?: number;
  companyId?: string;
}
export function openDrillDown(payload: DrillDownOpenPayload) {
  window.dispatchEvent(new CustomEvent(DRILLDOWN_OPEN_EVENT, { detail: payload }));
}
