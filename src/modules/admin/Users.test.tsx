import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const fake = vi.hoisted(() => ({ getAll: vi.fn(), childMounted: vi.fn() }));
vi.mock('@/services/system/usersService', () => ({ usersService: { getAll: fake.getAll } }));
vi.mock('@/stores/useAppStore', () => ({ useAppStore: () => ({ userRole: 'admin' }) }));
vi.mock('@/shared/components/PageContainer', () => ({ PageContainer: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@/shared/components/ExportButton', () => ({ ExportButton: () => <button>Exportar usuários</button> }));
vi.mock('./users/UsersStats', () => ({ UsersStats: () => { fake.childMounted(); return <div>Estatísticas</div>; } }));
vi.mock('./users/UsersFilters', () => ({ UsersFilters: () => { fake.childMounted(); return <div>Filtros</div>; } }));
vi.mock('./users/UsersTable', () => ({ UsersTable: () => { fake.childMounted(); return <div>Nenhum usuário encontrado</div>; } }));
vi.mock('./users/SectorAccessCard', () => ({ SectorAccessCard: () => { fake.childMounted(); return <div>Acessos</div>; } }));
vi.mock('./users/UserDialog', async () => {
  const { useUsers } = await import('@/hooks/system/useUsers');
  return { UserDialog: () => {
    // Reproduz o segundo observer REAL que remontava a query em erro.
    useUsers();
    fake.childMounted();
    return <div>Diálogo de usuários</div>;
  } };
});
import UsersPage from './Users';

const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 1, retryDelay: 10, refetchOnWindowFocus: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><UsersPage /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  // Falha de servico isolada para testar o estado da UI, nunca sucesso falso.
  fake.getAll.mockRejectedValue(new Error('QA16_UNAVAILABLE_DETAIL_503'));
});
afterEach(() => { clients.splice(0).forEach((client) => client.clear()); });

describe('Users — falha limitada, sem remount/retry infinito', () => {
  it('anuncia o carregamento em vez de mostrar um spinner mudo', () => {
    fake.getAll.mockImplementation(() => new Promise(() => {}));
    setup();
    expect(screen.getByRole('status')).toHaveTextContent('Carregando usuários');
    expect(screen.getByRole('heading', { name: 'Gestão de Usuários' })).toBeInTheDocument();
    expect(fake.childMounted).not.toHaveBeenCalled();
  });

  it('mostra alerta acionavel, sem erro tecnico nem lista vazia enganosa', async () => {
    setup();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível carregar os usuários.');
    expect(alert).not.toHaveTextContent('QA16_UNAVAILABLE_DETAIL_503');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled();
    expect(screen.queryByText('Nenhum usuário encontrado')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Novo Usuário' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Exportar usuários' })).toBeNull();
    expect(fake.childMounted).not.toHaveBeenCalled();
  });

  it('para depois da tentativa inicial mais um retry, sem novo observer', async () => {
    setup();
    await screen.findByRole('alert');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fake.getAll).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('status')).toBeNull();
    expect(fake.childMounted).not.toHaveBeenCalled();
  });

  it('retry manual inicia outro ciclo limitado e volta a habilitar o botao', async () => {
    setup();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(fake.getAll).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled());
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fake.getAll).toHaveBeenCalledTimes(4);
    expect(fake.childMounted).not.toHaveBeenCalled();
  });
});
