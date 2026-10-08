import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Store as StoreIcon } from 'lucide-react';
import { Button } from '@/ui/base/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/base/card';
import { Skeleton } from '@/ui/base/skeleton';
import { EmptyState } from '@/shared/components/EmptyState';
import { formatBRL } from '@/lib/formatters';
import { useStorefrontBySlug } from '@/hooks/useCommerceCheckout';
import { useStorefrontCart } from '@/hooks/useStorefrontCart';

export default function StorefrontCheckout() {
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const cart = useStorefrontCart(slug);
  const { data: storefront, isLoading, error } = useStorefrontBySlug(slug);

  if (isLoading) return <div className="mx-auto max-w-3xl p-6"><Skeleton className="h-64 w-full" /></div>;
  if (error || !storefront) return (
    <div className="mx-auto max-w-3xl p-6">
      <EmptyState icon={StoreIcon} title="Loja indisponível" description="Esta loja não existe ou ainda não está publicada." />
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <Button variant="ghost" onClick={() => navigate(`/loja/${slug}`)}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar à loja</Button>
      <h1 className="text-2xl font-semibold">{storefront.name} — checkout indisponível</h1>
      <div role="alert" className="flex gap-3 rounded-md border border-warning p-4 text-sm">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        A finalização de pedidos está suspensa até a homologação de um provedor de pagamentos. Não solicitamos dados de cartão, não geramos PIX ou boleto e nenhum pedido será criado por esta página.
      </div>
      <Card>
        <CardHeader><CardTitle>Itens do carrinho</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {cart.lines.length === 0 ? <p className="text-muted-foreground">Seu carrinho está vazio.</p> : cart.lines.map(line => (
            <div key={line.product_id} className="flex justify-between gap-4 border-b pb-2 text-sm">
              <span>{line.quantity} × {line.product_name}</span>
              <span>{formatBRL(line.quantity * line.unit_price)}</span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Valores dos itens são informativos. Frete e pagamento não foram calculados.</p>
        </CardContent>
      </Card>
    </div>
  );
}
