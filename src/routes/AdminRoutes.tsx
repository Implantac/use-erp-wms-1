import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { AccessGuard } from '@/components/auth/AccessGuard';
import { AccessDenied } from '@/shared/components/AccessDenied';

const UsersPage = lazy(() => import("../modules/admin/Users"));
const CompaniesPage = lazy(() => import("../modules/admin/Companies"));
const ParametersPage = lazy(() => import("../modules/admin/Parameters"));
const SuperAdminPage = lazy(() => import("../modules/admin/SuperAdmin"));
const DailyReportsPage = lazy(() => import("../modules/admin/DailyReports"));
const CrossModuleAuditPage = lazy(() => import("../modules/admin/CrossModuleAudit"));
const MetadataConfiguratorPage = lazy(() => import("../modules/admin/MetadataConfigurator"));
const WorkflowEnginePage = lazy(() => import("../modules/admin/WorkflowEngine"));
const AutomationEnginePage = lazy(() => import("../modules/admin/AutomationEngine"));
const DashboardEnginePage = lazy(() => import("../modules/admin/DashboardEngine"));
const SecurityAuditPage = lazy(() => import("../modules/admin/SecurityAudit"));
const SecurityAuditLogsPage = lazy(() => import("../modules/admin/SecurityAuditLogs"));
const SystemManualPage = lazy(() => import("../modules/admin/systemManual/SystemManual"));
const ModuleManualDetailPage = lazy(() => import("../modules/admin/systemManual/ModuleManualDetail"));
const CriticalAuditLogPage = lazy(() => import("../modules/admin/CriticalAuditLog"));
const PrivacidadePage = lazy(() => import("../modules/admin/Privacidade"));
const GlobalSettingsPage = lazy(() => import("../modules/admin/GlobalSettings"));
const EnterpriseConfigPage = lazy(() => import("../modules/admin/enterprise-config/EnterpriseConfig"));
const AuditLogsPage = lazy(() => import("../modules/admin/systemManual/AuditLogs"));






// QA-UX: fallback explicito. Sem ele, o AccessGuard devolvia `null` para
// quem passou no OperationalScopeGuard mas nao tem a role exigida.
const adminOnly = (el: JSX.Element) => (
  <AccessGuard roles={["admin", "manager"]} fallback={<AccessDenied moduleName="esta área de configuração" />}>{el}</AccessGuard>
);

const superOnly = (el: JSX.Element) => (
  <AccessGuard roles={["admin", "system_admin"]} fallback={<AccessDenied moduleName="a administração do sistema" />}>{el}</AccessGuard>
);

export const AdminRoutes = [
  <Route key="adm-users" path="usuarios" element={adminOnly(<UsersPage />)} />,
  <Route key="adm-comp" path="empresas" element={adminOnly(<CompaniesPage />)} />,
  <Route key="adm-param" path="parametros" element={adminOnly(<ParametersPage />)} />,
  <Route key="adm-super" path="super" element={superOnly(<SuperAdminPage />)} />,
  <Route key="adm-rep" path="relatorios" element={adminOnly(<DailyReportsPage />)} />,
  <Route key="adm-audit" path="auditoria" element={adminOnly(<CrossModuleAuditPage />)} />,
  <Route key="adm-metadata" path="metadata" element={adminOnly(<MetadataConfiguratorPage />)} />,
  <Route key="adm-workflow" path="workflows" element={adminOnly(<WorkflowEnginePage />)} />,
  <Route key="adm-automation" path="automacoes" element={adminOnly(<AutomationEnginePage />)} />,
  <Route key="adm-dashboards" path="dashboards" element={adminOnly(<DashboardEnginePage />)} />,
  <Route key="adm-security-audit" path="seguranca/auditoria" element={adminOnly(<SecurityAuditPage />)} />,
  <Route key="adm-security-logs" path="seguranca/logs" element={adminOnly(<SecurityAuditLogsPage />)} />,
  <Route key="adm-manual" path="manual" element={<SystemManualPage />} />,
  <Route key="adm-manual-detail" path="manual/:slug" element={<ModuleManualDetailPage />} />,
  <Route key="adm-critical-audit" path="auditoria-critica" element={adminOnly(<CriticalAuditLogPage />)} />,
  <Route key="adm-privacidade" path="privacidade" element={<PrivacidadePage />} />,
  <Route key="adm-config" path="configuracoes" element={adminOnly(<GlobalSettingsPage />)} />,
  <Route key="adm-enterprise" path="empresa" element={adminOnly(<EnterpriseConfigPage />)} />,

  <Route key="adm-system-audit" path="auditoria-sistema" element={adminOnly(<AuditLogsPage />)} />,


];


