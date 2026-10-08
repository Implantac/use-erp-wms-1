import { describe, expect, it } from 'vitest';
import { SalesOrchestrator } from './SalesOrchestrator';

describe('legacy sale orchestrator', () => {
  it('does not mark orders as completed without atomic stock and finance effects', async () => {
    await expect(SalesOrchestrator.completeSale('order-id', 'company-id')).rejects.toThrow('indisponível');
  });
});
