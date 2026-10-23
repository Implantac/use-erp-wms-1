import { lazy } from 'react';
import { Route } from 'react-router-dom';

const TextileDashboard = lazy(() => import("@/modules/production/TextileDashboard"));
const PharmaDashboard = lazy(() => import("@/modules/production/PharmaDashboard"));
const RetailDashboard = lazy(() => import("@/modules/production/RetailDashboard"));
const DistributionDashboard = lazy(() => import("@/modules/production/DistributionDashboard"));
const FoodFeedDashboard = lazy(() => import("@/modules/production/FoodFeedDashboard"));
const ApparelDashboard = lazy(() => import("@/modules/production/ApparelDashboard"));
const SpinningDashboard = lazy(() => import("@/modules/production/SpinningDashboard"));
const WeavingDashboard = lazy(() => import("@/modules/production/WeavingDashboard"));
const KnittingDashboard = lazy(() => import("@/modules/production/KnittingDashboard"));
const DyeingDashboard = lazy(() => import("@/modules/production/DyeingDashboard"));
const WholesalerDashboard = lazy(() => import("@/modules/production/WholesalerDashboard"));
const FranchiseDashboard = lazy(() => import("@/modules/production/FranchiseDashboard"));
const HoldingDashboard = lazy(() => import("@/modules/production/HoldingDashboard"));

export const VerticalPackRoutes = [
  <Route key="textile-dashboard" path="/vertical/textile" element={<TextileDashboard />} />,
  <Route key="pharma-dashboard" path="/vertical/pharma" element={<PharmaDashboard />} />,
  <Route key="retail-dashboard" path="/vertical/retail" element={<RetailDashboard />} />,
  <Route key="distribution-dashboard" path="/vertical/distribution" element={<DistributionDashboard />} />,
  <Route key="food-feed-dashboard" path="/vertical/food-feed" element={<FoodFeedDashboard />} />,
  <Route key="apparel-dashboard" path="/vertical/apparel" element={<ApparelDashboard />} />,
  <Route key="spinning-dashboard" path="/vertical/spinning" element={<SpinningDashboard />} />,
  <Route key="weaving-dashboard" path="/vertical/weaving" element={<WeavingDashboard />} />,
  <Route key="knitting-dashboard" path="/vertical/knitting" element={<KnittingDashboard />} />,
  <Route key="dyeing-dashboard" path="/vertical/dyeing" element={<DyeingDashboard />} />,
  <Route key="wholesaler-dashboard" path="/vertical/wholesaler" element={<WholesalerDashboard />} />,
  <Route key="franchise-dashboard" path="/vertical/franchise" element={<FranchiseDashboard />} />,
  <Route key="holding-dashboard" path="/vertical/holding" element={<HoldingDashboard />} />,
];
