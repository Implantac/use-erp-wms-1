import { Link, useNavigate, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { ArrowLeft, Star, ShoppingCart, Truck, ShieldCheck, Store as StoreIcon } from "lucide-react";
import {
  usePublicStorefrontBySlug,
  useStorefrontSearchItems,
} from "@/hooks/useStorefrontSearch";
import { StorefrontHeader } from "@/components/commerce/StorefrontHeader";
import { ProductCard } from "./StorefrontHome";
import { Button } from "@/ui/base/button";
import { Badge } from "@/ui/base/badge";
import { Skeleton } from "@/ui/base/skeleton";
import { Card, CardContent } from "@/ui/base/card";
import { Separator } from "@/ui/base/separator";
import { EmptyState } from "@/shared/components/EmptyState";
import { formatBRL } from "@/lib/formatters";
import { useStorefrontCart } from "@/hooks/useStorefrontCart";
import { toast } from "@/ui/base/use-toast";

export default function StorefrontProduct() {
  const { slug, productId } = useParams<{ slug: string; productId: string }>();
  const navigate = useNavigate();
  const { data: storefront, isLoading } = usePublicStorefrontBySlug(slug);
  const { data: items = [], isLoading: itemsLoading } = useStorefrontSearchItems(
    storefront?.id,
  );
  const { addItem } = useStorefrontCart(slug);
  const [qty, setQty] = useState(1);
  const [activeImg, setActiveImg] = useState(0);

  const item = useMemo(() => items.find((i) => i.id === productId), [items, productId]);
  const related = useMemo(
    () =>
      items
        .filter(
          (i) =>
            i.id !== productId &&
            i.product.category_id === item?.product.category_id,
        )
        .slice(0, 4),
    [items, productId, item],
  );

  if (isLoading || itemsLoading) {
    return (
      <div className="p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid md:grid-cols-2 gap-8">
          <Skeleton className="aspect-square" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!storefront || !item) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <EmptyState
          icon={StoreIcon}
          title="Produto não encontrado"
          description="Este produto pode ter sido removido ou não está mais disponível."
        />
      </div>
    );
  }

  const price = item.public_price ?? item.product.sale_price ?? 0;
  const compare = item.compare_at_price ?? null;
  const hasDiscount = compare && compare > price;
  const discountPct = hasDiscount
    ? Math.round(((compare! - price) / compare!) * 100)
    : 0;

  const gallery = item.gallery_urls?.length
    ? item.gallery_urls
    : item.product.image_url
      ? [item.product.image_url]
      : [];

  function handleAdd(goToCart: boolean) {
    addItem({
      product_id: item!.product.id,
      storefront_product_id: item!.id,
      product_name: item!.product.name,
      unit_price: price,
      image_url: item!.product.image_url,
      quantity: qty,
    });
    toast({ title: "Adicionado ao carrinho", description: item!.product.name });
    if (goToCart) navigate(`/loja/${slug}/checkout`);
  }

  return (
    <div className="min-h-screen bg-background">
      <StorefrontHeader storefront={storefront} />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-4 gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Gallery */}
          <div className="space-y-3">
            <div className="aspect-square rounded-lg overflow-hidden bg-muted border">
              {gallery[activeImg] ? (
                <img
                  src={gallery[activeImg]}
                  alt={item.product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                  Sem imagem
                </div>
              )}
            </div>
            {gallery.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {gallery.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    className={`aspect-square rounded overflow-hidden border-2 transition-all ${
                      activeImg === i ? "border-primary" : "border-transparent"
                    }`}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="space-y-4">
            {item.product.brand && (
              <Badge variant="outline">{item.product.brand}</Badge>
            )}
            <h1 className="text-2xl md:text-3xl font-bold">{item.product.name}</h1>

            {item.rating != null && item.rating > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="font-medium">{item.rating.toFixed(1)}</span>
                <span className="text-muted-foreground">
                  · {item.rating_count} avaliações
                </span>
              </div>
            )}

            <div className="space-y-1">
              {hasDiscount && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground line-through">
                    {formatBRL(compare!)}
                  </span>
                  <Badge className="bg-green-600 hover:bg-green-600">
                    -{discountPct}%
                  </Badge>
                </div>
              )}
              <div
                className="text-3xl font-bold"
                style={{ color: storefront.primary_color }}
              >
                {formatBRL(price)}
              </div>
              <p className="text-xs text-muted-foreground">
                Formas de pagamento indisponíveis até a ativação do checkout
              </p>
            </div>

            <Separator />

            {item.product.description && (
              <div>
                <h3 className="font-semibold mb-1">Descrição</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {item.product.description}
                </p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex items-center border rounded-md">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                >
                  −
                </Button>
                <span className="w-10 text-center font-medium">{qty}</span>
                <Button variant="ghost" size="sm" onClick={() => setQty((q) => q + 1)}>
                  +
                </Button>
              </div>
              <Button
                size="lg"
                variant="outline"
                className="flex-1"
                onClick={() => handleAdd(false)}
              >
                <ShoppingCart className="h-4 w-4 mr-2" /> Adicionar
              </Button>
              <Button
                size="lg"
                className="flex-1"
                onClick={() => handleAdd(true)}
                style={{ backgroundColor: storefront.primary_color, color: "white" }}
              >
                Comprar agora
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <Card>
                <CardContent className="p-3 flex items-center gap-2 text-xs">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <span>Entrega para todo o Brasil</span>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 flex items-center gap-2 text-xs">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <span>Checkout temporariamente indisponível</span>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-semibold mb-4">Você também pode gostar</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {related.map((r) => (
                <ProductCard
                  key={r.id}
                  item={r}
                  slug={slug!}
                  onAdd={() =>
                    addItem({
                      product_id: r.product.id,
                      storefront_product_id: r.id,
                      product_name: r.product.name,
                      unit_price: r.public_price ?? r.product.sale_price ?? 0,
                      image_url: r.product.image_url,
                    })
                  }
                  accent={storefront.primary_color}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
