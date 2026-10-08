// Fiscal CNPJ validation (numeric 14-digit format used by the current Reinf XML).
// Reject repeated digits and verify both check digits before signing any event.
export function normalizeValidReinfCnpj(value: string): string | null {
  const cnpj = value.replace(/\D/g, '');
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return null;

  const digits = Array.from(cnpj, Number);
  const check = (weights: number[]) => {
    const sum = weights.reduce((acc, weight, index) => acc + digits[index] * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const second = [6, ...first];
  if (digits[12] !== check(first) || digits[13] !== check(second)) return null;
  return cnpj;
}
