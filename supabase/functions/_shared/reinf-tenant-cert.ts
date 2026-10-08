// Never fall back to a global A1: a different company must not sign using
// another tenant's private key. Secrets are configured per company UUID.
export function tenantReinfCertificateSecrets(
  getSecret: (name: string) => string | undefined,
  companyId: string,
): { certificate: string | undefined; password: string | undefined } {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
    throw new Error('invalid_company_id');
  }
  const suffix = companyId.replace(/-/g, '').toUpperCase();
  return {
    certificate: getSecret(`REINF_CERT_A1_B64_${suffix}`),
    password: getSecret(`REINF_CERT_A1_PASS_${suffix}`),
  };
}
