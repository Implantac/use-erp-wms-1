import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { PaymentEventsPanel } from "@/components/commerce/PaymentEventsPanel";
import { PageContainer } from "@/shared/components/PageContainer";
import { PageHeader } from "@/shared/components/PageHeader";
import { Card, CardContent } from "@/ui/base/card";
import { Button } from "@/ui/base/button";
import { Badge } from "@/ui/base/badge";
import { Skeleton } from "@/ui/base/skeleton";
import { EmptyState } from "@/shared/components/EmptyState";
import { AccessGuard } from "@/components/auth/AccessGuard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui/base/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/base/select";
import { formatBRL } from "@/lib/formatters";
import { useStorefront } from "@/hooks/useCommerce";
import {
  useStorefrontOrders,
  useUpdateOrderStatus,
} from "@/hooks/useCommerceCheckout";

const PAYMENT_LABEL: Record<string, string> = {
  pending: "Pendente",
  processing: "Processando",
  paid: "Pago",
  failed: "Falhou",
  refunded: "Estornado",
  expired: "Expirado",
};

const PAYMENT_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "outline",
  processing: "secondary",
  paid: "default",
  failed: "destructive",
  refunded: "secondary",
  expired: "outline",
};

const ORDER_STATUS: Array<{ value: string; label: string }> = [
  { value: "created", label: "Criado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "preparing", label: "Em preparação" },
  { value: "shipped", label: "Enviado" },
  { value: "delivered", label: "Entregue" },
  { value: "cancelled", label: "Cancelado" },
];

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  credit_card: "Cartão",
  pix: "PIX",
  boleto: "Boleto",
};

export default function StorefrontOrders() {
  const { storefrontId = "" } = useParams<{ storefrontId: string }>();
  const navigate = useNavigate();
  const { data: storefront, isLoading: loadingStore } = useStorefront(storefrontId);
  const { data: orders = [], isLoading } = useStorefrontOrders(storefrontId);
  const updateStatus = useUpdateOrderStatus();

  return (
    <AccessGuard roles={["admin", "manager"]}>
      <PageContainer>
        <PageHeader
          title="Pedidos da loja"
          description={storefront ? `${storefront.name} · ${orders.length} pedido(s)` : "Carregando..."}
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/commerce/lojas/${storefrontId}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          }
        />

        {isLoading || loadingStore ? (
          <Skeleton className="h-64 w-full" />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Nenhum pedido ainda"
            description="Assim que sua loja receber pedidos pelo checkout, eles aparecerão aqui."
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Status pgto.</TableHead>
                    <TableHead>Status pedido</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o: Record<string, unknown>) => {
                    const order = o as {
                      id: string;
                      order_number: string;
                      customer_name: string;
                      customer_email: string;
                      payment_method: string;
                      payment_status: string;
                      order_status: string;
                      total: number;
                      created_at: string;
                      items?: unknown[];
                    };
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-xs">
                          {order.order_number}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">
                            {order.customer_name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {order.customer_email}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {PAYMENT_METHOD_LABEL[order.payment_method] ??
                              order.payment_method}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              PAYMENT_VARIANT[order.payment_status] ?? "outline"
                            }
                          >
                            {PAYMENT_LABEL[order.payment_status] ??
                              order.payment_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={order.order_status}
                            onValueChange={(v) =>
                              updateStatus.mutate({
                                id: order.id,
                                order_status: v as never,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-36 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ORDER_STATUS.map((s) => (
                                <SelectItem
                                  key={s.value}
                                  value={s.value}
                                  disabled={order.payment_status !== "paid" && ["confirmed", "preparing", "shipped", "delivered"].includes(s.value)}
                                >
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatBRL(Number(order.total))}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(order.created_at).toLocaleString("pt-BR")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <PaymentEventsPanel
          storefrontId={storefrontId}
          orders={(orders as Array<{ id: string; order_number: string }>).map((o) => ({
            id: o.id,
            order_number: o.order_number,
          }))}
        />
      </PageContainer>
    </AccessGuard>
  );
}
