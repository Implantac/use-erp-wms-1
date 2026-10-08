import { describe, expect, it } from 'vitest';
import { tenantReinfCertificateSecrets } from '../../../../supabase/functions/_shared/reinf-tenant-cert';

const companyA = '12345678-1234-1234-1234-123456789abc';
const companyB = 'abcdefab-abcd-abcd-abcd-abcdefabcdef';

describe('secrets A1 EFD-Reinf por empresa', () => {
  it('não usa o certificado global de outra empresa', () => {
    const secrets = new Map([
      ['REINF_CERT_A1_B64', 'global-cert'],
      ['REINF_CERT_A1_PASS', 'global-pass'],
      ['REINF_CERT_A1_B64_12345678123412341234123456789ABC', 'a-cert'],
      ['REINF_CERT_A1_PASS_12345678123412341234123456789ABC', 'a-pass'],
    ]);
    const get = (key: string) => secrets.get(key);
    expect(tenantReinfCertificateSecrets(get, companyA)).toEqual({ certificate: 'a-cert', password: 'a-pass' });
    expect(tenantReinfCertificateSecrets(get, companyB)).toEqual({ certificate: undefined, password: undefined });
  });

  it('rejeita identificador de empresa inválido', () => {
    expect(() => tenantReinfCertificateSecrets(() => 'secret', '../company')).toThrow('invalid_company_id');
  });
});
