import { beforeEach, describe, expect, it, vi } from 'vitest';

const { order, limit, eq, query, from, getActiveCompanyId } = vi.hoisted(() => {
  const limit = vi.fn();
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn();
  const query = { select: vi.fn(), eq, or: vi.fn(), in: vi.fn(), order };
  query.select.mockReturnValue(query);
  eq.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.in.mockReturnValue(query);
  const from = vi.fn(() => query);
  return { order, limit, eq, query, from, getActiveCompanyId: vi.fn(() => 'company-a') };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
vi.mock('@/core/stores/useEnterpriseStore', () => ({ getActiveCompanyId }));

import { supplyChainService } from './supplyChainService';

describe('supply chain reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveCompanyId.mockReturnValue('company-a');
    limit.mockResolvedValue({ data: [], error: null });
  });
  it('requires a tenant and never returns another company cache as empty success', async () => {
    getActiveCompanyId.mockReturnValue(null as unknown as string);
    await expect(supplyChainService.getMovements({ unit_id: 'branch' })).rejects.toThrow('Empresa');
    expect(from).not.toHaveBeenCalled();
  });
  it('scopes both company and branch and propagates query errors', async () => {
    limit.mockResolvedValueOnce({ data: null, error: new Error('RLS indisponível') });
    await expect(supplyChainService.getMovements({ unit_id: 'branch' })).rejects.toThrow('RLS indisponível');
    expect(eq).toHaveBeenCalledWith('company_id', 'company-a');
    expect(query.or).toHaveBeenCalledWith('origin_id.eq.branch,destination_id.eq.branch');
  });
  it('returns data only on successful lookup', async () => {
    limit.mockResolvedValueOnce({ data: [{ id: 'one' }], error: null });
    await expect(supplyChainService.getMovements({ unit_id: 'branch' })).resolves.toEqual([{ id: 'one' }]);
    expect(order).toHaveBeenCalled();
  });
});
