import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router-dom";
import { PageContainer } from "@/shared/components/PageContainer";
import { PageHeader } from "@/shared/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/base/card";
import { Button } from "@/ui/base/button";
import { Badge } from "@/ui/base/badge";
import { Skeleton } from "@/ui/base/skeleton";
import { EmptyState } from "@/shared/components/EmptyState";
import { AccessGuard } from "@/components/auth/AccessGuard";
import {
  Palette,
  Play,
  Pause,
  ExternalLink,
  Package,
  FileText,
  Store as StoreIcon,
  ShoppingCart,
} from "lucide-react";
import {
  useStorefront,
  useCommerceTheme,
  useUpdateStorefrontStatus,
} from "@/hooks/useCommerce";
import { StorefrontNotificationsPanel } from "@/components/commerce/StorefrontNotificationsPanel";
import { storefrontDomain } from "@/config/env";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Rascunho", variant: "outline" },
  published: { label: "Publicada", variant: "default" },
  paused: { label: "Pausada", variant: "secondary" },
};

export default function CommerceStorefrontDetail() {
  const { storefrontId = "" } = useParams<{ storefrontId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: storefront, isLoading } = useStorefront(storefrontId);
  const { data: theme } = useCommerceTheme(storefront?.theme_id ?? null);
  const updateStatus = useUpdateStorefrontStatus();

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </PageContainer>
    );
  }

  if (!storefront) {
    return (
      <PageContainer>
        <EmptyState
          icon={StoreIcon}
          title="Loja não encontrada"
          description="Esta loja pode ter sido removida ou você não tem acesso."
          action={{
            label: "Voltar",
            onClick: () => navigate("/commerce/lojas"),
          }}
        />
      </PageContainer>
    );
  }

  const st = STATUS_LABELS[storefront.status];

  return (
    <AccessGuard roles={["admin", "manager"]}>
      <PageContainer>
        <PageHeader
          title={storefront.name}
          description={`Loja ${storefront.storefront_type.toUpperCase()} · /${storefront.slug}`}

          actions={
            <div className="flex flex-wrap gap-2">
              <Badge variant={st.variant}>{st.label}</Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  navigate(`/commerce/lojas/${storefront.id}/pedidos`)
                }
              >
                <ShoppingCart className="h-4 w-4 mr-1" /> Ver pedidos
              </Button>
              {storefront.status === "published" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open(`/loja/${storefront.slug}/checkout`, "_blank")
                  }
                >
                  <ExternalLink className="h-4 w-4 mr-1" /> Testar checkout
                </Button>
              )}
              {storefront.status === "published" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    updateStatus.mutate({ id: storefront.id, status: "paused" })
                  }
                >
                  <Pause className="h-4 w-4 mr-1" /> Pausar
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() =>
                    updateStatus.mutate({
                      id: storefront.id,
                      status: "published",
                    })
                  }
                >
                  <Play className="h-4 w-4 mr-1" /> Publicar
                </Button>
              )}
            </div>
          }
        />

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Layout atual</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {theme?.name ?? "Nenhum layout aplicado"}
                  {theme?.is_premium && (
                    <Badge variant="default" className="ml-2 text-xs">
                      Premium
                    </Badge>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(`/commerce/lojas/${storefront.id}/tema`)
                }
              >
                <Palette className="h-4 w-4 mr-1" /> Trocar tema
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="aspect-video w-full rounded border"
              style={{
                background: `linear-gradient(135deg, ${storefront.primary_color}, ${storefront.secondary_color})`,
              }}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" /> Produtos publicados
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">0</div>
              <p className="text-xs text-muted-foreground mt-1">
                Sincronize produtos do ERP para exibir na loja.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                disabled
                title="Em desenvolvimento"
              >
                Gerenciar catálogo
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" /> Páginas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">0</div>
              <p className="text-xs text-muted-foreground mt-1">
                Home, coleções e páginas custom pelo editor drag-and-drop.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                disabled
                title="Em desenvolvimento"
              >
                Abrir editor
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ExternalLink className="h-4 w-4" /> URL pública
              </CardTitle>
            </CardHeader>
            <CardContent>
              <code className="text-xs break-all">
                {storefrontDomain(storefront.slug)}
              </code>
              <p className="text-xs text-muted-foreground mt-1">
                {storefront.status === "published"
                  ? "Loja ativa e acessível ao público."
                  : "Loja não publicada."}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" /> NFC-e automática
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Ao ativar, o rascunho da NFC-e gerado no pagamento é enviado automaticamente à SEFAZ.
              </p>
              {(() => {
                const autoNfce = Boolean(storefront.auto_authorize_nfce);
                return (
                  <div className="flex items-center gap-2">
                    <Badge variant={autoNfce ? "default" : "outline"}>
                      {autoNfce ? "Ativada" : "Desativada"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const { supabase } = await import("@/integrations/supabase/client");
                        // QA-UX (rodada 3): antes o erro era ignorado e a pagina
                        // era recarregada de qualquer forma, dando a impressao
                        // de que a alteracao tinha sido aplicada.
                        const { error } = await supabase
                          .from("storefronts")
                          .update({ auto_authorize_nfce: !autoNfce })
                          .eq("id", storefront.id);
                        if (error) {
                          toast.error("Não foi possível alterar a autorização automática. Tente novamente.");
                          return;
                        }
                        await Promise.all([
                          qc.invalidateQueries({ queryKey: ["storefront", storefront.id] }),
                          qc.invalidateQueries({ queryKey: ["storefronts"] }),
                        ]);
                        toast.success(autoNfce ? "Autorização automática desativada" : "Autorização automática ativada");
                      }}
                    >
                      {autoNfce ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
          <div className="lg:col-span-2">
            <StorefrontNotificationsPanel />
          </div>
        </div>
      </PageContainer>
    </AccessGuard>
  );
}

