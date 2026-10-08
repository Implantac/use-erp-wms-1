import { describe, expect, it } from 'vitest';
import { transferWorkflow } from './transferWorkflow';
import { transferService } from './transferService';
import { storeService } from '@/services/operational/store/storeService';

describe('non-atomic legacy stock operations', () => {
  it('rejects transitions, creation and loss before any write', async () => {
    await expect(transferWorkflow.transition({ transferId: 't', toStatus: 'EXPEDIDA', userId: 'u' })).rejects.toThrow('indisponível');
    await expect(transferService.createTransfer({ companyId: 'c', originUnitId: 'o', destinationUnitId: 'd', userId: 'u', items: [{ productId: 'p', quantity: 2 }] })).rejects.toThrow('indisponível');
    await expect(storeService.registerLoss({ branch_id: 'o', product_id: 'p', quantity: 2, reason: 'test' })).rejects.toThrow('indisponível');
  });
});
