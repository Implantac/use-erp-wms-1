/** Tipos de resultados de IA do Kanban de Produção. */

export interface SequenceItem {
  id: string;
  sequence: number;
  order_number?: string;
  product_name?: string;
  color?: string | null;
  model_variant?: string | null;
  sector?: string | null;
  due_date?: string | null;
  priority?: string | null;
  sequence_score?: number | null;
  setup_change?: boolean;
}

export interface SequenceResult {
  totalOrders?: number;
  totalGroups?: number;
  snapshot?: string;
  setupChanges?: number;
  summary?: string;
  sequence?: SequenceItem[];
}
