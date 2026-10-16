/** Process vocabulary only. No ERP transaction, stock posting or production claim. */
export type TextileMaterial = 'fiber' | 'sliver' | 'roving' | 'yarn' | 'warp_beam' | 'greige_fabric' | 'dyed_fabric' | 'finished_fabric';
export type TextileStageId = 'fiber_receipt' | 'blend_card' | 'draw' | 'roving' | 'spin' | 'wind'
  | 'warp' | 'weave' | 'knit' | 'greige_inspection' | 'dye' | 'finish' | 'final_inspection';
export type TextileRoute = 'spinning' | 'woven' | 'knit' | 'dye_finish';

export interface TextileStage {
  id: TextileStageId;
  label: string;
  route: TextileRoute;
  input: TextileMaterial;
  output: TextileMaterial;
  gate: string;
}

/** No recipes, speeds, capacities, loss factors, tax rules or unit conversions are assumed. */
export const TEXTILE_STAGES: readonly TextileStage[] = [
  { id: 'fiber_receipt', label: 'Recebimento e classificação da fibra', route: 'spinning', input: 'fiber', output: 'fiber', gate: 'Lote, origem, unidade e inspeção aprovados' },
  { id: 'blend_card', label: 'Mistura e cardagem', route: 'spinning', input: 'fiber', output: 'sliver', gate: 'Lotes consumidos, mistura e perdas identificados' },
  { id: 'draw', label: 'Passagem / estiragem', route: 'spinning', input: 'sliver', output: 'sliver', gate: 'Lotes intermediários e parâmetros aprovados' },
  { id: 'roving', label: 'Maçaroqueira (quando aplicável)', route: 'spinning', input: 'sliver', output: 'roving', gate: 'Etapa habilitada no roteiro da empresa' },
  { id: 'spin', label: 'Fiação', route: 'spinning', input: 'roving', output: 'yarn', gate: 'Tipo de fiação e título aprovados; variante direta requer roteiro próprio' },
  { id: 'wind', label: 'Conicagem / preparação de fio', route: 'spinning', input: 'yarn', output: 'yarn', gate: 'Bobinas, lote e qualidade identificados' },
  { id: 'warp', label: 'Urdimento / preparação do tear', route: 'woven', input: 'yarn', output: 'warp_beam', gate: 'Fios e rolo de urdume vinculados à OP' },
  { id: 'weave', label: 'Tecelagem plana', route: 'woven', input: 'warp_beam', output: 'greige_fabric', gate: 'Trama deve ser registrada como insumo adicional no roteiro; tear e rolos identificados' },
  { id: 'knit', label: 'Malharia', route: 'knit', input: 'yarn', output: 'greige_fabric', gate: 'Máquina, calibre e rolos configurados pela fábrica' },
  { id: 'greige_inspection', label: 'Inspeção de tecido cru', route: 'dye_finish', input: 'greige_fabric', output: 'greige_fabric', gate: 'Inspeção e classificação antes do beneficiamento' },
  { id: 'dye', label: 'Tinturaria por lote', route: 'dye_finish', input: 'greige_fabric', output: 'dyed_fabric', gate: 'Receita versionada, banho, químicos, correções e liberação aprovados' },
  { id: 'finish', label: 'Acabamento', route: 'dye_finish', input: 'dyed_fabric', output: 'finished_fabric', gate: 'Tratamento, perdas e rolos de saída rastreados' },
  { id: 'final_inspection', label: 'Inspeção final', route: 'dye_finish', input: 'finished_fabric', output: 'finished_fabric', gate: 'Classificação, bloqueio/liberação e rastreio até expedição' },
] as const;

export interface TextileLotRef {
  id: string;
  companyId: string;
  material: TextileMaterial;
  quality: 'released' | 'held' | 'rejected' | 'unverified';
  quantity: number;
  unit: string;
}
export interface TextileTransformDraft {
  companyId: string;
  stageId: TextileStageId;
  inputs: readonly TextileLotRef[];
  output: TextileLotRef;
  /** Approved conversion evidence; no implicit kg→m or other cross-unit arithmetic. */
  conversionReference?: string;
}

/** Client-side preflight, not an authorization or ledger write. */
export function validateTextileTransform(draft: TextileTransformDraft): string[] {
  const errors: string[] = [];
  const stage = TEXTILE_STAGES.find(s => s.id === draft.stageId);
  if (!stage) return ['Etapa não reconhecida'];
  if (!draft.companyId || !draft.inputs.length) errors.push('Empresa e lotes de entrada são obrigatórios');
  if (!draft.output.id || draft.inputs.some(lot => !lot.id)) errors.push('Identifique todos os lotes');
  if (draft.output.companyId !== draft.companyId || draft.inputs.some(lot => lot.companyId !== draft.companyId)) errors.push('Lotes devem pertencer à mesma empresa');
  if (draft.inputs.some(lot => lot.material !== stage.input) || draft.output.material !== stage.output) errors.push('Material incompatível com a etapa');
  if (draft.inputs.some(lot => lot.quality !== 'released')) errors.push('Lotes de entrada precisam estar liberados');
  if (draft.inputs.some(lot => !Number.isFinite(lot.quantity) || lot.quantity <= 0 || !lot.unit.trim())
    || !Number.isFinite(draft.output.quantity) || draft.output.quantity <= 0 || !draft.output.unit.trim()) errors.push('Quantidades positivas e unidades explícitas são obrigatórias');
  if (new Set(draft.inputs.map(lot => lot.id)).size !== draft.inputs.length || draft.inputs.some(lot => lot.id === draft.output.id)) errors.push('Lotes de entrada e saída devem ter identificadores distintos');
  if (draft.inputs.some(lot => lot.unit !== draft.output.unit) && !draft.conversionReference?.trim()) errors.push('Conversão entre unidades exige referência aprovada');
  // No mass-balance claim: different products, waste and co-products need a server-side ledger.
  return errors;
}
