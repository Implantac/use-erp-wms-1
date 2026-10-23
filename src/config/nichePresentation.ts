import { normalizeSegment, type Segment } from './adaptive';
import { canViewVertical } from './verticalAccess';
import { INDUSTRIAL_PROCESS_FAMILIES, type IndustrialProcessFamily } from './industrialProfile';

// Presentation only. Neither this allowlist nor company.settings grants database access.
const manufacturingSegments = new Set<Segment>([
  'textile', 'fio', 'tecelagem', 'dyeing', 'laundry', 'apparel',
  'animal_feed', 'food_factory', 'chemicals', 'pharma', 'industry',
]);

// Only existing presentation pages; families without a dedicated page stay on the shared core.
const familyVerticalRoutes: Partial<Record<IndustrialProcessFamily, readonly string[]>> = {
  spinning: ['/vertical/textile', '/vertical/spinning'],
  weaving: ['/vertical/textile', '/vertical/weaving'],
  knitting: ['/vertical/textile', '/vertical/knitting'],
  dyeing: ['/vertical/textile', '/vertical/dyeing'],
  finishing: ['/vertical/textile'],
  apparel: ['/vertical/apparel'],
  animal_feed: ['/vertical/food-feed'],
  food: ['/vertical/food-feed'],
};

export function isNicheSensitivePath(pathname: string): boolean {
  return pathname === '/producao' || pathname.startsWith('/producao/')
    || pathname === '/vertical' || pathname.startsWith('/vertical/');
}

export function canPresentNicheRoute(segment: string | null | undefined, pathname: string, families: readonly IndustrialProcessFamily[] = []): boolean {
  if (!isNicheSensitivePath(pathname)) return true; // other guards still apply
  const normalized = normalizeSegment(segment);
  if (!normalized) return false;
  if (pathname === '/producao' || pathname.startsWith('/producao/')) return manufacturingSegments.has(normalized);
  if (pathname === '/vertical') return false;
  if (canViewVertical(normalized, pathname)) return true;
  if (!manufacturingSegments.has(normalized)) return false;
  return families.some(family => Object.prototype.hasOwnProperty.call(INDUSTRIAL_PROCESS_FAMILIES, family)
    && familyVerticalRoutes[family]?.some(route => pathname === route || pathname.startsWith(`${route}/`)));
}
