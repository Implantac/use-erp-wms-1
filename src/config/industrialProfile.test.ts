import { describe, expect, it } from 'vitest';
import { INDUSTRIAL_PROFILES, TEXTILE_PILOT_PATHS, parseIndustrialPlanning } from './industrialProfile';

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
  it('mantém tecido plano e malha separados sem ativação automática', () => {
    expect(TEXTILE_PILOT_PATHS.woven).toContain('weaving');
    expect(TEXTILE_PILOT_PATHS.woven).not.toContain('knitting');
    expect(TEXTILE_PILOT_PATHS.knitted).toContain('knitting');
    expect(TEXTILE_PILOT_PATHS.knitted).not.toContain('weaving');
    expect(parseIndustrialPlanning({ profile: 'integrated_textile', stages: { weaving: 'internal', knitting: 'internal' } }))
      .toEqual({ profile: 'integrated_textile', stages: { weaving: 'internal', knitting: 'internal' } });
  });
  it('falha fechado para configurações ausentes ou inválidas', () => {
    expect(parseIndustrialPlanning(null)).toEqual({ profile: null, stages: {} });
    expect(parseIndustrialPlanning([])).toEqual({ profile: null, stages: {} });
  });
});
