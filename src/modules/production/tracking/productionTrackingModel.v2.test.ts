import { describe, expect, it } from 'vitest';
import { displayTrackingNumber, parseTrackingSectorAccess } from './productionTrackingModel';

describe('S016 v2: strict grants and truthful quantity display', () => {
  it.each([{ level: ['viewer'] }, { level: { toString: () => 'viewer' } }])('rejects a non-string sector grant instead of coercing it: %j', ({ level }) => {
    expect(() => parseTrackingSectorAccess({ is_admin: false, enforced: true, access: { tecelagem: level } })).toThrow(/Permissão/);
  });
  it.each([[0.000000001, '0,000000001'], [0.123456789, '0,123456789']] as const)('preserves the registered finite quantity %s on screen', (value, expected) => {
    expect(displayTrackingNumber(value)).toBe(expected);
  });
});
