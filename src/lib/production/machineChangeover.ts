export interface MachineChangeoverConfig {
  setupTimeMinutes?: number | null;
  cleaningTimeMinutes?: number | null;
}

export interface ChangeoverMinutes {
  setup: number;
  cleaning: number;
  total: number;
}

function minutesOrZero(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Tempos de troca configurados pela empresa para a máquina. Campo não
 * configurado (null) vale zero: nenhum tempo de setup/limpeza é presumido.
 */
export function changeoverMinutes(config: MachineChangeoverConfig): ChangeoverMinutes {
  const setup = minutesOrZero(config.setupTimeMinutes);
  const cleaning = minutesOrZero(config.cleaningTimeMinutes);
  return { setup, cleaning, total: setup + cleaning };
}

/** Troca só existe quando o artigo muda; mesmo artigo em sequência, não. */
export function requiresChangeover(previousProductId: string | null, nextProductId: string | null): boolean {
  return Boolean(previousProductId && nextProductId && previousProductId !== nextProductId);
}

/**
 * Janela em que a máquina fica ocupada por uma produção quando há troca:
 * setup antes do início e limpeza depois do fim (epoch ms).
 */
export function occupiedWindow(startMs: number, endMs: number, config: MachineChangeoverConfig): { start: number; end: number } {
  const { setup, cleaning } = changeoverMinutes(config);
  return { start: startMs - setup * 60_000, end: endMs + cleaning * 60_000 };
}

/** Validação de formulário: tempo informado precisa ser número >= 0. */
export function validateChangeoverField(value: string, label: string): string | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return `${label} deve ser um número de minutos maior ou igual a zero.`;
  return null;
}
