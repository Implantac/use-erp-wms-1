import { describe, expect, it } from 'vitest';
import { buildReinfLoteXml } from '../../../../supabase/functions/_shared/reinf-lote-xml';

describe('XML de lote EFD-Reinf', () => {
  it('usa o CNPJ cadastrado da empresa no contribuinte', () => {
    const xml = buildReinfLoteXml('<evtRetPrestServ Id="test"/>', '12.345.678/0001-90');
    expect(xml).toContain('<nrInsc>12345678000190</nrInsc>');
    expect(xml).toContain('<eventos><evtRetPrestServ Id="test"/></eventos>');
    expect(xml).not.toContain('_TENANT_');
  });

  it.each(['', '123', 'invalid', '123456789012345'])('rejeita CNPJ inválido %s', cnpj => {
    expect(() => buildReinfLoteXml('<evento/>', cnpj)).toThrow('invalid_company_cnpj');
  });
});
