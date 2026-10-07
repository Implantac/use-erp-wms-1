/**
 * EOE ARCHITECTURE ROADMAP & TECHNICAL LOG (STABILIZED)
 * 
 * SYSTEM AUDIT COMPLETE - 2026-08-17
 * 1. React Error #185: Fixed via decoupled event publishing and microtask navigation.
 * 2. Enterprise Stability: Atomic session synchronization implemented in EnterpriseContext.
 * 3. Logistic-Fiscal Traceability: E2E correlation_id preservation validated.
 * 4. Security Hardening: RLS consolidation and data integrity triggers active.
 */
import { Suspense, lazy, useMemo, memo } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { OnboardingGuard } from '@/components/OnboardingGuard';
import { MainLayout } from '@/core/layout/MainLayout';
import { ModuleErrorBoundary } from '@/shared/components/ModuleErrorBoundary';
import { PageLoading } from '@/shared/components/PageLoading';


// Critical Pages - Eager Load to prevent white screens on initial entry
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import NotFound from "@/pages/NotFound";

// Route Collections - These export arrays of Route elements
import { CommercialRoutes } from './CommercialRoutes';
import { FinancialRoutes } from './FinancialRoutes';
import { OperationalRoutes } from './OperationalRoutes';
import { AdminRoutes } from './AdminRoutes';
import { FiscalRoutes } from './FiscalRoutes';
import { AccountingRoutes } from './AccountingRoutes';
import { ProductionRoutes } from './ProductionRoutes';
import { WMSRoutes } from './WMSRoutes';
import { RelacionamentoRoutes } from './RelacionamentoRoutes';
import { NetworkRoutes } from './NetworkRoutes';
import { MiscellaneousRoutes } from './MiscellaneousRoutes';
import { ExecutiveRoutes } from './ExecutiveRoutes';
import { EvolutionAuditRoutes } from './EvolutionAuditRoutes';
import { StoreRoutes } from './StoreRoutes';
import { VerticalPackRoutes } from '@/core/routes/VerticalPackRoutes';

// Domain-Specific Lazy Components
const UnifiedSupplyChain = lazy(() => import('@/modules/operational/supply-chain/UnifiedSupplyChain'));
const StoreCentral = lazy(() => import('@/modules/operational/store/StoreCentral'));
const ManualModule = lazy(() => import('@/modules/admin/systemManual/SystemManual'));
const SuccessDashboard = lazy(() => import('@/modules/success/SuccessDashboard'));
const InventoryProductsPage = lazy(() => import('@/pages/inventory/Products'));
const InventoryMovementsPage = lazy(() => import('@/pages/inventory/Movements'));
const InventoryKardexPage = lazy(() => import('@/pages/inventory/Kardex'));
const InventoryBalancesPage = lazy(() => import('@/modules/wms/StockBalances'));
const PurchaseOrdersPage = lazy(() => import('@/pages/purchasing/PurchaseOrders'));
const SuppliersPage = lazy(() => import('@/pages/purchasing/Suppliers'));
const PurchaseQuotationsPage = lazy(() => import('@/pages/purchasing/Quotations'));
const ProcurementDashboardPage = lazy(() => import('@/pages/purchasing/ProcurementDashboard'));
const PendenciasPage = lazy(() => import('@/pages/Pendencias'));

/**
 * Performance-optimized Page Loader
 * Centralized loading state for all lazy-loaded routes
 */
const PageLoader = () => <PageLoading message="Sincronizando Ecossistema..." />;

const legacyAliasMap: Array<[string, string]> = [
  ['/production/', '/producao/'],
  ['/commerce/', '/comercial/'],
  ['/logistica/', '/wms/'],
  ['/billing/', '/financeiro/'],
  ['/wms/reposicao', '/wms/ressuprimento'],
  ['/logistica/recebimento', '/wms/recebimento'],
  ['/logistica/transferencias', '/operacional/rede/transferencias'],
  ['/estoque/inventario', '/estoque/saldos'],
  ['/marketplace', '/admin/manual'],
  ['/saude/', '/dashboard'],
  ['/agro/', '/dashboard'],
  ['/construcao/', '/dashboard'],
];

