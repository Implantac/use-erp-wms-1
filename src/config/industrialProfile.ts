/** Planning metadata only. These flags never grant permissions or enable production. */
export const INDUSTRIAL_PROFILES = {
  spinning_weaving: 'Fiação e tecelagem',
  weaving_dyeing: 'Tecelagem e tinturaria',
  dyeing_finishing: 'Tinturaria e acabamento',
  integrated_textile: 'Indústria têxtil integrada',
} as const;

export const INDUSTRIAL_STAGES = {
  fiber_preparation: 'Preparação da fibra',
  spinning: 'Fiação',
  weaving: 'Tecelagem (tecido plano)',
  knitting: 'Malharia (malha)',
  dyeing: 'Tinturaria',
  finishing: 'Acabamento',
} as const;

// Planning paths only; no automatic OP, stock or quality writes.
export const TEXTILE_PILOT_PATHS = {
  woven: ['fiber_preparation', 'spinning', 'weaving', 'dyeing', 'finishing'],
  knitted: ['fiber_preparation', 'spinning', 'knitting', 'dyeing', 'finishing'],
} as const satisfies Record<string, readonly (keyof typeof INDUSTRIAL_STAGES)[]>;

/** Business-process catalogue, not an access/production enablement switch. */
export const INDUSTRIAL_PROCESS_FAMILIES = {
  spinning: 'Fiação',
  weaving: 'Tecelagem (tecido plano)',
  knitting: 'Malharia',
  dyeing: 'Tinturaria',
  laundry: 'Lavanderia industrial',
  finishing: 'Acabamento têxtil',
  apparel: 'Confecção',
  animal_feed: 'Ração animal',
  food: 'Alimentos',
  chemicals: 'Químicos e produtos de limpeza',
  general_manufacturing: 'Outra indústria de transformação',
} as const;
export type IndustrialProcessFamily = keyof typeof INDUSTRIAL_PROCESS_FAMILIES;

/** Discovery prompts only: no field or compliance is considered implemented. */
export const INDUSTRIAL_FAMILY_DISCOVERY: Record<IndustrialProcessFamily, readonly string[]> = {
  spinning: ['Lote de pluma e mistura', 'Título/composição do fio', 'Perdas e ensaios por lote'],
  weaving: ['Urdume e trama por rolo', 'Metragem e defeitos de tecido cru'],
  knitting: ['Fio por rolo de malha', 'Gramatura/largura e defeitos'],
  dyeing: ['Receita e revisão', 'Lote/banho e parâmetros medidos', 'Liberação de cor e qualidade'],
  laundry: ['Receita e revisão', 'Carga por lote/peça', 'Parâmetros e efluentes conforme licença'],
  finishing: ['Medidas antes/depois', 'Classificação e segregação de rolos'],
  apparel: ['Grade/tamanho e revisão do molde', 'Corte e costura por lote', 'Inspeção da peça'],
  animal_feed: ['Fórmula e versão', 'Lotes de ingredientes e mistura', 'Controle de qualidade e exigências aplicáveis'],
  food: ['Receita e versão', 'Lotes/validade e condições de processo', 'Liberação e exigências aplicáveis'],
  chemicals: ['Formulação e versão', 'Lotes e parâmetros do processo', 'Segurança, rotulagem e exigências aplicáveis'],
  general_manufacturing: ['Estrutura/roteiro versionados', 'Unidade, lotes e perdas', 'Qualidade e requisitos específicos do cliente'],
};

export type IndustrialProfile = keyof typeof INDUSTRIAL_PROFILES;
export type IndustrialStage = keyof typeof INDUSTRIAL_STAGES;
export type StageMode = 'internal' | 'outsourced';
export type IndustrialPlanning = {
  profile: IndustrialProfile | null;
  families: IndustrialProcessFamily[];
  stages: Partial<Record<IndustrialStage, StageMode>>;
};

export function parseIndustrialPlanning(value: unknown): IndustrialPlanning {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { profile: null, families: [], stages: {} };
  const input = value as Record<string, unknown>;
  const profile = typeof input.profile === 'string' && Object.prototype.hasOwnProperty.call(INDUSTRIAL_PROFILES, input.profile)
    ? input.profile as IndustrialProfile : null;
  const rawStages = input.stages && typeof input.stages === 'object' && !Array.isArray(input.stages)
    ? input.stages as Record<string, unknown> : {};
  const rawFamilies: unknown[] = Array.isArray(input.families) ? input.families : [];
  const families = Object.keys(INDUSTRIAL_PROCESS_FAMILIES).filter((family): family is IndustrialProcessFamily =>
    rawFamilies.includes(family));
  const stages: IndustrialPlanning['stages'] = {};
  for (const stage of Object.keys(INDUSTRIAL_STAGES) as IndustrialStage[]) {
    if (rawStages[stage] === 'internal' || rawStages[stage] === 'outsourced') stages[stage] = rawStages[stage] as StageMode;
  }
  return { profile, families, stages };
}
