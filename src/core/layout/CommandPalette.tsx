import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isHiddenHref } from '@/config/adaptive';
import { useNavigate } from 'react-router-dom';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/ui/base/command';
import { getNavigationForContext } from '@/config/navigation';
import { useEnterprise } from '@/core/auth/EnterpriseContext';
import { evaluateContextAccess, getRouteContextCriteria } from '@/core/auth/contextAccess';
import {
  LayoutDashboard, Users, Wallet, FileCheck, Package, ShoppingCart,
  Factory, Warehouse, Settings, UserCircle, ShoppingBag, ClipboardList,
  FileText, ArrowUpCircle, ArrowDownCircle, TrendingUp, CheckCircle,
  Receipt, BarChart3, Box, FolderTree, ArrowLeftRight, Calculator,
  Building2, FileSearch, ClipboardCheck, PackageMinus, Timer, PackagePlus,
  MapPin, PackageSearch, PackageCheck, MoveHorizontal, Building, Sliders,
  Plug, BookOpen, Scale, Radio, Wifi, Tag, Activity,
} from 'lucide-react';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, Users, Wallet, FileCheck, Package, ShoppingCart,
  Factory, Warehouse, Settings, UserCircle, ShoppingBag, ClipboardList,
  FileText, ArrowUpCircle, ArrowDownCircle, TrendingUp, CheckCircle,
  Receipt, BarChart3, Box, FolderTree, ArrowLeftRight, Calculator,
  Building2, FileSearch, ClipboardCheck, PackageMinus, Timer, PackagePlus,
  MapPin, PackageSearch, PackageCheck, MoveHorizontal, Building, Sliders,
  Plug, BookOpen, Scale, Radio, Wifi, Tag, Activity,
};

/** Ações orientadas à tarefa — o usuário novo não sabe o nome do módulo. */
const taskActions = [
  { title: 'Receber mercadoria', href: '/operacional/rede/receber', icon: 'PackageCheck', keywords: 'receber recebimento chegou carga entrada conferir mercadoria' },
  { title: 'Transferir mercadoria', href: '/operacional/rede/transferencias', icon: 'ArrowLeftRight', keywords: 'transferir transferencia enviar mandar remessa loja cd fabrica' },
  { title: 'Pedir reposição', href: '/operacional/rede/ressuprimento', icon: 'Package', keywords: 'reposicao repor ressuprimento abastecer pedir falta ruptura' },
  { title: 'Consultar estoque', href: '/estoque/saldos', icon: 'Calculator', keywords: 'estoque saldo quanto tenho disponivel reservado transito' },
  { title: 'Ver pendências', href: '/pendencias', icon: 'Activity', keywords: 'pendencia atencao problema resolver alerta' },
  { title: 'Ver lojas', href: '/operacional/loja/central', icon: 'Building', keywords: 'loja lojas unidade filial minha loja' },
  { title: 'Novo pedido de compra', href: '/compras/pedidos', icon: 'ShoppingCart', keywords: 'comprar compra fornecedor pedido' },
  { title: 'Vender no PDV', href: '/comercial/pdv', icon: 'ShoppingBag', keywords: 'venda vender pdv caixa frente de loja' },
];

