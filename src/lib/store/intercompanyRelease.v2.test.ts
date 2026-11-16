import { describe, expect, it } from 'vitest';
import { formatReleaseQuantity, releasePresentation } from './intercompanyRelease';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input = { requestId: id(1), productionOrderId: id(2), productionStatus: 'completed', readState: 'ready' as const };

describe('LOJ-05A v2: incomplete proof stays closed and quantities stay truthful', () => {
  it('does not offer another release when an order is linked but its proof is not visible', () => {
    const value = releasePresentation({ ...input, salesOrderId: id(3) });
    expect(value.canReview).toBe(false); expect(value.kind).toBe('inconsistent');
    expect(value.label).toMatch(/pedido.*lastro/i);
  });
  it.each(['', 'legacy-op-without-uuid'])('does not offer review for an unconfirmed OP identifier %j', productionOrderId => {
    expect(releasePresentation({ ...input, productionOrderId }).canReview).toBe(false);
  });
  it('does not treat an explicitly empty linked-order identifier as confirmed absence', () => {
    expect(releasePresentation({ ...input, salesOrderId: '' }).canReview).toBe(false);
  });
  it.each([[0.000001, '0,000001 kg'], [1.23456789, '1,23456789 kg']] as const)('preserves the registered quantity %s instead of rounding it to zero/three decimals', (quantity, label) => {
    expect(formatReleaseQuantity(quantity, 'kg')).toBe(label);
  });
});
