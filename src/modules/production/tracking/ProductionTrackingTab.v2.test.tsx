import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
const state = vi.hoisted(() => ({ refreshing: false, filters: {} as Record<string, unknown>, page: 0, emptyLaterPage: false }));
vi.mock('@/core/auth/EnterpriseContext', () => ({ useEnterprise: () => ({ userId: 'u', currentCompany: { id: 'c', name: 'Empresa teste' }, currentBranch: null, allBranches: [], activeChannel: 'CONSOLIDADO' }) }));
vi.mock('./useProductionTracking', () => ({ useProductionTracking: (filters: Record<string, unknown>, page: number) => {
  state.filters = filters; state.page = page;
  return { ready: true, contextKey: 'scope', access: { is_admin: false, enforced: false, access: {} }, loading: false, refreshing: state.refreshing, error: null, refresh: vi.fn(),
    data: { rows: state.emptyLaterPage && page > 0 ? [] : [{ id: 'id-1', company_id: 'c', branch_id: null, order_number: 'OP-1', product_code: 'SKU', product_name: 'Tecido', quantity: 100, produced_quantity: 50, rejected_quantity: null,
      unit: 'm', status: 'in_progress', priority: 'high', sector: null, work_center: null, client_name: null, due_date: null, start_date: null, completed_date: null }],
      total: state.emptyLaterPage && page > 0 ? 0 : 51, hasNext: page === 0, page, contextKey: 'scope', canonicalSectorScope: false, loadedAt: '2026-11-04T10:00:00Z' } };
} }));
import { defaultTrackingFilters } from './productionTrackingModel';
import { ProductionTrackingTab } from './ProductionTrackingTab';
beforeEach(() => { state.refreshing = false; state.filters = {}; state.page = 0; state.emptyLaterPage = false; });
afterEach(cleanup);
function show() { return render(<MemoryRouter><ProductionTrackingTab /></MemoryRouter>); }
describe('S016 v2: recoverable filters, navigation and accessible read status', () => {
  it('resets filters and pagination explicitly to the last 30 calendar dates', () => {
    show(); fireEvent.change(screen.getByLabelText('Buscar OP, SKU, produto ou cliente'), { target: { value: 'TEC-123' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'paused' } });
    fireEvent.change(screen.getByLabelText('Criação da OP — início'), { target: { value: '2020-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' })); expect(state.page).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros (últimos 30 dias)' }));
    expect(state.filters).toEqual(defaultTrackingFilters()); expect(state.page).toBe(0);
  });
  it('announces a background re-read while export is blocked', () => {
    state.refreshing = true; show();
    expect(screen.getByRole('status')).toHaveTextContent('Atualizando a leitura');
    expect(screen.getByRole('region', { name: 'Acompanhamento de produção' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Exportar página atual (CSV)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Limpar filtros (últimos 30 dias)' })).toBeEnabled();
  });
  it('offers a direct return to the first page after the current page becomes empty', () => {
    state.emptyLaterPage = true; show(); fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(state.page).toBe(1); expect(screen.queryByText('OP-1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à primeira página' }));
    expect(state.page).toBe(0); expect(screen.getByText('OP-1')).toBeInTheDocument();
  });
  it('identifies all table headers as column headers', () => {
    show(); for (const header of screen.getAllByRole('columnheader')) expect(header).toHaveAttribute('scope', 'col');
  });
});
