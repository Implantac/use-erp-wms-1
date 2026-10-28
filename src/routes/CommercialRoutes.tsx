import { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { PrunedRoute } from '@/core/routes/PrunedRoute';

const CRMDashboardPage = lazy(() => import("../modules/commercial/CRMDashboard"));
const ClientsPage = lazy(() => import("../modules/commercial/Clients"));

const OrdersPage = lazy(() => import("../modules/commercial/Orders"));
const OrderTimelinePage = lazy(() => import("../pages/OrderTimeline"));
const CommercialQuotationsPage = lazy(() => import("../modules/commercial/Quotations"));
const CommercialDashboardPage = lazy(() => import("../modules/commercial/CommercialDashboard"));
const SalesFunnelPage = lazy(() => import("../modules/commercial/SalesFunnel"));
const SalesRepsPage = lazy(() => import("../modules/commercial/SalesReps"));
const CommissionsPage = lazy(() => import("../modules/commercial/Commissions"));
const SalesTargetsPage = lazy(() => import("../modules/commercial/SalesTargets"));
const ForecastPage = lazy(() => import("../modules/commercial/Forecast"));
const ForecastMonteCarloPage = lazy(() => import("../modules/commercial/ForecastMonteCarlo"));
const SellerDashboardPage = lazy(() => import("../modules/commercial/SellerDashboard"));
const CampaignsPage = lazy(() => import("../modules/commercial/Campaigns"));
const PerformanceDashboardPage = lazy(() => import("../modules/commercial/PerformanceDashboard"));
const AICommercialDashboardPage = lazy(() => import("../modules/commercial/AICommercialDashboard"));
const SalesExecutionPage = lazy(() => import("../modules/commercial/SalesExecution"));
const PlaybookPage = lazy(() => import("../modules/commercial/Playbook"));
const GamificationPage = lazy(() => import("../modules/commercial/Gamification"));
const SalesAutomationPage = lazy(() => import("../modules/commercial/SalesAutomation"));
const O2CExceptionsPage = lazy(() => import("../modules/commercial/O2CExceptions"));
const MarginAnalyticsPage = lazy(() => import("../modules/commercial/MarginAnalytics"));
const SalesReportCanalPage = lazy(() => import("../modules/commercial/SalesReportCanal"));
const SalesDeskPage = lazy(() => import("../modules/commercial/SalesDesk"));
const O2CMonitorPage = lazy(() => import("../modules/commercial/O2CMonitor"));
const Sales360Page = lazy(() => import("../modules/commercial/Sales360"));
const ClientProfilesPage = lazy(() => import("../modules/commercial/ClientProfiles"));

export const CommercialRoutes = [
  <Route key="comercial-index" index element={<Navigate to="dashboard" replace />} />,
  <Route key="comercial-crm" path="crm" element={<CRMDashboardPage />} />,
  <Route key="comercial-vendas-360" path="vendas-360" element={<Sales360Page />} />,
  <Route key="comercial-dashboard" path="dashboard" element={<CommercialDashboardPage />} />,
  <Route key="comercial-pdv" path="pdv" element={<SalesDeskPage />} />,
  <Route key="comercial-clientes" path="clientes" element={<ClientsPage />} />,
  <Route key="comercial-perfil-clientes" path="perfil-clientes" element={<ClientProfilesPage />} />,
  
  <Route key="comercial-pedidos" path="pedidos" element={<OrdersPage />} />,
  <Route key="comercial-pedido-timeline" path="pedidos/:orderId/timeline" element={<OrderTimelinePage />} />,
  <Route key="comercial-orcamentos" path="orcamentos" element={<CommercialQuotationsPage />} />,
  <Route key="comercial-funil" path="funil" element={<SalesFunnelPage />} />,
  <Route key="comercial-representantes" path="representantes" element={<SalesRepsPage />} />,
  <Route key="comercial-comissoes" path="comissoes" element={<CommissionsPage />} />,
  <Route key="comercial-metas" path="metas" element={<SalesTargetsPage />} />,
  <Route key="comercial-forecast" path="forecast" element={<ForecastPage />} />,
  <Route key="comercial-forecast-mc" path="forecast/monte-carlo" element={<ForecastMonteCarloPage />} />,
  <Route key="comercial-vendedor" path="vendedor" element={<SellerDashboardPage />} />,
  <Route key="comercial-campanhas" path="campanhas" element={<CampaignsPage />} />,
  <Route key="comercial-performance" path="performance" element={<PerformanceDashboardPage />} />,
  <Route key="comercial-ia" path="ia" element={<PrunedRoute href="/comercial/ia" fallback="/comercial/dashboard"><AICommercialDashboardPage /></PrunedRoute>} />,
  <Route key="comercial-execucao" path="execucao" element={<SalesExecutionPage />} />,
  <Route key="comercial-playbook" path="playbook" element={<PlaybookPage />} />,
  <Route key="comercial-gamificacao" path="gamificacao" element={<PrunedRoute href="/comercial/gamificacao" fallback="/comercial/dashboard"><GamificationPage /></PrunedRoute>} />,
  <Route key="comercial-automacao" path="automacao" element={<SalesAutomationPage />} />,
  <Route key="comercial-o2c-excecoes" path="o2c-excecoes" element={<O2CExceptionsPage />} />,
  <Route key="comercial-rentabilidade" path="rentabilidade" element={<MarginAnalyticsPage />} />,
  <Route key="comercial-relatorio-canal" path="relatorio-canal" element={<SalesReportCanalPage />} />,
  <Route key="comercial-o2c-monitor" path="o2c-monitor" element={<O2CMonitorPage />} />,
];
