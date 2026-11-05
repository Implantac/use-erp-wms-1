import { SECTOR_MATCHERS, type SectorKind } from '@/lib/pcp/sectorProfiles';

export interface SectorCentralConfig {
  key: SectorKind;
  /** Nome do setor para textos ("fiação", "tecelagem"...). */
  noun: string;
  title: string;
  description: string;
  newOrderLabel: string;
  /** Trechos (sem acento, minúsculos) que identificam o setor da OP. */
  matchers: readonly string[];
}

export const SECTOR_CENTRALS: Record<SectorCentralConfig['key'], SectorCentralConfig> = {
  fiacao: {
    key: 'fiacao',
    noun: 'fiação',
    title: 'Central PCP — Fiação',
    description: 'Fluxo executável da fiação: OP com snapshot, reserva por lote de fibra/pluma, capacidade finita, apontamento sequencial, qualidade e genealogia até o fio.',
    newOrderLabel: 'Nova OP de fiação',
    matchers: SECTOR_MATCHERS.fiacao,
  },
  malharia: {
    key: 'malharia',
    noun: 'malharia',
    title: 'Central PCP — Malharia',
    description: 'Fluxo executável da malharia: OP com snapshot, reserva por lote de fio, capacidade finita, apontamento sequencial, qualidade e genealogia até a malha crua.',
    newOrderLabel: 'Nova OP de malharia',
    matchers: SECTOR_MATCHERS.malharia,
  },
  tecelagem: {
    key: 'tecelagem',
    noun: 'tecelagem',
    title: 'Central PCP — Tecelagem',
    description: 'Crie a OP, programe no tear, acompanhe passagens e paradas, libere a qualidade e gere o estoque do tecido — tudo nesta central.',
    newOrderLabel: 'Nova OP de tecelagem',
    matchers: SECTOR_MATCHERS.tecelagem,
  },
  tinturaria: {
    key: 'tinturaria',
    noun: 'tinturaria',
    title: 'Central PCP — Tinturaria',
    description: 'Fluxo executável da tinturaria: OP com snapshot (ficha e receita configuradas da empresa), reserva por lote, capacidade finita, apontamento sequencial, qualidade e genealogia até o lote tingido.',
    newOrderLabel: 'Nova OP de tinturaria',
    matchers: SECTOR_MATCHERS.tinturaria,
  },
  beneficiamento: {
    key: 'beneficiamento',
    noun: 'beneficiamento',
    title: 'Central PCP — Beneficiamento/Acabamento',
    description: 'Fluxo executável do beneficiamento: OP com snapshot, perfil da rama/acabamento (largura, gramatura, encolhimento configurados), reserva por lote, capacidade finita, apontamento sequencial, qualidade e genealogia até o tecido acabado.',
    newOrderLabel: 'Nova OP de beneficiamento',
    matchers: SECTOR_MATCHERS.beneficiamento,
  },
};
