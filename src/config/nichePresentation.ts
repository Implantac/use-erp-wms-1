import { normalizeSegment, type Segment } from './adaptive';
import { canViewVertical } from './verticalAccess';

// Presentation only. Neither this allowlist nor company.settings grants database access.
const manufacturingSegments = new Set<Segment>([
  'textile', 'fio', 'tecelagem', 'dyeing', 'laundry', 'apparel',
  'animal_feed', 'food_factory', 'chemicals', 'pharma', 'industry',
]);

export function isNicheSensitivePath(pathname: string): boolean {
  return pathname === '/producao' || pathname.startsWith('/producao/')
    || pathname === '/vertical' || pathname.startsWith('/vertical/');
}

export function canPresentNicheRoute(segment: string | null | undefined, pathname: string): boolean {
  if (!isNicheSensitivePath(pathname)) return true; // other guards still apply
  const normalized = normalizeSegment(segment);
  if (!normalized) return false;
  if (pathname === '/producao' || pathname.startsWith('/producao/')) return manufacturingSegments.has(normalized);
  if (pathname === '/vertical') return false;
  return canViewVertical(normalized, pathname);
}
