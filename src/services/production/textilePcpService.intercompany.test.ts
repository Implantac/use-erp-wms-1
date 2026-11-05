import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import { produceIntercompanyRequest } from './textilePcpService';

describe('produceIntercompanyRequest', () => {
  beforeEach(() => { rpc.mockReset(); });

  it('usa apenas a RPC transacional e envia o UUID integral da solicitação', async () => {
    const requestId = 'f6000000-0000-4000-8000-000000000099';
    const payload = {
      id: requestId,
      status: 'producao_solicitada',
      production_order_id: 'f6000000-0000-4000-8000-000000000098',
      order_number: 'OP-20261105-0001',
      production_order_status: 'planned',
      idempotent_replay: false,
    };
    rpc.mockResolvedValue({ data: payload, error: null });

    await expect(produceIntercompanyRequest(requestId)).resolves.toEqual(payload);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('produce_intercompany_request', { p_request_id: requestId });
  });

  it('não converte falha da RPC em decisão bem-sucedida', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Produto sem BOM; transação revertida' } });

    await expect(produceIntercompanyRequest('f6000000-0000-4000-8000-000000000099'))
      .rejects.toThrow('Produto sem BOM; transação revertida');
  });
});
