export type Segment = 
  | 'textile' 
  | 'food_factory' 
  | 'pharma' 
  | 'distribution' 
  | 'services' 
  | 'retail' 
  | 'general' 
  | 'fio' 
  | 'tecelagem' 
  | 'animal_feed' 
  | 'industry' 
  | 'wholesaler' 
  | 'retail_chain' 
  | 'franchise' 
  | 'holding' 
  | 'apparel'
  | 'dyeing'
  | 'laundry'
  | 'chemicals';

/** Legacy onboarding values are persisted in companies.segment; never cast an unknown value into a valid niche. */
export function normalizeSegment(value: string | null | undefined): Segment | null {
  if (!value) return null;
  const aliases: Record<string, Segment> = {
    confeccao: 'apparel', industria: 'industry', distribuicao: 'distribution',
    varejo: 'retail', servicos: 'services',
  };
  if (Object.prototype.hasOwnProperty.call(aliases, value)) return aliases[value];
  return Object.prototype.hasOwnProperty.call(SEGMENTS, value) ? value as Segment : null;
}

export interface SegmentConfig {
  label: string;
  allowedSections: string[];
  recommendedModules: string[];
  /** Telas de vitrine (sem operação real alimentando) fora do menu. */
  hiddenHrefs?: string[];
}

/**
 * PODA DE TELAS (2026-10-23): telas que nenhuma operação real alimenta
 * (IA preditiva, gêmeo digital, IoT, APS experimental, gamificação) saem
 * do menu de TODOS os nichos — menu é ferramenta de trabalho, não vitrine.
 * As rotas continuam existindo para avaliação técnica via URL direta.
 * Para reabilitar uma tela: remova o href daqui quando houver dado real
 * e uso comprovado no piloto.
 */
export const SHOWCASE_HREFS: readonly string[] = [
  '/producao/ia',
  '/producao/twin',
  '/producao/iot',
  '/producao/previsoes',
  '/producao/aps',
  '/producao/aps/multi',
  '/comercial/ia',
  '/comercial/gamificacao',
];

