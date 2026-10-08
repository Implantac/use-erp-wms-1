import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEnterpriseStore } from '@/core/stores/useEnterpriseStore';
import { useAccountsPayable } from './useAccountsPayable';
import { useAccountsReceivable } from './useAccountsReceivable';
import { useBankAccounts } from './useBankAccounts';
import { financialService } from '@/services/financial/financialService';
import { bankAccountsService } from '@/services/financial/bankAccountsService';

vi.mock('@/services/financial/financialService', () => ({
  financialService: { getPayables: vi.fn(), getReceivables: vi.fn() },
}));
vi.mock('@/services/financial/bankAccountsService', () => ({
  bankAccountsService: { getAll: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  useEnterpriseStore.setState({ activeCompanyId: null });
});

describe('consultas financeiras por empresa', () => {
  it.each([
    ['pagar', useAccountsPayable, financialService.getPayables],
    ['receber', useAccountsReceivable, financialService.getReceivables],
    ['contas', useBankAccounts, bankAccountsService.getAll],
  ])('%s não consulta sem empresa e não reutiliza cache de outro tenant', async (_label, hook, service) => {
    vi.mocked(service).mockImplementation(async (companyId: string) => [{ id: companyId }] as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => hook(), { wrapper });
    expect(service).not.toHaveBeenCalled();
    act(() => useEnterpriseStore.setState({ activeCompanyId: 'empresa-a' }));
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'empresa-a' }]));
    act(() => useEnterpriseStore.setState({ activeCompanyId: 'empresa-b' }));
    await waitFor(() => expect(result.current.data).toEqual([{ id: 'empresa-b' }]));
    expect(service).toHaveBeenCalledWith('empresa-a');
    expect(service).toHaveBeenCalledWith('empresa-b');
    client.clear();
  });
});
