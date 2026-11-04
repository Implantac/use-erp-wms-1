import { sectorKindFromSectorText, type SectorKind } from './sectorProfiles';

export interface EligibilityProduct {
  id: string;
  production_route_id?: string | null;
}

export interface EligibilityRoute {
  id: string;
  product_id?: string | null;
}

export interface EligibilityRouteStep {
  route_id: string;
  step_name: string;
}

export interface EligibilityStep {
  name: string;
  sector?: string | null;
}

export interface EligibilityInput {
  products: readonly EligibilityProduct[];
  bomProductIds: ReadonlySet<string>;
  /** Rotas ativas, da mais recente para a mais antiga (fallback da RPC). */
  routes: readonly EligibilityRoute[];
  /** Etapas dos roteiros em ordem de sequência. */
  routeSteps: readonly EligibilityRouteStep[];
  /** Operações ativas do catálogo. */
  steps: readonly EligibilityStep[];
}

/**
 * Produtos que podem virar OP de um setor — a mesma conta que a RPC
 * `create_textile_production_order` faz ao criar: produto com BOM e
 * roteiro ativo (o vinculado ao produto, senão o mais recente) cuja
 * primeira operação pertence ao setor. Nome de operação duplicado no
 * catálogo torna o produto inelegível (a RPC exige exatamente uma
 * operação ativa por nome). Usada pelos diálogos de nova OP para a
 * lista nunca oferecer o que o banco vai recusar.
 */
export function computeEligibleProductIds(input: EligibilityInput, kind: SectorKind): Set<string> {
  const sectorByStepName = new Map<string, string | null>();
  const stepNameCounts = new Map<string, number>();
  for (const step of input.steps) {
    stepNameCounts.set(step.name, (stepNameCounts.get(step.name) ?? 0) + 1);
    if (!sectorByStepName.has(step.name)) sectorByStepName.set(step.name, step.sector ?? null);
  }

  const firstStepByRoute = new Map<string, string>();
  for (const routeStep of input.routeSteps) {
    if (!firstStepByRoute.has(routeStep.route_id)) firstStepByRoute.set(routeStep.route_id, routeStep.step_name);
  }

  const routeKind = new Map<string, SectorKind | null>();
  const routesByProduct = new Map<string, Array<{ id: string }>>();
  for (const route of input.routes) {
    const firstStep = firstStepByRoute.get(route.id);
    const sector = firstStep && stepNameCounts.get(firstStep) === 1 ? sectorByStepName.get(firstStep) : null;
    routeKind.set(route.id, sectorKindFromSectorText(sector));
    if (route.product_id) {
      const list = routesByProduct.get(route.product_id) ?? [];
      list.push({ id: route.id });
      routesByProduct.set(route.product_id, list);
    }
  }

  const eligible = new Set<string>();
  for (const product of input.products) {
    if (!input.bomProductIds.has(product.id)) continue;
    const preferred = product.production_route_id && routeKind.has(product.production_route_id)
      ? product.production_route_id
      : routesByProduct.get(product.id)?.[0]?.id;
    if (preferred && routeKind.get(preferred) === kind) eligible.add(product.id);
  }
  return eligible;
}
