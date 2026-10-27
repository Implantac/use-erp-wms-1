import { lazy } from 'react';
import { Navigate, Route } from 'react-router-dom';

const StoreCentral = lazy(() => import('@/modules/operational/store/StoreCentral'));
const StoreOperations = lazy(() => import('@/modules/store-operations/StoreOperations'));

export const StoreRoutes = [
  <Route key="store-index" path="/operacional/loja" element={<Navigate to="/operacional/loja/central" replace />} />,
  <Route key="store-central" path="/operacional/loja/central" element={<StoreCentral />} />,
  <Route key="store-ops" path="/operacional/loja/operacao" element={<StoreOperations />} />,
];
