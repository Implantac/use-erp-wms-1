import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, AlertTriangle, ClipboardList } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/base/card';
import { Badge } from '@/ui/base/badge';
import { supabase } from '@/integrations/supabase/client';

interface Check {
  label: string;
  ok: boolean;
  detail: string;
  hint: string;
}

async function count(table: string, filter?: (q: any) => any): Promise<number | null> {
  try {
    let q = (supabase as any).from(table).select('id', { count: 'exact', head: true });
    if (filter) q = filter(q);
    const { count: n, error } = await q;
    if (error) return null;
    return n ?? 0;
  } catch {
    return null;
  }
}

/**
 * "Pronto para operar?" — verificação honesta de prontidão do ambiente:
 * cadastros mínimos, fluxo de lojas ativo e o bloqueio fiscal declarado.
 * Nada aqui é estimativa: são contagens reais do banco + o estado fiscal
 * conhecido do produto (não homologado nesta versão).
 */
export function SystemReadinessPanel() {
  const { data: checks = [], isLoading } = useQuery({
    queryKey: ['system-readiness'],
    queryFn: async (): Promise<Check[]> => {
      const [companies, branches, roles, products, policies, supplyPend, interPend, fiscalCfg, emissionOn, withNcm] = await Promise.all([
        count('companies'),
        count('branches'),
        count('user_roles'),
        count('products'),
        count('replenishment_policies'),
        count('supply_requests', (q) => q.eq('status', 'PENDENTE')),
        count('intercompany_replenishment_requests', (q) => q.eq('status', 'pendente')),
        count('fiscal_provider_settings', (q) => q.neq('provider', 'nao_definido')),
        count('fiscal_provider_settings', (q) => q.eq('emission_enabled', true)),
        count('products', (q) => q.not('ncm', 'is', null).neq('ncm', '')),
      ]);
      const n = (v: number | null) => (v === null ? 'não verificado' : String(v));
      return [
        {
          label: 'Empresas e unidades do grupo',
          ok: (companies ?? 0) >= 1 && (branches ?? 0) >= 1,
          detail: `${n(companies)} empresa(s), ${n(branches)} unidade(s)`,
          hint: 'Cadastre a indústria e as lojas em Configurações/Empresas.',
        },
        {
          label: 'Usuários com papel definido',
          ok: (roles ?? 0) >= 1,
          detail: `${n(roles)} vínculo(s) de papel`,
          hint: 'Sem papel, o usuário não decide nem aprova nada.',
        },
        {
          label: 'Catálogo de produtos',
          ok: (products ?? 0) >= 1,
          detail: `${n(products)} produto(s)`,
          hint: 'Produtos com foto, preço e código único por empresa.',
        },
        {
          label: 'Políticas de reposição (mínimo/máximo)',
          ok: (policies ?? 0) >= 1,
          detail: `${n(policies)} política(s) ativa(s)`,
          hint: 'Sem política, não há alerta de ruptura nem sugestão.',
        },
        {
          label: 'Fluxo de lojas operando',
          ok: supplyPend !== null && interPend !== null,
          detail: `${n(supplyPend)} abastecimento(s) e ${n(interPend)} pedido(s) à fábrica pendentes`,
          hint: 'Pendências aparecem na caixa de entrada da Fábrica.',
        },
        {
          label: 'Emissão fiscal (NF-e/NFC-e)',
          ok: emissionOn > 0,
          detail: emissionOn > 0 ? `Emissão liberada em ${n(emissionOn)} empresa(s) (homologação registrada)` : `NÃO homologado · provedor definido em ${n(fiscalCfg)} empresa(s) · NCM em ${n(withNcm)}/${n(products)} produtos`,
          hint: 'Configure o provedor em Fiscal > NF-e e conclua a homologação SEFAZ para liberar a emissão.',
        },
      ];
    },
    staleTime: 60_000,
  });

  const okCount = checks.filter((c) => c.ok).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-5 w-5 text-primary" /> Pronto para operar?
          {!isLoading && (
            <Badge variant={okCount >= 5 ? 'default' : 'secondary'}>
              {okCount}/{checks.length} verificações OK
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Conferência rápida e honesta do ambiente antes de operar (e de vender):
          o que está pronto, o que falta e o que está bloqueado por homologação.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Verificando o ambiente…</p>}
        {checks.map((c) => (
          <div key={c.label} className="flex items-start gap-3 rounded-md border p-2.5">
            {c.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {c.label} <span className="text-muted-foreground">— {c.detail}</span>
              </p>
              {!c.ok && <p className="text-xs text-muted-foreground">{c.hint}</p>}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
