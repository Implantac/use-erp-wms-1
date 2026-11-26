import type { NavSection } from '../types';

export const redeOperacionalSection: NavSection = {
  label: 'Rede & Distribuição',
  items: [
    {
      title: 'Abastecimento',
      href: '/operacional/abastecimento',
      icon: 'ArrowRightLeft',
      children: [
        { title: 'Painel de abastecimento', href: '/operacional/abastecimento/central', icon: 'LayoutDashboard' },
        { title: 'Reposição', href: '/operacional/rede/ressuprimento', icon: 'RefreshCw' },
        { title: 'Transferências', href: '/operacional/rede/transferencias', icon: 'Truck' },
        { title: 'Receber mercadoria', href: '/operacional/rede/receber', icon: 'PackageCheck' },
        { title: 'Situação das lojas', href: '/operacional/rede/painel', icon: 'Layers' },
      ],
    },
    {
      title: 'Torre do Gestor de Lojas',
      href: '/operacional/loja/gestor',
      icon: 'Workflow',
      children: [
        { title: 'Consolidado, cobertura e reposições', href: '/operacional/loja/gestor', icon: 'LayoutGrid' },
        { title: 'Consignado fábrica ↔ lojas', href: '/operacional/loja/gestor', icon: 'Handshake' },
      ],
    },
  ],
};
