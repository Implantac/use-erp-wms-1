import { describe, expect, it } from 'vitest';
import { complianceService } from './complianceService';

describe('security status without audit evidence', () => {
  it('does not report a certified or secure result', async () => {
    const metrics = await complianceService.getSecurityMetrics();
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.every(metric => metric.status !== 'secure')).toBe(true);
    await expect(complianceService.runSecurityScan()).rejects.toThrow('não implementado');
  });
});
