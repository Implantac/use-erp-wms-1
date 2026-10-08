import { normalizeValidReinfCnpj } from './reinf-cnpj.ts';

export interface ReinfCertificateIdentity {
  subject: string;
  not_before: string;
  not_after: string;
}

/** Fail closed: signing under another company's identity is never acceptable. */
export function validateReinfCertificate(
  cert: ReinfCertificateIdentity,
  companyCnpj: string,
  now: Date = new Date(),
): 'valid' | 'invalid_company_cnpj' | 'certificate_company_mismatch' | 'certificate_not_valid' {
  const cnpj = normalizeValidReinfCnpj(companyCnpj);
  if (!cnpj) return 'invalid_company_cnpj';
  // ICP-Brasil A1 certificates commonly carry the holder CNPJ in the CN.
  // If an issuer uses a different subject format, require explicit validation
  // instead of silently accepting an unverified certificate.
  const subjectsCnpjs = cert.subject.match(/(?<!\d)\d{14}(?!\d)/g) ?? [];
  if (!subjectsCnpjs.includes(cnpj)) return 'certificate_company_mismatch';
  const start = Date.parse(cert.not_before);
  const end = Date.parse(cert.not_after);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > now.getTime() || end <= now.getTime()) {
    return 'certificate_not_valid';
  }
  return 'valid';
}
