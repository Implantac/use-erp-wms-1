/**
 * Diagnóstico de prontidão do PCP de um setor NA EMPRESA ATIVA.
 *
 * O motor de execução (criar OP -> programar -> apontar passagens ->
 * qualidade -> concluir gerando estoque) é transacional e rigoroso: sem
 * os cadastros-base ele recusa com a causa exata. Este diagnóstico lê os
 * mesmos cadastros que as RPCs validam e diz, na central do setor, o que
 * falta ANTES do usuário bater no erro — só com dados reais, sem estimar
 * nada. `companyTrap` sinaliza o caso clássico do grupo: a empresa ativa
 * não tem NENHUM produto (ex.: a holding), ou seja, a produção mora em
 * outra empresa do grupo e o caminho é trocar a empresa, não cadastrar.
 */
export interface SectorReadinessInput {
  /** Produtos ativos da empresa. */
  productsTotal: number;
  /** Produtos com ao menos uma linha de BOM. */
  productsWithBom: number;
  /** Produtos com BOM + roteiro ativo cuja 1ª operação é deste setor. */
  eligibleProducts: number;
  /** Operações ativas classificadas neste setor (catálogo de operações). */
  sectorOperations: number;
  /** Máquinas ativas deste setor. */
  sectorMachines: number;
  /** Lotes disponíveis + liberados pela qualidade com saldo > 0. */
  approvedLotsWithBalance: number;
}

export interface SectorReadinessItem {
  key: 'operations' | 'bom' | 'eligible' | 'machines' | 'lots';
  ok: boolean;
  label: string;
  hint: string;
  href?: string;
}

export interface SectorReadiness {
  /** Todos os pré-requisitos do setor estão presentes nesta empresa. */
  ready: boolean;
  /** Nenhum produto na empresa: provável empresa errada (holding/Loja). */
  companyTrap: boolean;
  items: SectorReadinessItem[];
}

export function diagnoseSectorReadiness(input: SectorReadinessInput, noun: string): SectorReadiness {
  const items: SectorReadinessItem[] = [
    {
      key: 'operations',
      ok: input.sectorOperations > 0,
      label: `Operações de ${noun} cadastradas`,
      hint: input.sectorOperations > 0
        ? `${input.sectorOperations} operação(ões) ativa(s) classificada(s) no setor`
        : 'Cadastre as operações do setor (o setor da OP nasce da 1ª operação do roteiro)',
      href: '/producao/etapas',
    },
    {
      key: 'bom',
      ok: input.productsWithBom > 0,
      label: 'Produto com BOM (ficha de materiais)',
      hint: input.productsWithBom > 0
        ? `${input.productsWithBom} produto(s) com estrutura de materiais`
        : 'Sem BOM não há consumo nem custo: cadastre a ficha do produto do setor',
      href: '/producao/fichas',
    },
    {
      key: 'eligible',
      ok: input.eligibleProducts > 0,
      label: `Produto pronto para abrir OP de ${noun}`,
      hint: input.eligibleProducts > 0
        ? `${input.eligibleProducts} produto(s) com BOM + roteiro ativo começando em ${noun}`
        : 'Falta um roteiro ativo cuja primeira operação seja deste setor para algum produto com BOM',
      href: '/producao/roteiros',
    },
    {
      key: 'machines',
      ok: input.sectorMachines > 0,
      label: `Máquinas de ${noun} cadastradas`,
      hint: input.sectorMachines > 0
        ? `${input.sectorMachines} máquina(s) ativa(s) para programar`
        : 'Sem máquina do setor não há fila nem programação por recurso',
      href: '/producao/maquinas',
    },
    {
      key: 'lots',
      ok: input.approvedLotsWithBalance > 0,
      label: 'Lote liberado com saldo para consumir',
      hint: input.approvedLotsWithBalance > 0
        ? `${input.approvedLotsWithBalance} lote(s) disponível(is) e liberado(s) com saldo`
        : 'A OP consome lotes aprovados com saldo na filial/canal dela; registre a entrada do insumo',
      href: '/wms/lotes',
    },
  ];
  return {
    ready: items.every((item) => item.ok),
    companyTrap: input.productsTotal === 0,
    items,
  };
}
