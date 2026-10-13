import { describe, expect, it } from 'vitest';
import { normalizeSegment, SEGMENTS } from './adaptive';

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
