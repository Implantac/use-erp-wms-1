import { describe, expect, it } from 'vitest';
import { calculateTaxes, generateNFeXML } from './fiscalMotor';

const item = { price: 100, quantity: 1, ncm: '12345678', cfop: '5102' };
const rule = {
  origin_state: 'PR', destination_state: 'SP', ncm: '12345678', cfop: '5102', issuer_tax_regime: 'real',
  reviewed_for_preview: true, valid_from: '2026-01-01', valid_until: null,
  icms_rate: 18, icms_st_rate: 0, ipi_rate: 0, pis_rate: 1.65, cofins_rate: 7.6,
  ibs_rate: 0.1, cbs_rate: 0.9,
};

describe('prévia fiscal sem alíquotas presumidas', () => {
  it('rejeita ausência de regra e de alíquota IBS/CBS explícita', () => {
    expect(() => calculateTaxes(item, 'PR', 'SP', [], 'real', 'hybrid', '2026-10-08')).toThrow('Regra fiscal ausente');
    expect(() => calculateTaxes(item, 'PR', 'SP', [{ ...rule, cbs_rate: null }], 'real', 'hybrid', '2026-10-08')).toThrow('CBS');
  });
  it('não reduz tributos atuais artificialmente nem adiciona IBS/CBS ao total legado', () => {
    const result = calculateTaxes(item, 'PR', 'SP', [rule], 'real', 'hybrid', '2026-10-08');
    expect(result.icms_value).toBe(18);
    expect(result.ibs_value).toBeCloseTo(0.1);
    expect(result.cbs_value).toBeCloseTo(0.9);
    expect(result.total_taxes).toBeCloseTo(27.25);
  });
  it('não inventa percentuais da reforma em modo atual', () => {
    const result = calculateTaxes(item, 'PR', 'SP', [{ ...rule, cbs_rate: null, ibs_rate: null }], 'real', 'current', '2026-10-08');
    expect(result.cbs_value).toBe(0);
    expect(result.ibs_value).toBe(0);
  });
  it('rejeita regra não revisada, CFOP ou regime diferente e regras duplicadas', () => {
    expect(() => calculateTaxes(item, 'PR', 'SP', [{ ...rule, reviewed_for_preview: false }], 'real', 'hybrid', '2026-10-08')).toThrow('Regra fiscal');
    expect(() => calculateTaxes(item, 'PR', 'SP', [rule], 'simples', 'hybrid', '2026-10-08')).toThrow('Regra fiscal');
    expect(() => calculateTaxes({ ...item, cfop: '6102' }, 'PR', 'SP', [rule], 'real', 'hybrid', '2026-10-08')).toThrow('Regra fiscal');
    expect(() => calculateTaxes(item, 'PR', 'SP', [rule, rule], 'real', 'hybrid', '2026-10-08')).toThrow('ambígua');
    expect(() => calculateTaxes(item, 'PR', 'SP', [rule], 'real', 'hybrid', '2025-12-31')).toThrow('Regra fiscal');
  });
  it('não gera XML de NF-e fictício', () => {
    expect(() => generateNFeXML()).toThrow('XML fiscal indisponível');
  });
});
