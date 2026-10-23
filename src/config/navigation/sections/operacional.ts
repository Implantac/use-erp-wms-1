import type { NavSection } from '../types';

export const operacionalSection: NavSection = {
  label: 'Operacional & PCP',
  items: [
    {
      title: 'Estoque & Catálogo',
      href: '/estoque/produtos',
      icon: 'Package',
      children: [
        { title: 'Produtos & SKUs', href: '/estoque/produtos', icon: 'Box' },
        { title: 'Saldos & Inventário', href: '/estoque/saldos', icon: 'Calculator' },
        { title: 'Movimentações', href: '/estoque/movimentacoes', icon: 'ArrowLeftRight' },
        { title: 'Kardex Central', href: '/estoque/kardex', icon: 'BookOpen' },
      ],
    },
    {
      title: 'Produção (PCP)',
      href: '/producao',
      icon: 'Factory',
      unitTypes: ['INDUSTRY'],
      channels: ['ATACADO_INDUSTRIA'],
      scopes: ['SINGLE_UNIT'],
      children: [
        { title: 'Painel PCP Industrial', href: '/producao/pcp', icon: 'BarChart3' },
        { title: 'Central PCP Fiação', href: '/vertical/spinning', icon: 'Factory' },
        { title: 'Central PCP Malharia', href: '/vertical/knitting', icon: 'Factory' },
        { title: 'Central PCP Tecelagem', href: '/vertical/weaving', icon: 'Factory' },
        { title: 'Central PCP Tinturaria', href: '/vertical/dyeing', icon: 'Factory' },
        { title: 'Ordens de Produção', href: '/producao/ordens', icon: 'ClipboardCheck' },
        { title: 'Programação finita', href: '/producao/programacao', icon: 'Calendar' },
        { title: 'Etapas e apontamentos', href: '/producao/etapas', icon: 'ClipboardList' },
        { title: 'Terminal Operador', href: '/producao/terminal', icon: 'Smartphone' },
        { title: 'Qualidade e liberação', href: '/producao/qualidade', icon: 'ShieldCheck' },
        { title: 'Consumo de materiais', href: '/producao/consumo', icon: 'PackageCheck' },
        { title: 'Fichas, BOM e roteiros', href: '/producao/fichas', icon: 'FileText' },
        { title: 'Recursos e teares', href: '/producao/recursos', icon: 'Settings' },
        { title: 'Equipamentos', href: '/producao/maquinas', icon: 'Factory' },
        { title: 'Kanban de Produção', href: '/producao/kanban', icon: 'Columns' },
        { title: '🔍 Rastreabilidade', href: '/producao/rastreabilidade', icon: 'Search' },
        { title: '📦 MRP líquido', href: '/producao/mrp', icon: 'Package' },
        { title: '🧠 IA Produção', href: '/producao/ia', icon: 'Brain' },
      ],
    },
    {
      title: 'Compras & Suprimentos',
      href: '/compras/dashboard',
      icon: 'ShoppingCart',
      children: [
        { title: 'Fornecedores', href: '/compras/fornecedores', icon: 'Building2' },
        { title: 'Cotações', href: '/compras/cotacoes', icon: 'FileSearch' },
        { title: 'Pedidos de Compra', href: '/compras/pedidos', icon: 'ClipboardList' },
        { title: 'Painel MRP (Compras)', href: '/compras/dashboard', icon: 'BarChart3' },
      ],
    },
  ],
};
