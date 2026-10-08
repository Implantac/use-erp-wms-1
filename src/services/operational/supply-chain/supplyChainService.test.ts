import { beforeEach, describe, expect, it, vi } from 'vitest';

const { order, limit, eq, query, from, rpc, getActiveCompanyId } = vi.hoisted(() => {
  const rpc = vi.fn();
  const limit = vi.fn();
  const order = vi.fn(() => ({ limit }));
  const eq = vi.fn();
  const query = { select: vi.fn(), eq, or: vi.fn(), in: vi.fn(), order };
  query.select.mockReturnValue(query);
  eq.mockReturnValue(query);
  query.or.mockReturnValue(query);
  query.in.mockReturnValue(query);
  const from = vi.fn(() => query);
  return { order, limit, eq, query, from, rpc, getActiveCompanyId: vi.fn(() => 'company-a') };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from, rpc } }));
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
  it('rejects cross-tenant request before writing and sends one atomic RPC for valid items', async () => {
    const request = {
      company_id: 'company-a', origin_id: 'branch-a', destination_id: 'branch-b',
      origin_type: 'store', destination_type: 'warehouse',
      items: [{ movement_id: 'unused', product_id: 'product-a', requested_qty: 2 }],
    };
    await expect(supplyChainService.createRequest({ ...request, company_id: 'company-b' })).rejects.toThrow('Empresa');
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: { id: 'movement-a' }, error: null });
    await expect(supplyChainService.createRequest(request)).resolves.toEqual({ id: 'movement-a' });
    expect(rpc).toHaveBeenCalledWith('create_supply_chain_request', expect.objectContaining({
      _origin_id: 'branch-a', _items: [{ product_id: 'product-a', requested_qty: 2, unit_price: null }],
    }));
    expect(from).not.toHaveBeenCalled();
  });
  it('does not claim success when the atomic operation fails', async () => {
    const request = {
      company_id: 'company-a', origin_id: 'branch-a', destination_id: 'branch-b',
      origin_type: 'store', destination_type: 'warehouse',
      items: [{ movement_id: 'unused', product_id: 'product-a', requested_qty: 2 }],
    };
    rpc.mockResolvedValueOnce({ data: null, error: new Error('rollback') });
    await expect(supplyChainService.createRequest(request)).rejects.toThrow('rollback');
  });
});
