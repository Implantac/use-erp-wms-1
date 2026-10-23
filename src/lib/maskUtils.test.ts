import { describe, expect, it } from 'vitest';
import { maskCEP, maskCNPJ, validateCNPJ } from './maskUtils';

describe('validação de CNPJ usada no cadastro de empresas', () => {
  it('aceita o CNPJ matriz da BIL Importação e Exportação LTDA', () => {
    expect(validateCNPJ('30.965.938/0001-07')).toBe(true);
    expect(validateCNPJ('30965938000107')).toBe(true);
  });

  it('rejeita dígitos verificadores incorretos e sequências repetidas', () => {
    expect(validateCNPJ('30.965.938/0001-08')).toBe(false);
    expect(validateCNPJ('11.111.111/1111-11')).toBe(false);
    expect(validateCNPJ('123')).toBe(false);
  });

  it('aplica as máscaras de CNPJ e CEP enquanto o usuário digita', () => {
    expect(maskCNPJ('30965938000107')).toBe('30.965.938/0001-07');
    expect(maskCEP('88318251')).toBe('88318-251');
  });
});
