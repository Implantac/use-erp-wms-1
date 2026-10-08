import { describe, expect, it } from 'vitest';
import { lastMileService, orchestrationService } from './orchestrationService';

describe('legacy network integrations without an operational backend', () => {
  it('rejects fabricated sourcing, manifests and tracking events', async () => {
    await expect(orchestrationService.calculateSourcing([], 'company')).rejects.toThrow('indisponível');
    await expect(lastMileService.createManifest(['transfer'])).rejects.toThrow('indisponível');
    await expect(lastMileService.trackShipment('tracking')).rejects.toThrow('indisponível');
  });
});
