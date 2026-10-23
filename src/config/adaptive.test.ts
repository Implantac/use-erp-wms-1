import { describe, expect, it } from 'vitest';
import { isHiddenHref, normalizeSegment, SEGMENTS, SHOWCASE_HREFS } from './adaptive';

describe('segmentos de novos clientes e legados', () => {
  it.each([
    ['confeccao', 'apparel'], ['industria', 'industry'],
    ['distribuicao', 'distribution'], ['varejo', 'retail'],
    ['servicos', 'services'],
  ])('converte %s para %s no catálogo', (stored, expected) => {
    expect(normalizeSegment(stored)).toBe(expected);
    expect(SEGMENTS[normalizeSegment(stored)!]).toBeDefined();
  });

  it('mantém nichos já canônicos', () => {
    for (const segment of Object.keys(SEGMENTS)) expect(normalizeSegment(segment)).toBe(segment);
  });

  it.each([null, undefined, '', 'outro', 'outro-nicho', '__proto__'])('não habilita catálogo para %s', value => {
    expect(normalizeSegment(value)).toBeNull();
  });
});

describe('poda de telas de vitrine', () => {
  it('esconde as telas de vitrine em todos os nichos', () => {
    for (const segment of Object.keys(SEGMENTS)) {
      for (const href of SHOWCASE_HREFS) {
        expect(isHiddenHref(segment, href)).toBe(true);
      }
    }
  });

  it('mantém as telas operacionais visíveis', () => {
    for (const href of ['/producao/ordens', '/producao/pcp', '/compras/dashboard', '/fiscal/dashboard', '/operacional/loja']) {
      expect(isHiddenHref('apparel', href)).toBe(false);
      expect(isHiddenHref('textile', href)).toBe(false);
    }
  });

  it('segmento desconhecido não esconde nada (fail-open no helper)', () => {
    expect(isHiddenHref(null, '/producao/ia')).toBe(false);
    expect(isHiddenHref('unconfigured', '/producao/ia')).toBe(false);
  });
});