const LegacyAliasRedirect = () => {
  const { pathname, search } = useLocation();

  for (const [from, to] of legacyAliasMap) {
    if (pathname === from || pathname.startsWith(from)) {
      const suffix = pathname === from ? '' : pathname.slice(from.length);
      const target = `${to}${suffix}`;
      return <Navigate to={`${target}${search || ''}`} replace />;
    }
  }

  return <Navigate to={`/dashboard${search || ''}`} replace />;
};

/**
 * Enterprise Operating Ecosystem (EOE) Optimized Router
 * Centralizes all application routing with performance best practices:
 * 1. Code Splitting (Lazy Loading)
 * 2. Error Boundaries per Module
 * 3. Protected Context (MainLayout & OnboardingGuard)
 * 4. Memoized Route Tree
 */
const AppRoutes = memo(() => {
  const routes = useMemo(() => (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      
      {/* Protected Layout Scope */}
      <Route element={<MainLayout />}>
        <Route element={<OnboardingGuard />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/pendencias" element={
            <Suspense fallback={<PageLoader />}>
              <PendenciasPage />
            </Suspense>
          } />

          {/* Executive & AI domain */}
          <Route path="/executive/*" element={
            <ModuleErrorBoundary moduleName="Executivo & IA">
              <Routes>{ExecutiveRoutes}<Route path="*" element={<NotFound />} /></Routes>
            </ModuleErrorBoundary>
          } />
          <Route path="/success" element={
            <Suspense fallback={<PageLoader />}>
              <SuccessDashboard />
            </Suspense>
          } />

          {/* Parent routes used by navigation and direct URL entry */}
          <Route path="/comercial" element={<Navigate to="/comercial/dashboard" replace />} />
          <Route path="/financeiro" element={<Navigate to="/financeiro/dashboard" replace />} />
          <Route path="/fiscal" element={<Navigate to="/fiscal/dashboard" replace />} />
          <Route path="/contabilidade" element={<Navigate to="/contabilidade/dashboard" replace />} />
          <Route path="/producao" element={<Navigate to="/producao/dashboard" replace />} />
          <Route path="/wms" element={<Navigate to="/wms/dashboard" replace />} />
          <Route path="/tms" element={<Navigate to="/tms/dashboard" replace />} />
          <Route path="/rfid" element={<Navigate to="/rfid/dashboard" replace />} />
          <Route path="/admin" element={<Navigate to="/admin/manual" replace />} />
          <Route path="/operacional" element={<Navigate to="/operacional/abastecimento" replace />} />

          {/* Legacy aliases for old URLs and stale links */}
          <Route path="/production/*" element={<LegacyAliasRedirect />} />
          <Route path="/commerce/*" element={<LegacyAliasRedirect />} />
          <Route path="/logistica/*" element={<LegacyAliasRedirect />} />
          <Route path="/billing/*" element={<LegacyAliasRedirect />} />
          <Route path="/marketplace" element={<LegacyAliasRedirect />} />
          <Route path="/saude/*" element={<LegacyAliasRedirect />} />
          <Route path="/agro/*" element={<LegacyAliasRedirect />} />
          <Route path="/construcao/*" element={<LegacyAliasRedirect />} />
          <Route path="/estoque/inventario" element={<LegacyAliasRedirect />} />
          <Route path="/wms/reposicao" element={<LegacyAliasRedirect />} />
          <Route path="/logistica/recebimento" element={<LegacyAliasRedirect />} />
          <Route path="/logistica/transferencias" element={<LegacyAliasRedirect />} />

          {/* Inventory and purchasing aliases used by the sidebar */}
          <Route path="/estoque/produtos" element={<InventoryProductsPage />} />
          <Route path="/estoque/saldos" element={<InventoryBalancesPage />} />
          <Route path="/estoque/movimentacoes" element={<InventoryMovementsPage />} />
          <Route path="/estoque/kardex" element={<InventoryKardexPage />} />
          <Route path="/compras/pedidos" element={<PurchaseOrdersPage />} />
          <Route path="/compras/fornecedores" element={<SuppliersPage />} />
          <Route path="/compras/cotacoes" element={<PurchaseQuotationsPage />} />
          <Route path="/compras/dashboard" element={<ProcurementDashboardPage />} />
          
          {/* Commercial Domain */}
          <Route path="/comercial/*" element={
            <ModuleErrorBoundary moduleName="Comercial">
              <Routes>{CommercialRoutes}<Route path="*" element={<NotFound />} /></Routes>
            </ModuleErrorBoundary>
          } />
          
          {/* Financial Domain */}
          <Route path="/financeiro/*" element={
            <ModuleErrorBoundary moduleName="Financeiro">
              <Routes>{FinancialRoutes}<Route path="*" element={<NotFound />} /></Routes>
            </ModuleErrorBoundary>
          } />

          {/* Logistics & WMS Domain */}
          <Route path="/wms/*" element={
            <ModuleErrorBoundary moduleName="WMS">
              <Routes>{WMSRoutes}<Route path="*" element={<NotFound />} /></Routes>
            </ModuleErrorBoundary>
          } />

          {/* Operational & Supply Chain Domain */}
          <Route path="/operacional/abastecimento" element={
            <Suspense fallback={<PageLoader />}>
              <UnifiedSupplyChain />
            </Suspense>
          } />
          <Route path="/operacional/loja/central" element={
            <Suspense fallback={<PageLoader />}>
              <StoreCentral />
            </Suspense>
          } />
          <Route path="/operacional/rede/*" element={
            <ModuleErrorBoundary moduleName="Rede">
              <Routes>{NetworkRoutes}<Route path="*" element={<NotFound />} /></Routes>
            </ModuleErrorBoundary>
          } />
          <Route path="/operacional/*" element={
            <ModuleErrorBoundary moduleName="Operacional">
              <Routes>{OperationalRoutes}<Route path="*" element={<NotFound />} /></Routes>
            </ModuleErrorBoundary>
          } />

          {/* Accounting Domain */}
          <Route path="/contabilidade/*" element={
            <ModuleErrorBoundary moduleName="Contábil">
              <Routes>{AccountingRoutes}<Route path="*" element={<NotFound />} /></Routes>
            </ModuleErrorBoundary>
          } />

          {/* Production Domain */}
          <Route path="/producao/*" element={
            <ModuleErrorBoundary moduleName="Produção">
              <Routes>{ProductionRoutes}<Route path="*" element={<NotFound />} /></Routes>
            </ModuleErrorBoundary>
          } />

          {/* Fiscal Domain */}
          <Route path="/fiscal/*" element={
            <ModuleErrorBoundary moduleName="Fiscal">
              <Routes>{FiscalRoutes}<Route path="*" element={<NotFound />} /></Routes>
            </ModuleErrorBoundary>
          } />

          {/* Relationship (CRM/NPS) Domain */}
          <Route path="/relacionamento/*" element={
            <ModuleErrorBoundary moduleName="Relacionamento">
              <Routes>{RelacionamentoRoutes}<Route path="*" element={<NotFound />} /></Routes>
            </ModuleErrorBoundary>
          } />

          {/* Administration & Governance Domain */}
          <Route path="/admin/manual" element={
            <Suspense fallback={<PageLoader />}>
              <ManualModule />
            </Suspense>
          } />
          <Route path="/admin/*" element={
            <ModuleErrorBoundary moduleName="Admin">
              <Routes>{AdminRoutes}<Route path="*" element={<NotFound />} /></Routes>
            </ModuleErrorBoundary>
          } />

          {/* Existing standalone route collections */}
          {StoreRoutes}
          {EvolutionAuditRoutes}
          {VerticalPackRoutes}

          {/* Miscellaneous routes */}
          {MiscellaneousRoutes}
        </Route>
      </Route>

      {/* 404 & Redirects */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  ), []);

  return (
    <Suspense fallback={<PageLoader />}>
      {routes}
    </Suspense>
  );
});

export default AppRoutes;
