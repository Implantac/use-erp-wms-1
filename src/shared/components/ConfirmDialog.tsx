import * as React from 'react';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ConfirmCtx, type ConfirmFn, type ConfirmOptions } from './confirmContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/base/alert-dialog';
import { cn } from '@/lib/utils';

/**
 * Provider global de confirmação destrutiva unificada.
 * Uso: `const confirm = useConfirm(); if (await confirm({ title: 'Excluir?' })) { ... }`.
 */
export const ConfirmDialogProvider = React.memo(({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleClose = (result: boolean) => {
    setOpen(false);
    resolverRef.current?.(result);
    resolverRef.current = null;
  };

  const value = useMemo(() => confirm, [confirm]);
  const variant = opts?.variant ?? 'default';

  return (
    <ConfirmCtx.Provider value={value}>
      {children}
      <AlertDialog open={open} onOpenChange={(v) => { if (!v) handleClose(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title ?? 'Confirmar'}</AlertDialogTitle>
            {opts?.description && (
              <AlertDialogDescription asChild>
                <div className="text-sm text-muted-foreground">{opts.description}</div>
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleClose(false)}>
              {opts?.cancelLabel ?? 'Cancelar'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleClose(true)}
              className={cn(
                variant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                variant === 'warning' && 'bg-yellow-600 text-white hover:bg-yellow-600/90',
              )}
            >
              {opts?.confirmLabel ?? 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmCtx.Provider>
  );
});

ConfirmDialogProvider.displayName = 'ConfirmDialogProvider';
