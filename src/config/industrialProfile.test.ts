import { describe, expect, it } from 'vitest';
import { INDUSTRIAL_PROFILES, INDUSTRIAL_PROCESS_FAMILIES, INDUSTRIAL_FAMILY_DISCOVERY, TEXTILE_PILOT_PATHS, parseIndustrialPlanning } from './industrialProfile';

describe('planejamento industrial por empresa', () => {
  it('cobre os quatro perfis e não ativa etapas automaticamente', () => {
    expect(Object.keys(INDUSTRIAL_PROFILES)).toHaveLength(4);
    for (const profile of Object.keys(INDUSTRIAL_PROFILES)) {
      expect(parseIndustrialPlanning({ profile })).toEqual({ profile, families: [], stages: {} });
    }
  });
  it('recusa perfil/etapas injetados e mantém etapas internas ou terceirizadas', () => {
    expect(parseIndustrialPlanning({ profile: '__proto__', stages: { weaving: 'enabled', dyeing: 'outsourced', injected: 'internal' } }))
      .toEqual({ profile: null, families: [], stages: { dyeing: 'outsourced' } });
    expect(parseIndustrialPlanning({ profile: 'integrated_textile', families: [], stages: { spinning: 'internal', finishing: 'outsourced' } }))
      .toEqual({ profile: 'integrated_textile', families: [], stages: { spinning: 'internal', finishing: 'outsourced' } });
  });
  it('mantém tecido plano e malha separados sem ativação automática', () => {
    expect(TEXTILE_PILOT_PATHS.woven).toContain('weaving');
    expect(TEXTILE_PILOT_PATHS.woven).not.toContain('knitting');
    expect(TEXTILE_PILOT_PATHS.knitted).toContain('knitting');
    expect(TEXTILE_PILOT_PATHS.knitted).not.toContain('weaving');
    expect(parseIndustrialPlanning({ profile: 'integrated_textile', families: [], stages: { weaving: 'internal', knitting: 'internal' } }))
      .toEqual({ profile: 'integrated_textile', families: [], stages: { weaving: 'internal', knitting: 'internal' } });
  });
  it('aceita composição de famílias conhecidas sem habilitar processos ou aceitar chaves injetadas', () => {
    expect(parseIndustrialPlanning({ families: ['spinning', 'weaving', 'dyeing', 'weaving', '__proto__', 7] }).families)
      .toEqual(['spinning', 'weaving', 'dyeing']);
    expect(parseIndustrialPlanning({ families: ['apparel', 'laundry', 'animal_feed', 'food', 'chemicals'] }).families)
      .toEqual(['laundry', 'apparel', 'animal_feed', 'food', 'chemicals']);
  });
  it('tem requisitos de levantamento para cada família, sem declarar conformidade', () => {
    expect(Object.keys(INDUSTRIAL_FAMILY_DISCOVERY)).toEqual(Object.keys(INDUSTRIAL_PROCESS_FAMILIES));
    for (const items of Object.values(INDUSTRIAL_FAMILY_DISCOVERY)) expect(items.length).toBeGreaterThan(0);
  });
  it('falha fechado para configurações ausentes ou inválidas', () => {
    expect(parseIndustrialPlanning(null)).toEqual({ profile: null, families: [], stages: {} });
    expect(parseIndustrialPlanning([])).toEqual({ profile: null, families: [], stages: {} });
  });
});
