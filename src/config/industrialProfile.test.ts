import { describe, expect, it } from 'vitest';
import { INDUSTRIAL_PROFILES, parseIndustrialPlanning } from './industrialProfile';

describe('planejamento industrial por empresa', () => {
  it('cobre os quatro perfis e não ativa etapas automaticamente', () => {
    expect(Object.keys(INDUSTRIAL_PROFILES)).toHaveLength(4);
    for (const profile of Object.keys(INDUSTRIAL_PROFILES)) {
      expect(parseIndustrialPlanning({ profile })).toEqual({ profile, stages: {} });
    }
  });
  it('recusa perfil/etapas injetados e mantém etapas internas ou terceirizadas', () => {
    expect(parseIndustrialPlanning({ profile: '__proto__', stages: { weaving: 'enabled', dyeing: 'outsourced', injected: 'internal' } }))
      .toEqual({ profile: null, stages: { dyeing: 'outsourced' } });
    expect(parseIndustrialPlanning({ profile: 'integrated_textile', stages: { spinning: 'internal', finishing: 'outsourced' } }))
      .toEqual({ profile: 'integrated_textile', stages: { spinning: 'internal', finishing: 'outsourced' } });
  });
  it('falha fechado para configurações ausentes ou inválidas', () => {
    expect(parseIndustrialPlanning(null)).toEqual({ profile: null, stages: {} });
    expect(parseIndustrialPlanning([])).toEqual({ profile: null, stages: {} });
  });
});
