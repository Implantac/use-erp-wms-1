import { describe, expect, it } from 'vitest';
import { computeCoverage, coverageDaysText, coverageLabel, formatRuptureDate } from './coverageMath';

describe('computeCoverage', () => {
  it('classifica ruptura quando projeta menos de 1 dia', () => {
    const r = computeCoverage({ quantity: 5, dailyDemand: 10, minStock: 30 });
    expect(r.status).toBe('critical');
    expect(r.coverageDays).toBeCloseTo(0.5);
    expect(r.ruptureDate).not.toBeNull();
  });

  it('marca atenção abaixo de 3 dias de cobertura', () => {
    const r = computeCoverage({ quantity: 10, dailyDemand: 4 });
    expect(r.status).toBe('attention');
    expect(r.coverageDays).toBeCloseTo(2.5);
  });

  it('desconta reservado e soma trânsito na projeção', () => {
    const r = computeCoverage({ quantity: 20, reserved: 5, inTransit: 15, dailyDemand: 2 });
    expect(r.available).toBe(15);
    expect(r.inTransit).toBe(15);
    expect(r.projected).toBe(30);
    expect(r.coverageDays).toBeCloseTo(15);
    expect(r.status).toBe('normal');
  });

  it('sem demanda não é ruptura: status no_data e ruptura nula', () => {
    const r = computeCoverage({ quantity: 0, dailyDemand: 0 });
    expect(r.status).toBe('no_data');
    expect(r.coverageDays).toBeNull();
    expect(r.ruptureDate).toBeNull();
  });

  it('saldo zerado com demanda = ruptura imediata (data = agora)', () => {
    const now = new Date('2026-11-24T12:00:00');
    const r = computeCoverage({ quantity: 0, dailyDemand: 3 }, now);
    expect(r.status).toBe('critical');
    expect(r.ruptureDate?.getTime()).toBe(now.getTime());
  });

  it('detecta excesso acima de 30 dias de cobertura', () => {
    const r = computeCoverage({ quantity: 400, dailyDemand: 5 });
    expect(r.status).toBe('excess');
    expect(r.coverageDays).toBeCloseTo(80);
  });

  it('abaixo de 50% do mínimo é critical mesmo com dias suficientes', () => {
    const r = computeCoverage({ quantity: 4, dailyDemand: 1, minStock: 20 });
    expect(r.status).toBe('critical');
    expect(r.gapToMin).toBe(16);
  });

  it('trata entradas inválidas como zero (fecha fechado)', () => {
    const r = computeCoverage({ quantity: Number.NaN, dailyDemand: Number.NaN });
    expect(r.available).toBe(0);
    expect(r.status).toBe('no_data');
  });

  it('data de ruptura soma os dias de cobertura à data base', () => {
    const now = new Date('2026-11-24T00:00:00');
    const r = computeCoverage({ quantity: 10, dailyDemand: 2 }, now);
    expect(r.coverageDays).toBeCloseTo(5);
    expect(r.ruptureDate).toEqual(new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000));
  });
});

describe('rótulos', () => {
  it('coverageLabel cobre todos os estados', () => {
    expect(coverageLabel('critical')).toBe('Ruptura');
    expect(coverageLabel('attention')).toBe('Atenção');
    expect(coverageLabel('normal')).toBe('Saudável');
    expect(coverageLabel('excess')).toBe('Excesso');
    expect(coverageLabel('no_data')).toBe('Sem giro');
  });

  it('formatRuptureDate devolve — quando não há data', () => {
    expect(formatRuptureDate(null)).toBe('—');
    expect(formatRuptureDate(new Date(2026, 10, 30))).toBe('30/11');
  });

  it('coverageDaysText traduz nulo e grandes valores', () => {
    expect(coverageDaysText(null)).toBe('sem demanda');
    expect(coverageDaysText(1500)).toBe('999+ dias');
    expect(coverageDaysText(2.56)).toBe('2.6 d');
  });
});
