import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { Card, CardContent } from '@/ui/base/card';
import { Button } from '@/ui/base/button';
import { useSupplyAccess } from '@/hooks/operational/store/useSupplyAccess';

/**
 * Ponte para a tela ÚNICA de abastecimento do gestor: a caixa de entrada,
 * a análise de saldos e a execução moram em /operacional/abastecimento.
 * Este cartão só aparece para o gestor da indústria (a Loja não vê gestão).
 */
export function SupplyInboxLinkCard() {
  const supplyAccess = useSupplyAccess();
  if (supplyAccess.isLoading || !supplyAccess.canManage) return null;
  return (
    <Card className="border-primary/30">
      <CardContent className="flex flex-wrap items-center gap-3 py-4">
        <Inbox className="h-5 w-5 text-primary" />
        <p className="min-w-0 flex-1 text-sm">
          <strong>Solicitações das lojas</strong> — a análise de origens (Fábrica × CD × outra Loja),
          a decisão e a execução das transferências ficam numa tela só: a Central de Abastecimento.
        </p>
        <Button asChild size="sm"><Link to="/operacional/abastecimento">Abrir Central de Abastecimento</Link></Button>
      </CardContent>
    </Card>
  );
}
