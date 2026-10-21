import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc, from: vi.fn() },
}));

import { transferWorkflow, canTransition } from './transferWorkflow';
import { transferService } from './transferService';
import { storeService } from '@/services/operational/store/storeService';

describe('fluxo de transferência atômico no servidor (RPCs oficiais)', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { id: 't1', status: 'SUGERIDA' }, error: null });
  });

  it('transition delega para transition_stock_transfer com itens mapeados', async () => {
    await transferWorkflow.transition({
      transferId: 't1',
      toStatus: 'RECEBIDA',
      userId: 'u1',
      itemQuantities: [{ itemId: 'i1', quantity: 9 }],
    });
    expect(rpc).toHaveBeenCalledWith('transition_stock_transfer', {
      p_transfer_id: 't1',
      p_to_status: 'RECEBIDA',
      p_items: [{ item_id: 'i1', quantity: 9 }],
      p_notes: null,
    });
  });

  it('createTransfer delega para create_stock_transfer_request (sem escrever direto)', async () => {
    await transferService.createTransfer({
      companyId: 'c', originUnitId: 'o', destinationUnitId: 'd', userId: 'u',
      items: [{ productId: 'p', quantity: 2 }],
    });
    expect(rpc).toHaveBeenCalledWith('create_stock_transfer_request', {
      p_origin_unit_id: 'o',
      p_destination_unit_id: 'd',
      p_items: [{ product_id: 'p', quantity: 2 }],
      p_notes: null,
    });
  });

  it('registerLoss delega para register_stock_loss', async () => {
    await storeService.registerLoss({ branch_id: 'b', product_id: 'p', quantity: 2, reason: 'AVARIA' });
    expect(rpc).toHaveBeenCalledWith('register_stock_loss', {
      p_product_id: 'p',
      p_branch_id: 'b',
      p_quantity: 2,
      p_reason: 'AVARIA',
      p_notes: null,
    });
  });

  it('a máquina de estados do cliente continua proibindo saltos', () => {
    expect(canTransition('SUGERIDA', 'APROVADA')).toBe(true);
    expect(canTransition('SUGERIDA', 'EXPEDIDA')).toBe(false);
    expect(canTransition('EM TRÂNSITO', 'RECEBIDA COM DIVERGÊNCIA')).toBe(true);
    expect(canTransition('ENCERRADA', 'APROVADA')).toBe(false);
  });
});
