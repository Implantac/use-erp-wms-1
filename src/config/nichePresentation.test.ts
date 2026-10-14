import { describe, expect, it } from 'vitest';
import { canPresentNicheRoute } from './nichePresentation';

describe('apresentação contextual por ramo, sem conceder permissão', () => {
  it('oculta PCP para comércio, serviços, distribuidores e ramos desconhecidos, inclusive URL direta', () => {
    for (const segment of ['retail', 'services', 'distribution', 'general', 'outro', '__proto__', null]) {
      expect(canPresentNicheRoute(segment, '/producao')).toBe(false);
      expect(canPresentNicheRoute(segment, '/producao/ordens')).toBe(false);
    }
  });
  it('preserva núcleo PCP compartilhado aos ramos de transformação', () => {
    for (const segment of ['textile', 'fio', 'tecelagem', 'dyeing', 'laundry', 'apparel', 'animal_feed', 'food_factory', 'chemicals', 'industry', 'pharma']) {
      expect(canPresentNicheRoute(segment, '/producao/ordens')).toBe(true);
    }
  });
  it('não exibe vertical de outro ramo nem inventa vertical inexistente', () => {
    expect(canPresentNicheRoute('fio', '/vertical/weaving')).toBe(false);
    expect(canPresentNicheRoute('textile', '/vertical/spinning')).toBe(true);
    expect(canPresentNicheRoute('chemicals', '/vertical/pharma')).toBe(false);
    expect(canPresentNicheRoute('laundry', '/vertical/unknown')).toBe(false);
    expect(canPresentNicheRoute('retail', '/estoque/produtos')).toBe(true);
  });
});
