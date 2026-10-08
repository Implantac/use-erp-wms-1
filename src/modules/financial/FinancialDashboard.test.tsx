import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FinancialDashboard from './FinancialDashboard';
import { useEnterpriseStore } from '@/core/stores/useEnterpriseStore';
import { useBankAccounts } from '@/hooks/financial/useBankAccounts';
import { useAccountsPayable } from '@/hooks/financial/useAccountsPayable';
import { useAccountsReceivable } from '@/hooks/financial/useAccountsReceivable';

vi.mock('@/hooks/financial/useBankAccounts', () => ({ useBankAccounts: vi.fn() }));
vi.mock('@/hooks/financial/useAccountsPayable', () => ({ useAccountsPayable: vi.fn() }));
vi.mock('@/hooks/financial/useAccountsReceivable', () => ({ useAccountsReceivable: vi.fn() }));

const banks = vi.mocked(useBankAccounts);
const payables = vi.mocked(useAccountsPayable);
const receivables = vi.mocked(useAccountsReceivable);
const query = (data: unknown, isError = false) => ({ data, isError, isLoading: false, refetch: vi.fn() });
const view = () => render(<MemoryRouter><FinancialDashboard /></MemoryRouter>);

beforeEach(() => {
  useEnterpriseStore.setState({ activeCompanyId: 'company-a' });
  banks.mockReturnValue(query([{ active: true, balance: 150 }, { active: false, balance: 900 }]) as ReturnType<typeof useBankAccounts>);
  payables.mockReturnValue(query([]) as ReturnType<typeof useAccountsPayable>);
  receivables.mockReturnValue(query([]) as ReturnType<typeof useAccountsReceivable>);
});

describe('FinancialDashboard', () => {
  it('mostra saldo consultado sem números fictícios', () => {
    view();
    expect(screen.getByText('R$ 150,00')).toBeTruthy();
    expect(screen.queryByText('R$ 1.842.000,00')).toBeNull();
    expect(screen.queryByText('EBITDA Gerencial')).toBeNull();
  });

  it('não mostra totais incompletos quando uma consulta falha', () => {
    payables.mockReturnValue(query(undefined, true) as ReturnType<typeof useAccountsPayable>);
    view();
    expect(screen.getByRole('alert').textContent).toContain('Não foi possível consultar');
    expect(screen.queryByText('R$ 150,00')).toBeNull();
  });

  it('não apresenta zero como dado real sem empresa ativa', () => {
    useEnterpriseStore.setState({ activeCompanyId: null });
    view();
    expect(screen.getByText(/Selecione uma empresa/)).toBeTruthy();
    expect(screen.queryByText('R$ 150,00')).toBeNull();
  });

  it('avisa sobre o limite de registros antes de apresentar uma amostra', () => {
    banks.mockReturnValue(query(Array.from({ length: 100 }, () => ({ active: true, balance: 1 }))) as ReturnType<typeof useBankAccounts>);
    view();
    expect(screen.getByText(/consultas atingiram o limite/)).toBeTruthy();
  });
});
