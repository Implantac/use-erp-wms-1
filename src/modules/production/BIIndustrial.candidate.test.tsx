import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ tracking: vi.fn() }));
vi.mock('./bi/useBIMetrics', () => ({ useBIMetrics: () => ({}) }));
vi.mock('./bi/BIScorecards', () => ({ BIScorecards: () => null }));
vi.mock('./bi/ExecutiveTab', () => ({ ExecutiveTab: () => <p>Executivo existente</p> }));
vi.mock('./bi/ParetoTab', () => ({ ParetoTab: () => null }));
vi.mock('./bi/ProfitTab', () => ({ ProfitTab: () => null }));
vi.mock('./bi/CostTab', () => ({ CostTab: () => null }));
vi.mock('./bi/OEETab', () => ({ OEETab: () => null }));
vi.mock('./bi/TrendTab', () => ({ TrendTab: () => null }));
vi.mock('./bi/StrategicTab', () => ({ StrategicTab: () => null }));
vi.mock('./tracking/ProductionTrackingTab', () => ({ ProductionTrackingTab: () => { state.tracking(); return <p>Acompanhamento com filtros próprios de criação da OP</p>; } }));
vi.mock('@/shared/components/PageContainer', () => ({ PageContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('@/shared/components/PageHeader', () => ({ PageHeader: ({ title, children }: { title: string; children: React.ReactNode }) => <header><h1>{title}</h1>{children}</header> }));
import BIIndustrialPage from './BIIndustrial';
afterEach(() => { cleanup(); state.tracking.mockClear(); });
describe('S016 stays in existing BI tabs', () => {
  it('preserves the existing default tab and mounts tracking only when explicitly selected', () => {
    render(<BIIndustrialPage />);
    expect(screen.getByText('Executivo existente')).toBeInTheDocument(); expect(state.tracking).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Acompanhamento' }), { button: 0, ctrlKey: false });
    expect(screen.getByText('Acompanhamento com filtros próprios de criação da OP')).toBeInTheDocument();
    expect(screen.queryByText('Executivo existente')).not.toBeInTheDocument(); expect(state.tracking).toHaveBeenCalled();
    expect(screen.getByText('Janela apenas das tendências:')).toBeInTheDocument();
  });
});
