import { describe, expect, it } from 'vitest';
import { SEGMENTS } from './adaptive';
import { canViewVertical } from './verticalAccess';

const allRoutes = [
  '/vertical/textile', '/vertical/apparel', '/vertical/spinning', '/vertical/weaving',
  '/vertical/food-feed', '/vertical/pharma', '/vertical/distribution',
  '/vertical/wholesaler', '/vertical/retail', '/vertical/franchise', '/vertical/holding',
];

describe('visibilidade dos pacotes por perfil', () => {
  it('nega valores não configurados e rotas desconhecidas', () => {
    for (const value of ['', 'unconfigured', '__proto__', 'unexpected']) {
      for (const route of allRoutes) expect(canViewVertical(value, route)).toBe(false);
    }
    expect(canViewVertical('textile', '/vertical/unknown')).toBe(false);
  });
  it('mostra apenas etapas têxteis esperadas, sem liberar outros setores', () => {
    expect(canViewVertical('textile', '/vertical/spinning')).toBe(true);
    expect(canViewVertical('textile', '/vertical/weaving')).toBe(true);
    expect(canViewVertical('fio', '/vertical/weaving')).toBe(false);
    expect(canViewVertical('tecelagem', '/vertical/spinning')).toBe(false);
    expect(canViewVertical('textile', '/vertical/pharma')).toBe(false);
  });
  it('restringe serviços e geral e cobre todas as chaves do catálogo', () => {
    for (const segment of Object.keys(SEGMENTS)) {
      expect(() => allRoutes.map(route => canViewVertical(segment, route))).not.toThrow();
    }
    expect(allRoutes.some(route => canViewVertical('services', route))).toBe(false);
    expect(allRoutes.some(route => canViewVertical('general', route))).toBe(false);
  });
});