interface FlatItem {
  title: string;
  href: string;
  icon: string;
  group: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { activeUnitType, activeChannel, scope, role, permissions, segment, currentCompany } = useEnterprise();
  const context = useMemo(() => ({ unitType: activeUnitType, channel: activeChannel, scope, role, permissions }),
    [activeUnitType, activeChannel, scope, role, permissions]);
  const visibleTasks = useMemo(() => taskActions.filter((action) => {
    const criteria = getRouteContextCriteria(action.href);
    return !criteria || evaluateContextAccess(criteria, context).allowed;
  }), [context]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const isK = e.key === 'k' || e.key === 'K' || e.code === 'KeyK';
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      }
    };
    // Capture phase + window ensures we catch the event before any focused
    // element (inputs, editors) can swallow it, and works reliably in headless.
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, []);

  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];
    getNavigationForContext(context).forEach((section) => {
      section.items.forEach((item) => {
        if (isHiddenHref(segment, item.href)) return;
        if (!item.children || item.children.length === 0) {
          items.push({ title: item.title, href: item.href, icon: item.icon, group: section.label || 'Navegação' });
        } else {
          item.children.forEach((child) => {
            if (isHiddenHref(segment, child.href)) return;
            items.push({ title: child.title, href: child.href, icon: child.icon, group: item.title });
          });
        }
      });
    });
    return items;
  }, [context, segment]);

  const groups = useMemo(() => {
    const map = new Map<string, FlatItem[]>();
    flatItems.forEach((item) => {
      const list = map.get(item.group) || [];
      list.push(item);
      map.set(item.group, list);
    });
    return Array.from(map.entries());
  }, [flatItems]);

  const [query, setQuery] = useState('');
  const [dataResults, setDataResults] = useState<
    { title: string; sub: string; href: string; kind: string }[]
  >([]);

  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2 || !currentCompany?.id) {
      setDataResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const companyId = currentCompany.id;
      const like = `%${q}%`;
      const [products, prodOrders, purchOrders] = await Promise.all([
        (supabase as any)
          .from('products')
          .select('id, name, code')
          .eq('company_id', companyId)
          .or(`name.ilike.${like},code.ilike.${like}`)
          .limit(5),
        (supabase as any)
          .from('production_orders')
          .select('id, order_number, current_status_view:status, products:product_id(name)')
          .eq('company_id', companyId)
          .ilike('order_number', like)
          .limit(5),
        (supabase as any)
          .from('purchase_orders')
          .select('id, number, supplier_name, status')
          .eq('company_id', companyId)
          .ilike('number', like)
          .limit(5),
      ]);
      if (cancelled) return;
      setDataResults([
        ...((products.data || []).map((r: any) => ({
          title: r.name,
          sub: `Produto · ${r.code || 'sem código'}`,
          href: '/estoque/produtos',
          kind: 'produto',
        }))),
        ...((prodOrders.data || []).map((r: any) => ({
          title: `OP ${r.order_number}`,
          sub: `Produção · ${r.products?.name || ''} · ${r.current_status_view || ''}`,
          href: '/producao/ordens',
          kind: 'op',
        }))),
        ...((purchOrders.data || []).map((r: any) => ({
          title: `Pedido ${r.number}`,
          sub: `Compras · ${r.supplier_name || ''} · ${r.status || ''}`,
          href: '/compras/pedidos',
          kind: 'compra',
        }))),
      ]);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, currentCompany?.id]);

  const handleSelect = (href: string) => {
    setOpen(false);
    setQuery('');
    navigate(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="O que você quer fazer? (busque também produtos, OPs e pedidos)" onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        <CommandGroup heading="O que você quer fazer?">
          {visibleTasks.map((action) => {
            const Icon = iconMap[action.icon] || Activity;
            return (
              <CommandItem
                key={action.href + action.title}
                value={`${action.title} ${action.keywords}`}
                onSelect={() => handleSelect(action.href)}
                className="gap-2"
              >
                <Icon className="h-4 w-4 text-primary" />
                <span>{action.title}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        {dataResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Dados">
              {dataResults.map((r, i) => (
                <CommandItem
                  key={`${r.kind}-${r.title}-${i}`}
                  value={`dado ${r.kind} ${r.title} ${r.sub}`}
                  onSelect={() => handleSelect(r.href)}
                  className="gap-2"
                >
                  <PackageSearch className="h-4 w-4 text-primary" />
                  <span>{r.title}</span>
                  <span className="text-xs text-muted-foreground">{r.sub}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        {groups.map(([group, items], idx) => (
          <div key={group}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={group}>
              {items.map((item) => {
                const Icon = iconMap[item.icon];
                return (
                  <CommandItem
                    key={item.href}
                    value={`${item.group} ${item.title}`}
                    onSelect={() => handleSelect(item.href)}
                    className="gap-2"
                  >
                    {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                    <span>{item.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </div>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
