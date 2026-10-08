import { PageContainer } from '@/shared/components/PageContainer';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { useEstoqueMatrix } from '@/hooks/inventory/useEstoqueMatrix';
import { useEnterpriseStore } from '@/core/stores/useEnterpriseStore';

export default function StoreHealthMap() {
  const companyId = useEnterpriseStore(s => s.activeCompanyId);
  const { data: matrix = [], isLoading, error } = useEstoqueMatrix('', true);
  const stores = new Map<string, { name: string; items: number; zeroQuantity: number }>();
  for (const item of matrix) {
    if (!item.branch_id) continue;
    const store = stores.get(item.branch_id) ?? { name: item.branch_name ?? 'Unidade sem nome', items: 0, zeroQuantity: 0 };
    store.items += 1;
    if (item.quantity <= 0) store.zeroQuantity += 1;
    stores.set(item.branch_id, store);
  }

  return (
    <PageContainer loading={isLoading}>
      <PageHeader title="Saldos por unidade" description="Visão parcial dos registros de estoque da empresa selecionada" />
      {!companyId ? <p role="alert">Selecione uma empresa para consultar os saldos.</p> : error ? (
        <p role="alert" className="text-destructive">Falha na consulta dos saldos. Nenhum indicador pode ser confirmado.</p>
      ) : (
        <Card><CardHeader><CardTitle>Registros consultados por unidade</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">Consulta limitada a 2.000 registros. Quantidade zero ou negativa não comprova ruptura comercial. Acuracidade, giro, cobertura e ranking de saúde não são medidos aqui.</p>
            {[...stores.entries()].map(([id, store]) => (
              <div key={id} className="flex justify-between rounded border p-3">
                <span>{store.name}</span>
                <span>{store.items} saldos consultados · {store.zeroQuantity} com quantidade ≤ 0</span>
              </div>
            ))}
            {!stores.size && <p>Nenhum saldo com unidade identificado nesta consulta.</p>}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
