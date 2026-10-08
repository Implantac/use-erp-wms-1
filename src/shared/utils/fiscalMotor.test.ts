import { describe, expect, it } from 'vitest';
import { calculateTaxes, generateNFeXML } from './fiscalMotor';

const item = { price: 100, quantity: 1, ncm: '12345678' };
const rule = {
  origin_state: 'PR', destination_state: 'SP', ncm: '12345678',
  icms_rate: 18, icms_st_rate: 0, ipi_rate: 0, pis_rate: 1.65, cofins_rate: 7.6,
  ibs_rate: 0.1, cbs_rate: 0.9,
};

describe('prévia fiscal sem alíquotas presumidas', () => {
  it('rejeita ausência de regra e de alíquota IBS/CBS explícita', () => {
    expect(() => calculateTaxes(item, 'PR', 'SP', [], 'real', 'hybrid')).toThrow('Regra fiscal ausente');
    expect(() => calculateTaxes(item, 'PR', 'SP', [{ ...rule, cbs_rate: null }], 'real', 'hybrid')).toThrow('CBS');
  });
  it('não reduz tributos atuais artificialmente nem adiciona IBS/CBS ao total legado', () => {
    const result = calculateTaxes(item, 'PR', 'SP', [rule], 'real', 'hybrid');
    expect(result.icms_value).toBe(18);
    expect(result.ibs_value).toBeCloseTo(0.1);
    expect(result.cbs_value).toBeCloseTo(0.9);
    expect(result.total_taxes).toBeCloseTo(27.25);
  });
  it('não inventa percentuais da reforma em modo atual', () => {
    const result = calculateTaxes(item, 'PR', 'SP', [{ ...rule, cbs_rate: null, ibs_rate: null }], 'real', 'current');
    expect(result.cbs_value).toBe(0);
    expect(result.ibs_value).toBe(0);
  });
  it('não gera XML de NF-e fictício', () => {
    expect(() => generateNFeXML()).toThrow('XML fiscal indisponível');
  });
});
