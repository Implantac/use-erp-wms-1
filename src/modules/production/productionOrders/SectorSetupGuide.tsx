import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, CheckCircle2, Circle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTenant } from '@/hooks/shared/useActiveTenant';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { sectorKindFromSectorText, type SectorKind } from '@/lib/pcp/sectorProfiles';
import { machineMatchesSector } from '@/lib/pcp/productFilters';
import { diagnoseSectorReadiness, type SectorReadiness } from '@/lib/pcp/sectorReadiness';

const APPROVED_QUALITY = new Set(['approved', 'released', 'aprovado', 'aprovada', 'liberado', 'liberada']);

interface Props {
  kind: SectorKind;
  noun: string;
}

/**
 * Guia de prontidão do setor na empresa ativa. O motor de execução é
 * transacional e recusa o que falta (BOM, roteiro, operação, máquina,
 * lote) — este guia lê os mesmos cadastros e mostra o elo faltante com o
 * caminho do cadastro, em vez de deixar o usuário descobrir pelo erro.
 * Some sozinho quando o setor está pronto. Se a empresa ativa não tem
 * NENHUM produto (holding/Loja), o problema é a empresa: oferece a troca.
 */
export function SectorSetupGuide({ kind, noun }: Props) {
  const { company, setCompany } = useActiveTenant();
  const enterprise = useEnterprise();
  const [readiness, setReadiness] = useState<SectorReadiness | null>(null);

  useEffect(() => {
    if (!company?.id) return;
    let cancelled = false;
    void (async () => {
      const [productResult, bomResult, routeResult, routeStepResult, stepResult, machineResult, lotResult, balanceResult] = await Promise.all([
        supabase.from('products').select('id, production_route_id').eq('company_id', company.id).eq('status', 'active'),
        supabase.from('production_bom').select('product_id').eq('company_id', company.id),
        supabase.from('production_routes').select('id, product_id').eq('company_id', company.id).eq('is_active', true).order('created_at', { ascending: false }),
        supabase.from('production_route_steps').select('route_id, step_name, sequence').eq('company_id', company.id).order('sequence'),
        supabase.from('production_steps').select('name, sector').eq('company_id', company.id).eq('is_active', true),
        supabase.from('production_machines').select('sector, active').eq('company_id', company.id),
        supabase.from('stock_lots').select('id, status, quality_status').eq('company_id', company.id),
        supabase.from('stock_balances').select('lot_id, quantity, reserved_qty').eq('company_id', company.id),
      ]);
      if (cancelled) return;
      const failed = [productResult, bomResult, routeResult, routeStepResult, stepResult, machineResult, lotResult, balanceResult]
        .some((result) => result.error);
      if (failed) return; // sem fonte confiável, o guia se cala (a central já mostra erros de carga)

      const sectorByStepName = new Map<string, string | null>();
      const stepNameCounts = new Map<string, number>();
      let sectorOperations = 0;
      for (const step of stepResult.data ?? []) {
        stepNameCounts.set(step.name, (stepNameCounts.get(step.name) ?? 0) + 1);
        if (!sectorByStepName.has(step.name)) sectorByStepName.set(step.name, step.sector);
        if (sectorKindFromSectorText(step.sector) === kind) sectorOperations += 1;
      }
      const firstStepByRoute = new Map<string, string>();
      for (const routeStep of routeStepResult.data ?? []) {
        if (!firstStepByRoute.has(routeStep.route_id)) firstStepByRoute.set(routeStep.route_id, routeStep.step_name);
      }
      const routeKind = new Map<string, string | null>();
      const routesByProduct = new Map<string, Array<{ id: string }>>();
      for (const route of routeResult.data ?? []) {
        const firstStep = firstStepByRoute.get(route.id);
        const sector = firstStep && stepNameCounts.get(firstStep) === 1 ? sectorByStepName.get(firstStep) : null;
        routeKind.set(route.id, sectorKindFromSectorText(sector));
        if (route.product_id) {
          const list = routesByProduct.get(route.product_id) ?? [];
          list.push({ id: route.id });
          routesByProduct.set(route.product_id, list);
        }
      }
      const bomProductIds = new Set((bomResult.data ?? []).map((line) => line.product_id));
      const eligibleProducts = (productResult.data ?? []).filter((product) => {
        if (!bomProductIds.has(product.id)) return false;
        const preferred = product.production_route_id && routeKind.has(product.production_route_id)
          ? product.production_route_id
          : routesByProduct.get(product.id)?.[0]?.id;
        return preferred ? routeKind.get(preferred) === kind : false;
      }).length;

      const availableByLot = new Map<string, number>();
      for (const balance of balanceResult.data ?? []) {
        if (!balance.lot_id) continue;
        availableByLot.set(balance.lot_id, (availableByLot.get(balance.lot_id) ?? 0) + Math.max(0, Number(balance.quantity ?? 0) - Number(balance.reserved_qty ?? 0)));
      }
      const approvedLotsWithBalance = (lotResult.data ?? []).filter(
        (lot) => lot.status === 'available' && APPROVED_QUALITY.has(String(lot.quality_status ?? '').toLowerCase()) && (availableByLot.get(lot.id) ?? 0) > 0,
      ).length;
      const sectorMachines = (machineResult.data ?? []).filter(
        (machine) => machine.active && machineMatchesSector(machine.sector, kind),
      ).length;

      setReadiness(diagnoseSectorReadiness({
        productsTotal: (productResult.data ?? []).length,
        productsWithBom: bomProductIds.size,
        eligibleProducts,
        sectorOperations,
        sectorMachines,
        approvedLotsWithBalance,
      }, noun));
    })();
    return () => { cancelled = true; };
  }, [company?.id, kind, noun]);

  if (!company || !readiness || readiness.ready) return null;

  const otherCompanies = (enterprise.allowedCompanies ?? []).filter((candidate) => candidate.id !== company.id);

  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5" />
          {readiness.companyTrap
            ? `Nenhum produto cadastrado nesta empresa (${company.name})`
            : `Para o PCP de ${noun} operar nesta empresa, falta:`}
        </CardTitle>
        <CardDescription className="text-amber-800 dark:text-amber-300">
          {readiness.companyTrap
            ? 'O PCP é por empresa: OP, estoque e cadastros de produção moram na empresa da indústria. Se a produção fica em outra empresa do grupo, troque a empresa — nada precisa ser cadastrado aqui.'
            : 'O fluxo é programar → apontar as passagens → qualidade → finalizar gerando estoque. Cada item abaixo é validado pelo banco na hora de executar; resolvendo o que falta, a central anda sozinha.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {readiness.companyTrap && otherCompanies.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {otherCompanies.map((candidate) => (
              <Button key={candidate.id} size="sm" variant="outline" onClick={() => void setCompany(candidate.id)}>
                <Building2 className="mr-1.5 h-4 w-4" /> Abrir a central em {candidate.name}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-2 md:grid-cols-2">
          {readiness.items.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-2 rounded-md border bg-background/60 p-3">
              <div className="flex items-start gap-2">
                {item.ok
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                  : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.hint}</p>
                </div>
              </div>
              {!item.ok && item.href ? (
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link to={item.href}>Cadastrar</Link>
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
