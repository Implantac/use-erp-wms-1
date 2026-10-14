import type { Segment } from './adaptive';

// Presentation policy for the existing vertical dashboards, not a backend grant.
// Unknown/unconfigured niches see none; hybrid capabilities need a separately
// authorized per-company configuration before they can be enabled.
const verticalRoutes: Record<Segment, readonly string[]> = {
  textile: ['/vertical/textile', '/vertical/spinning', '/vertical/weaving'],
  apparel: ['/vertical/apparel'],
  fio: ['/vertical/spinning'],
  tecelagem: ['/vertical/weaving'],
  food_factory: ['/vertical/food-feed'],
  animal_feed: ['/vertical/food-feed'],
  pharma: ['/vertical/pharma'],
  dyeing: [],
  laundry: [],
  chemicals: [],
  industry: [],
  distribution: ['/vertical/distribution'],
  wholesaler: ['/vertical/distribution', '/vertical/wholesaler'],
  retail: ['/vertical/retail'],
  retail_chain: ['/vertical/retail'],
  franchise: ['/vertical/franchise'],
  holding: ['/vertical/holding'],
  services: [],
  general: [],
};

export function canViewVertical(segment: string | null | undefined, pathname: string): boolean {
  if (!segment || !Object.prototype.hasOwnProperty.call(verticalRoutes, segment)) return false;
  return verticalRoutes[segment as Segment].some(route => pathname === route || pathname.startsWith(`${route}/`));
}
