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
    expect(canPresentNicheRoute('industry', '/vertical/spinning', ['spinning'])).toBe(true);
    expect(canPresentNicheRoute('industry', '/vertical/weaving', ['spinning'])).toBe(false);
    expect(canPresentNicheRoute('industry', '/vertical/weaving', ['weaving'])).toBe(true);
    expect(canPresentNicheRoute('industry', '/vertical/food-feed', ['animal_feed'])).toBe(true);
    expect(canPresentNicheRoute('retail', '/vertical/spinning', ['spinning'])).toBe(false);
    expect(canPresentNicheRoute('industry', '/vertical/pharma', ['chemicals'])).toBe(false);
  });
  it('apresenta a central do setor industrial configurado (malharia/tinturaria)', () => {
    expect(canPresentNicheRoute('textile', '/vertical/knitting')).toBe(true);
    expect(canPresentNicheRoute('textile', '/vertical/dyeing')).toBe(true);
    expect(canPresentNicheRoute('industry', '/vertical/knitting', ['knitting'])).toBe(true);
    expect(canPresentNicheRoute('industry', '/vertical/dyeing', ['dyeing'])).toBe(true);
    expect(canPresentNicheRoute('industry', '/vertical/dyeing', ['knitting'])).toBe(false);
    expect(canPresentNicheRoute('retail', '/vertical/dyeing', ['dyeing'])).toBe(false);
  });
});