export const SEGMENTS: Record<Segment, SegmentConfig> = {
  textile: {
    label: 'Indústria Têxtil',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Supply Chain & WMS', 'Comercial & Vendas', 'Controladoria & Fiscal', 'Gestão & Admin', 'Pacotes Verticais', 'Rede & Distribuição'],
    recommendedModules: ['PCP', 'Engenharia', 'Qualidade', 'Custos', 'Têxtil']
  },
  apparel: {
    label: 'Confecção / Vestuário',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Supply Chain & WMS', 'Comercial & Vendas', 'Controladoria & Fiscal', 'Gestão & Admin', 'Pacotes Verticais', 'Rede & Distribuição'],
    recommendedModules: ['PCP', 'PLM', 'Facções', 'Grades', 'Têxtil']
  },
  fio: {
    label: 'Fiação',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Supply Chain & WMS', 'Controladoria & Fiscal', 'Gestão & Admin', 'Pacotes Verticais', 'Rede & Distribuição'],
    recommendedModules: ['PCP', 'Misturas', 'Fardos', 'Fiação']
  },
  tecelagem: {
    label: 'Tecelagem',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Supply Chain & WMS', 'Controladoria & Fiscal', 'Gestão & Admin', 'Pacotes Verticais', 'Rede & Distribuição'],
    recommendedModules: ['PCP', 'Urdimento', 'Tingimento', 'Tecelagem']
  },
  dyeing: {
    label: 'Tinturaria Industrial',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Supply Chain & WMS', 'Comercial & Vendas', 'Controladoria & Fiscal', 'Gestão & Admin'],
    recommendedModules: ['PCP', 'Receitas', 'Qualidade']
  },
  laundry: {
    label: 'Lavanderia Industrial',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Supply Chain & WMS', 'Comercial & Vendas', 'Controladoria & Fiscal', 'Gestão & Admin'],
    recommendedModules: ['PCP', 'Receitas', 'Qualidade']
  },
  chemicals: {
    label: 'Químicos e Produtos de Limpeza',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Supply Chain & WMS', 'Comercial & Vendas', 'Controladoria & Fiscal', 'Gestão & Admin'],
    recommendedModules: ['PCP', 'Formulações', 'Qualidade']
  },
  pharma: {
    label: 'Farmacêutico',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Supply Chain & WMS', 'Controladoria & Fiscal', 'Gestão & Admin', 'Pacotes Verticais', 'Rede & Distribuição'],
    recommendedModules: ['GMP', 'CQ', 'Qualidade', 'Rastreabilidade', 'Farmacêutico']
  },
  animal_feed: {
    label: 'Fábrica de Ração',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Supply Chain & WMS', 'Controladoria & Fiscal', 'Gestão & Admin', 'Pacotes Verticais', 'Rede & Distribuição'],
    recommendedModules: ['Formulações', 'Bromatologia', 'PCP', 'Alimentos']
  },
  food_factory: {
    label: 'Indústria de Alimentos',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Supply Chain & WMS', 'Controladoria & Fiscal', 'Gestão & Admin', 'Pacotes Verticais', 'Rede & Distribuição'],
    recommendedModules: ['PCP', 'Qualidade', 'Rastreabilidade', 'Alimentos']
  },
  industry: {
    label: 'Indústria Geral',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Supply Chain & WMS', 'Controladoria & Fiscal', 'Gestão & Admin', 'Rede & Distribuição'],
    recommendedModules: ['PCP', 'MRP', 'Engenharia', 'Manutenção']
  },
  distribution: {
    label: 'Distribuidora',
    allowedSections: ['Executivo & IA', 'Supply Chain & WMS', 'Operacional & PCP', 'Comercial & Vendas', 'Controladoria & Fiscal', 'Gestão & Admin', 'Rede & Distribuição'],
    recommendedModules: ['WMS', 'TMS', 'Expedição', 'Vendas']
  },
  wholesaler: {
    label: 'Atacadista',
    allowedSections: ['Executivo & IA', 'Supply Chain & WMS', 'Operacional & PCP', 'Comercial & Vendas', 'Controladoria & Fiscal', 'Gestão & Admin', 'Rede & Distribuição'],
    recommendedModules: ['WMS', 'Vendas', 'CRM']
  },
  retail: {
    label: 'Varejo',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Comercial & Vendas', 'Controladoria & Fiscal', 'Gestão & Admin', 'Rede & Distribuição'],
    recommendedModules: ['PDV', 'CRM', 'Fidelidade', 'Vendas']
  },
  retail_chain: {
    label: 'Rede de Lojas',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Comercial & Vendas', 'Controladoria & Fiscal', 'Gestão & Admin', 'Supply Chain & WMS', 'Rede & Distribuição'],
    recommendedModules: ['PDV', 'Transferências', 'Consignado', 'CRM']
  },
  franchise: {
    label: 'Franquia',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Comercial & Vendas', 'Controladoria & Fiscal', 'Gestão & Admin', 'Rede & Distribuição'],
    recommendedModules: ['PDV', 'Royalties', 'Consignado', 'CRM']
  },
  holding: {
    label: 'Holding / Grupo Empresarial',
    allowedSections: ['Executivo & IA', 'Gestão & Admin', 'Controladoria & Fiscal', 'Comercial & Vendas', 'Rede & Distribuição'],
    recommendedModules: ['Consolidação', 'Auditoria', 'Executive']
  },
  services: {
    label: 'Prestação de Serviços',
    allowedSections: ['Executivo & IA', 'Comercial & Vendas', 'Controladoria & Fiscal', 'Gestão & Admin'],
    recommendedModules: ['Projetos', 'Contratos', 'Faturamento']
  },
  general: {
    label: 'Geral / Outros',
    allowedSections: ['Executivo & IA', 'Operacional & PCP', 'Comercial & Vendas', 'Controladoria & Fiscal', 'Gestão & Admin', 'Supply Chain & WMS', 'Rede & Distribuição'],
    recommendedModules: ['Básico', 'Financeiro', 'Comercial']
  }
};

export const COMPANY_SIZES = [
  'Microempresa (ME)',
  'Empresa de Pequeno Porte (EPP)',
  'Média Empresa',
  'Grande Empresa',
  'Multinacional'
];

export const TAX_REGIMES = [
  'Simples Nacional',
  'Lucro Presumido',
  'Lucro Real',
  'MEI'
];

// Toda empresa vê o menu podado; vitrine não volta por nicho.
for (const cfg of Object.values(SEGMENTS)) {
  cfg.hiddenHrefs = [...SHOWCASE_HREFS];
}

export function isHiddenHref(segment: string | null | undefined, href: string | null | undefined): boolean {
  if (!segment || !href) return false;
  const cfg = (SEGMENTS as Record<string, SegmentConfig>)[segment];
  return !!cfg?.hiddenHrefs?.includes(href);
}
