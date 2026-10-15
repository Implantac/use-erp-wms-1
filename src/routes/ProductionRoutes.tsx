import { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';

const ProductionOrdersPage = lazy(() => import("../modules/production/ProductionOrders"));
const MaterialConsumptionPage = lazy(() => import("../modules/production/MaterialConsumption"));
const TimeEntriesPage = lazy(() => import("../modules/production/TimeEntries"));
const PCPPanelPage = lazy(() => import("../modules/production/PCPPanel"));
const ProductionStepsPage = lazy(() => import("../modules/production/ProductionSteps"));
const ProductionQueuePage = lazy(() => import("../modules/production/ProductionQueue"));
const QualityControlPage = lazy(() => import("../modules/production/QualityControl"));
const SupplyStockPage = lazy(() => import("../modules/production/SupplyStock"));
const ProductCostsPage = lazy(() => import("../modules/production/ProductCosts"));
const IndustrialDashboardPage = lazy(() => import("../modules/production/IndustrialDashboard"));
const OperatorTerminalPage = lazy(() => import("../modules/production/OperatorTerminal"));
const ShopFloorDashboardPage = lazy(() => import("../modules/production/ShopFloorDashboard"));
const ProductionKanbanPage = lazy(() => import("../modules/production/ProductionKanban"));
const TechnicalSheetsPage = lazy(() => import("../modules/production/TechnicalSheets"));
const ProductionMachinesPage = lazy(() => import("../modules/production/ProductionMachinesPage"));
const ProductionCapacityPage = lazy(() => import("../modules/production/ProductionCapacity"));
const ProductionTraceabilityPage = lazy(() => import("../modules/production/ProductionTraceability"));
const AIProductionPage = lazy(() => import("../modules/production/AIProductionPage"));
const ProductionSchedulePage = lazy(() => import("../modules/production/ProductionSchedule"));
const MRPPage = lazy(() => import("../modules/production/MRPPage"));
const BIIndustrialPage = lazy(() => import("../modules/production/BIIndustrial"));
const DigitalTwinPage = lazy(() => import("../modules/production/DigitalTwin"));
const APSPageComponent = lazy(() => import("../modules/production/APSPage"));
const IoTDashboardPage = lazy(() => import("../modules/production/IoTDashboard"));
const OEEDashboardPage = lazy(() => import("../modules/production/OEEDashboard"));
const MLPredictionsPage = lazy(() => import("../modules/production/MLPredictions"));
const ProductionSectorsPage = lazy(() => import("../modules/production/ProductionSectors"));
const ProductionLinesPage = lazy(() => import("../modules/production/ProductionLinesPage"));
const ProductionResourcesPage = lazy(() => import("../modules/production/ProductionResourcesPage"));
const ProductionRoutesPage = lazy(() => import("../modules/production/ProductionRoutesPage"));
const OutsourcingPage = lazy(() => import("../modules/production/OutsourcingPage"));
const APSMultiPage = lazy(() => import("../modules/production/APSMulti"));

export const ProductionRoutes = [
  <Route key="prod-index" index element={<Navigate to="dashboard" replace />} />,
  <Route key="prod-orders" path="ordens" element={<ProductionOrdersPage />} />,
  <Route key="prod-cons" path="consumo" element={<MaterialConsumptionPage />} />,
  <Route key="prod-time" path="apontamento" element={<TimeEntriesPage />} />,
  <Route key="prod-pcp" path="pcp" element={<PCPPanelPage />} />,
  <Route key="prod-steps" path="etapas" element={<ProductionStepsPage />} />,
  <Route key="prod-queue" path="fila" element={<ProductionQueuePage />} />,
  <Route key="prod-quality" path="qualidade" element={<QualityControlPage />} />,
  <Route key="prod-supply" path="insumos" element={<SupplyStockPage />} />,
  <Route key="prod-costs" path="custos" element={<ProductCostsPage />} />,
  <Route key="prod-dash" path="dashboard" element={<IndustrialDashboardPage />} />,
  <Route key="prod-industrial-dash" path="dashboard-industrial" element={<Navigate to="/producao/dashboard" replace />} />,
  <Route key="prod-term" path="terminal" element={<OperatorTerminalPage />} />,
  <Route key="prod-shop" path="chao-de-fabrica" element={<ShopFloorDashboardPage />} />,
  <Route key="prod-kanban" path="kanban" element={<ProductionKanbanPage />} />,
  <Route key="prod-tech" path="fichas" element={<TechnicalSheetsPage />} />,
  <Route key="prod-machines" path="maquinas" element={<ProductionMachinesPage />} />,
  <Route key="prod-cap" path="capacidade" element={<ProductionCapacityPage />} />,
  <Route key="prod-trace" path="rastreabilidade" element={<ProductionTraceabilityPage />} />,
  <Route key="prod-ia" path="ia" element={<AIProductionPage />} />,
  <Route key="prod-sched" path="programacao" element={<ProductionSchedulePage />} />,
  <Route key="prod-mrp" path="mrp" element={<MRPPage />} />,
  <Route key="prod-bi" path="bi" element={<BIIndustrialPage />} />,
  <Route key="prod-twin" path="twin" element={<DigitalTwinPage />} />,
  <Route key="prod-aps" path="aps" element={<APSPageComponent />} />,
  <Route key="prod-aps-multi" path="aps/multi" element={<APSMultiPage />} />,
  <Route key="prod-iot" path="iot" element={<IoTDashboardPage />} />,
  <Route key="prod-oee" path="oee" element={<OEEDashboardPage />} />,
  <Route key="prod-ml" path="previsoes" element={<MLPredictionsPage />} />,
  <Route key="prod-sect" path="setores" element={<ProductionSectorsPage />} />,
  <Route key="prod-lines" path="linhas" element={<ProductionLinesPage />} />,
  <Route key="prod-res" path="recursos" element={<ProductionResourcesPage />} />,
  <Route key="prod-routes" path="roteiros" element={<ProductionRoutesPage />} />,
  <Route key="prod-out" path="terceirizacao" element={<OutsourcingPage />} />,
];
