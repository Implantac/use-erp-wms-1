import { createContext, useContext, type ReactNode } from 'react';

export type ConfirmVariant = 'default' | 'destructive' | 'warning';
export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}
export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
export const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) return async (opts) => window.confirm(opts.title);
  return ctx;
}

/**
 * QA-UX (rodada 3) — substituto acessível de `window.prompt`.
 *
 * Tres telas pediam texto ao usuario com o dialog nativo do navegador:
 * sem rotulo, sem validacao, sem multilinha, sem foco gerenciado e bloqueante.
 * `window.prompt` tambem e silenciosamente neutralizado por alguns navegadores
 * quando ha dialogs repetidos — exatamente o caso de "justificativa obrigatoria".
 *
 * Retorna `null` se o usuario cancelar; nunca uma string vazia quando
 * `required` for true (o botao de confirmar fica desabilitado).
 */
export interface PromptOptions extends ConfirmOptions {
  placeholder?: string;
  defaultValue?: string;
  /** Exige texto nao vazio para habilitar a confirmacao. */
  required?: boolean;
  /** Usa textarea para justificativas longas. */
  multiline?: boolean;
  inputLabel?: string;
}
export type PromptFn = (opts: PromptOptions) => Promise<string | null>;
export const PromptCtx = createContext<PromptFn | null>(null);

export function usePrompt(): PromptFn {
  const ctx = useContext(PromptCtx);
  if (!ctx) return async (opts) => window.prompt(opts.title, opts.defaultValue ?? '') || null;
  return ctx;
}
