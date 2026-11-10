/**
 * LEGADO — DESMONTADO em 10/11/2026 (QA-UX), mantido apenas como registro.
 *
 * Este arquivo NÃO é mais importado por src/App.tsx. Não reintroduza o
 * componente na árvore global: ele duplicava a CommandPalette do MainLayout,
 * aparecia na tela de login, era o primeiro foco do TAB e 4 dos seus 9
 * destinos retornavam 404. Para corrigir links antigos, use os aliases em
 * src/routes/index.tsx (legacyAliasMap). Para busca/navegação, use a
 * CommandPalette. Ver docs/AVALIACAO-UX-2026-11-10.md.
 */
import React, { useState, useEffect } from 'react';
import { 
  CommandDialog, 
  CommandEmpty, 
  CommandGroup, 
  CommandInput, 
  CommandItem, 
  CommandList 
} from "@/ui/base/command";
import { 
  Search, 
  ArrowRightLeft, 
  FileText, 
  Truck, 
  ShoppingCart, 
  BarChart3, 
  Settings,
  Shield,
  Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from "@/ui/base/button";

const Brain = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.54Z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.54Z"/>
  </svg>
);

export const WorkflowSwitcher = React.forwardRef<HTMLDivElement, any>((_, ref) => {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const workflows = [
    {
      group: "Processo de Venda (O2C)",
      items: [
        { label: "Novo Pedido de Venda", route: "/comercial/pedidos/novo", icon: <ShoppingCart className="mr-2 h-4 w-4" /> },
        { label: "Faturamento e NF-e", route: "/fiscal/notas", icon: <FileText className="mr-2 h-4 w-4" /> },
        { label: "Gestão de Crédito", route: "/financeiro/contas-receber", icon: <Shield className="mr-2 h-4 w-4" /> },
      ]
    },
    {
      group: "Suprimentos e WMS (P2P)",
      items: [
        { label: "Recebimento de Mercadorias", route: "/wms/recebimento", icon: <Truck className="mr-2 h-4 w-4" /> },
        { label: "Inventário e Ajustes", route: "/wms/inventario", icon: <ArrowRightLeft className="mr-2 h-4 w-4" /> },
        { label: "Sugestão de Compra (MRP)", route: "/compras/sugestoes", icon: <Brain className="mr-2 h-4 w-4" /> },
      ]
    },
    {
      group: "Governança e IA",
      items: [
        { label: "Cockpit de Governança", route: "/", icon: <BarChart3 className="mr-2 h-4 w-4" /> },
        { label: "Manual do Sistema", route: "/admin/manual", icon: <Settings className="mr-2 h-4 w-4" /> },
        { label: "Autopilot Intelligence", route: "/admin/ai-config", icon: <Zap className="mr-2 h-4 w-4" /> },
      ]
    }
  ];

  return (
    <div ref={ref}>
      <Button 
        variant="outline" 
        className="fixed bottom-6 right-6 shadow-2xl border-primary/20 bg-background/80 backdrop-blur-sm z-50 h-12 px-6 rounded-full gap-2 group transition-all hover:scale-105 active:scale-95"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
        <span className="text-xs font-bold uppercase tracking-widest hidden md:inline-block">Workflow Switcher</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="O que você deseja fazer agora?..." />
        <CommandList>
          <CommandEmpty>Nenhum fluxo encontrado.</CommandEmpty>
          {workflows.map((group) => (
            <CommandGroup key={group.group} heading={group.group}>
              {group.items.map((item) => (
                <CommandItem 
                  key={item.route} 
                  onSelect={() => {
                    navigate(item.route);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  {item.icon}
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </div>
  );
});
