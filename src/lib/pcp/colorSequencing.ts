export type ColorSequencingRule = "light_to_dark";

export const COLOR_SEQUENCING_RULE_LABELS: Record<ColorSequencingRule, string> = {
  light_to_dark: "Claro → escuro (L* decrescente)",
};

export interface ColorSequenceCheck {
  rule: string | null;
  newLabL: number | null;
  prevLabL: number | null;
  nextLabL: number | null;
}

/**
 * Espelho da barreira de banco do sequenciamento de cor: com a regra
 * claro→escuro configurada na máquina, clareamento entre partidas vizinhas
 * (comparadas pelo L* alvo) é inválido. Sem regra ou sem L* informado, não
 * há referência e nada é bloqueado nem presumido.
 */
export function colorSequenceViolation(check: ColorSequenceCheck): string | null {
  if (check.rule !== "light_to_dark") return null;
  if (check.newLabL === null) return null;
  if (check.prevLabL !== null && check.newLabL > check.prevLabL) {
    return `Clareamento: partida com L* ${check.newLabL} depois de L* ${check.prevLabL} quebra a sequência claro→escuro.`;
  }
  if (check.nextLabL !== null && check.nextLabL > check.newLabL) {
    return `Clareamento: partida com L* ${check.newLabL} antes de L* ${check.nextLabL} deixaria a próxima em clareamento.`;
  }
  return null;
}

/** Regra gravada no cadastro da máquina: texto livre nunca é aceito. */
export function normalizeColorSequencingRule(value: string | null | undefined): ColorSequencingRule | null {
  return value === "light_to_dark" ? "light_to_dark" : null;
}
