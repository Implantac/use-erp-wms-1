import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
const state = vi.hoisted(() => ({ error: null as Error | null, data: undefined as unknown, exportBlobs: [] as unknown[] }));
vi.mock('@/core/auth/EnterpriseContext', () => ({ useEnterprise: () => ({ userId: 'u', currentCompany: { id: 'c', name: 'Empresa teste' },
  currentBranch: null, allBranches: [], activeChannel: 'CONSOLIDADO' }) }));
vi.mock('./useProductionTracking', () => ({ useProductionTracking: () => ({ ready: true, contextKey: 'scope-a', access: { is_admin: false, enforced: false, access: {} }, data: state.data,
  error: state.error, loading: false, refreshing: false, refresh: vi.fn() }) }));
import { ProductionTrackingTab } from './ProductionTrackingTab';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = { id: id(3), company_id: id(2), branch_id: null, order_number: 'OP-TEC-1', product_code: 'TEC-1', product_name: 'Tecido', quantity: 100,
  produced_quantity: 50, rejected_quantity: null, unit: 'm', status: 'in_progress', priority: 'high', sector: 'tecelagem', work_center: null,
  client_name: null, sales_order_id: null, start_date: null, due_date: null, completed_date: null, created_at: '2026-11-04T10:00:00Z', updated_at: '2026-11-04T10:00:00Z' };
beforeEach(() => { state.error = null; state.data = { rows: [row], total: 51, page: 0, hasNext: true, contextKey: 'scope-a', canonicalSectorScope: false, loadedAt: '2026-11-04T10:00:00Z' }; state.exportBlobs = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function show() { return render(<MemoryRouter><ProductionTrackingTab /></MemoryRouter>); }
describe('S016 visible read-only report', () => {
  it('uses truthful page counts, explicit date basis and OP navigation, not mutation buttons', () => {
    show(); expect(screen.getByText('OPs nesta página')).toBeInTheDocument();
    expect(screen.getByLabelText('Criação da OP — início')).toBeInTheDocument();
    expect(screen.getByText(/51 no recorte consultado/)).toBeInTheDocument();
    expect(screen.getByText(/Produzido\/planejado não representa eficiência/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir OP' })).toHaveAttribute('href', '/producao/ordens?q=OP-TEC-1');
    expect(screen.queryByRole('button', { name: /concluir|expedir|receber|iniciar/i })).not.toBeInTheDocument();
    expect(screen.getByText('Rejeitado: Não informado')).toBeInTheDocument();
  });
  it('does not render zeroed cards or enable export after a failed read', () => {
    state.error = new Error('RLS negado'); state.data = undefined; show();
    expect(screen.getByRole('alert')).toHaveTextContent('Os totais não estão confirmados');
    expect(screen.queryByText('OPs nesta página')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar página atual (CSV)' })).toBeDisabled();
  });
  it('flags invalid quantities without converting them into zero or approved/efficient production', () => {
    state.data = { rows: [{ ...row, quantity: 0, produced_quantity: NaN, rejected_quantity: -1 }], total: 1, page: 0, hasNext: false, contextKey: 'scope-a', canonicalSectorScope: false, loadedAt: '2026-11-04T10:00:00Z' };
    show(); expect(screen.getByRole('alert')).toHaveTextContent('Conferir quantidades');
    expect(screen.getByRole('alert')).toHaveTextContent('Rejeitado informado inválido ou negativo');
    expect(screen.getByText('Não apurado — conferir quantidades')).toBeInTheDocument();
  });
  it('never exports or shows data with a different context signature', () => {
    state.data = { rows: [row], total: 1, page: 0, hasNext: false, contextKey: 'old-company', canonicalSectorScope: false, loadedAt: '2026-11-04T10:00:00Z' };
    show(); expect(screen.queryByText('OP-TEC-1')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exportar página atual (CSV)' })).toBeDisabled();
  });
  it('marks canonical sector coverage and unknown total explicitly', () => {
    state.data = { rows: [], total: null, page: 0, hasNext: false, contextKey: 'scope-a', canonicalSectorScope: true, loadedAt: '2026-11-04T10:00:00Z' }; show();
    expect(screen.getByText(/Textos legados com outra classificação não estão incluídos/)).toBeInTheDocument();
    expect(screen.getByText(/total não apurado/)).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma OP no recorte consultado.')).not.toBeInTheDocument();
  });
  it('creates and downloads an actual CSV Blob for the displayed page', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn((blob: unknown) => { state.exportBlobs.push(blob); return 'blob:unit-test-only'; }) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    show(); fireEvent.click(screen.getByRole('button', { name: 'Exportar página atual (CSV)' }));
    expect(state.exportBlobs).toHaveLength(1);
    const blob = state.exportBlobs[0] as Blob;
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(blob);
    });
    expect(blob.type).toBe('text/csv;charset=utf-8;'); expect(text).toContain('OP-TEC-1');
    expect(click).toHaveBeenCalledTimes(1); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:unit-test-only'); click.mockRestore();
  });
});
