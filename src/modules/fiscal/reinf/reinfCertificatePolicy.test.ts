import { describe, expect, it } from 'vitest';
import { validateReinfCertificate } from '../../../../supabase/functions/_shared/reinf-certificate-policy';

const now = new Date('2026-10-08T12:00:00Z');
const certificate = {
  subject: 'CN=EMPRESA EXEMPLO:11222333000181,O=ICP-Brasil',
  not_before: '2026-01-01T00:00:00Z',
  not_after: '2027-01-01T00:00:00Z',
};

describe('política de certificado EFD-Reinf', () => {
  it('aceita A1 vigente cujo titular contém o CNPJ da empresa', () => {
    expect(validateReinfCertificate(certificate, '11.222.333/0001-81', now)).toBe('valid');
  });
  it('rejeita certificado de outro tenant', () => {
    expect(validateReinfCertificate(certificate, '12.345.678/0001-90', now)).toBe('certificate_company_mismatch');
  });
  it('rejeita certificado expirado ou ainda não vigente', () => {
    expect(validateReinfCertificate({ ...certificate, not_after: '2026-01-01' }, '11222333000181', now)).toBe('certificate_not_valid');
    expect(validateReinfCertificate({ ...certificate, not_before: '2027-01-01' }, '11222333000181', now)).toBe('certificate_not_valid');
  });
  it('falha fechado quando a identidade do titular não contém CNPJ verificável', () => {
    expect(validateReinfCertificate({ ...certificate, subject: 'CN=UNKNOWN' }, '11222333000181', now)).toBe('certificate_company_mismatch');
  });
});
