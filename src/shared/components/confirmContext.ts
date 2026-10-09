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
