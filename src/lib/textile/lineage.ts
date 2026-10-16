/** In-memory lineage preview only; stock_lots remains the inventory ledger. */
export interface LineageLot {
  id: string;
  companyId: string;
  quantity: number;
  unit: string;
}
export interface LineageEdge {
  companyId: string;
  operationId: string;
  inputLotId: string;
  outputLotId: string;
  inputQuantity: number;
  outputQuantity: number;
  inputUnit: string;
  outputUnit: string;
  conversionReference?: string;
}

export function validateLineageGraph(lots: readonly LineageLot[], edges: readonly LineageEdge[]): string[] {
  const errors: string[] = [];
  const byId = new Map<string, LineageLot>();
  for (const lot of lots) {
    if (!lot.id || !lot.companyId || byId.has(lot.id)) errors.push('Identificador de lote ausente ou duplicado');
    byId.set(lot.id, lot);
    if (!Number.isFinite(lot.quantity) || lot.quantity < 0 || !lot.unit.trim()) errors.push('Lote sem quantidade finita ou unidade explícita');
  }
  const graph = new Map<string, Set<string>>();
  for (const edge of edges) {
    const input = byId.get(edge.inputLotId);
    const output = byId.get(edge.outputLotId);
    if (!edge.operationId || !edge.companyId || !input || !output || !edge.inputLotId || edge.inputLotId === edge.outputLotId) {
      errors.push('Vínculo de origem/destino inválido'); continue;
    }
    if (input.companyId !== edge.companyId || output.companyId !== edge.companyId) errors.push('Vínculo atravessa empresas');
    if (!Number.isFinite(edge.inputQuantity) || edge.inputQuantity <= 0 || !Number.isFinite(edge.outputQuantity) || edge.outputQuantity <= 0
      || !edge.inputUnit.trim() || !edge.outputUnit.trim() || edge.inputUnit !== input.unit || edge.outputUnit !== output.unit) errors.push('Vínculo sem quantidades/unidades válidas');
    if (edge.inputUnit !== edge.outputUnit && !edge.conversionReference?.trim()) errors.push('Conversão entre unidades sem referência aprovada');
    if (!graph.has(edge.inputLotId)) graph.set(edge.inputLotId, new Set());
    graph.get(edge.inputLotId)!.add(edge.outputLotId);
  }
  const visited = new Set<string>();
  const active = new Set<string>();
  function visit(id: string): boolean {
    if (active.has(id)) return true;
    if (visited.has(id)) return false;
    active.add(id);
    for (const next of graph.get(id) || []) if (visit(next)) return true;
    active.delete(id); visited.add(id);
    return false;
  }
  if ([...graph.keys()].some(id => visit(id))) errors.push('Genealogia cíclica');
  // No balance assertion: by-products, waste and conversions need approved server rules.
  return [...new Set(errors)];
}

/** Throws rather than return a partial recall when a broken graph is supplied. */
export function traceLineage(lots: readonly LineageLot[], edges: readonly LineageEdge[], lotId: string, direction: 'ancestors' | 'descendants'): string[] {
  const errors = validateLineageGraph(lots, edges);
  if (errors.length) throw new Error(errors.join('; '));
  if (!lots.some(lot => lot.id === lotId)) throw new Error('Lote não encontrado');
  const adjacent = new Map<string, Set<string>>();
  for (const edge of edges) {
    const from = direction === 'ancestors' ? edge.outputLotId : edge.inputLotId;
    const to = direction === 'ancestors' ? edge.inputLotId : edge.outputLotId;
    if (!adjacent.has(from)) adjacent.set(from, new Set());
    adjacent.get(from)!.add(to);
  }
  const found = new Set<string>();
  const queue = [lotId];
  for (let i = 0; i < queue.length; i++) {
    for (const next of adjacent.get(queue[i]) || []) if (!found.has(next) && next !== lotId) { found.add(next); queue.push(next); }
  }
  return [...found];
}
