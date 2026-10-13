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
  weaving: 'Tecelagem',
  dyeing: 'Tinturaria',
  finishing: 'Acabamento',
} as const;

export type IndustrialProfile = keyof typeof INDUSTRIAL_PROFILES;
export type IndustrialStage = keyof typeof INDUSTRIAL_STAGES;
export type StageMode = 'internal' | 'outsourced';
export type IndustrialPlanning = {
  profile: IndustrialProfile | null;
  stages: Partial<Record<IndustrialStage, StageMode>>;
};

export function parseIndustrialPlanning(value: unknown): IndustrialPlanning {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { profile: null, stages: {} };
  const input = value as Record<string, unknown>;
  const profile = typeof input.profile === 'string' && Object.prototype.hasOwnProperty.call(INDUSTRIAL_PROFILES, input.profile)
    ? input.profile as IndustrialProfile : null;
  const rawStages = input.stages && typeof input.stages === 'object' && !Array.isArray(input.stages)
    ? input.stages as Record<string, unknown> : {};
  const stages: IndustrialPlanning['stages'] = {};
  for (const stage of Object.keys(INDUSTRIAL_STAGES) as IndustrialStage[]) {
    if (rawStages[stage] === 'internal' || rawStages[stage] === 'outsourced') stages[stage] = rawStages[stage] as StageMode;
  }
  return { profile, stages };
}
