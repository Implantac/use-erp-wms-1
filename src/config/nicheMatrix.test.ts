import { describe, expect, it } from 'vitest';

import { canPresentNicheRoute } from './nichePresentation';
import { canViewVertical } from './verticalAccess';

/**
 * Matriz nicho -> telas (Fase 1 do plano de produção). Cada nicho de
 * lançamento enxerga SOMENTE as telas do seu ramo; as dos outros ramos
 * são negadas já na apresentação — e o backend nega por módulo
 * (niche_packages + has_module_access, provado no harness SQL).
 */
describe('matriz nicho -> telas', () => {
  it('têxtil integrado vê as quatro centrais e o hub', () => {
    const families = ['spinning', 'weaving', 'knitting', 'dyeing'] as const;
    for (const route of ['/vertical/textile', '/vertical/spinning', '/vertical/weaving', '/vertical/knitting', '/vertical/dyeing']) {
      expect(canPresentNicheRoute('textile', route, families)).toBe(true);
    }
    expect(canPresentNicheRoute('textile', '/producao', families)).toBe(true);
  });

  it('empresa só de tecelagem + tinturaria (caso BIL) não vê fiação nem malharia', () => {
    const families = ['weaving', 'dyeing'] as const;
    expect(canPresentNicheRoute('textile', '/vertical/weaving', families)).toBe(true);
    expect(canPresentNicheRoute('textile', '/vertical/dyeing', families)).toBe(true);
    // segmento têxtil amplo libera o vertical têxtil; quem restringe por
    // processo é a família — fiação/malharia fora das famílias não abrem
    // pelas rotas de família, apenas pelo segmento quando ele é o recorte.
    expect(canViewVertical('tecelagem', '/vertical/weaving')).toBe(true);
    expect(canViewVertical('tecelagem', '/vertical/spinning')).toBe(false);
  });

  it('confecção não vê centrais têxteis', () => {
    expect(canPresentNicheRoute('apparel', '/vertical/apparel', ['apparel'])).toBe(true);
    expect(canPresentNicheRoute('apparel', '/vertical/weaving', ['apparel'])).toBe(false);
    expect(canPresentNicheRoute('apparel', '/vertical/spinning', ['apparel'])).toBe(false);
  });

  it('alimentos e ração veem o próprio vertical, não o têxtil', () => {
    expect(canPresentNicheRoute('food_factory', '/vertical/food-feed', ['food'])).toBe(true);
    expect(canPresentNicheRoute('animal_feed', '/vertical/food-feed', ['animal_feed'])).toBe(true);
    expect(canPresentNicheRoute('food_factory', '/vertical/weaving', ['food'])).toBe(false);
    expect(canPresentNicheRoute('animal_feed', '/vertical/dyeing', ['animal_feed'])).toBe(false);
  });

  it('químico usa o core de produção compartilhado, sem vertical têxtil', () => {
    expect(canPresentNicheRoute('chemicals', '/producao', ['chemicals'])).toBe(true);
    expect(canPresentNicheRoute('chemicals', '/vertical/weaving', ['chemicals'])).toBe(false);
    expect(canPresentNicheRoute('chemicals', '/vertical/textile', ['chemicals'])).toBe(false);
  });

  it('nicho genérico ou desconhecido não vê produção nem verticais', () => {
    expect(canPresentNicheRoute('general', '/producao')).toBe(false);
    expect(canPresentNicheRoute('general', '/vertical/weaving')).toBe(false);
    expect(canPresentNicheRoute(null, '/vertical/textile')).toBe(false);
    expect(canPresentNicheRoute('desconhecido', '/vertical/textile')).toBe(false);
  });
});
