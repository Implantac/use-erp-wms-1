import * as React from 'react';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ConfirmCtx, PromptCtx,
  type ConfirmFn, type ConfirmOptions, type PromptFn, type PromptOptions,
} from './confirmContext';
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
import { Input } from '@/ui/base/input';
import { Textarea } from '@/ui/base/textarea';
import { FormField } from '@/shared/components/FormField';
import { cn } from '@/lib/utils';

/**
 * Provider global de confirmação destrutiva unificada.
 * Uso: `const confirm = useConfirm(); if (await confirm({ title: 'Excluir?' })) { ... }`.
 *
 * QA-UX (rodada 3): passa a oferecer também `usePrompt()`, substituto
 * acessível de `window.prompt`, com rótulo, validação de obrigatoriedade,
 * suporte a multilinha e foco inicial no campo. A API de `confirm` é mantida
 * sem alteração para não quebrar as telas que já a utilizam.
 */
export const ConfirmDialogProvider = React.memo(({ children }: { children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<ConfirmOptions | PromptOptions | null>(null);
  const [mode, setMode] = useState<'confirm' | 'prompt'>('confirm');
  const [inputValue, setInputValue] = useState('');
  const resolverRef = useRef<((v: boolean | string | null) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setOpts(options);
    setMode('confirm');
    setOpen(true);
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve; });
  }, []);

  const prompt = useCallback<PromptFn>((options) => {
    setOpts(options);
    setMode('prompt');
    setInputValue(options.defaultValue ?? '');
    setOpen(true);
    return new Promise<string | null>((resolve) => { resolverRef.current = resolve; });
  }, []);

  const finish = (result: boolean | string | null) => {
    setOpen(false);
    resolverRef.current?.(result);
    resolverRef.current = null;
  };

  const handleClose = (confirmed: boolean) => {
    if (!confirmed) return finish(mode === 'prompt' ? null : false);
    if (mode === 'prompt') {
      const p = opts as PromptOptions;
      const value = inputValue.trim();
      if (p.required && !value) return; // botão já vem desabilitado
      return finish(value);
    }
    return finish(true);
  };

  const confirmValue = useMemo(() => confirm, [confirm]);
  const promptValue = useMemo(() => prompt, [prompt]);
  const variant = opts?.variant ?? 'default';
  const pOpts = mode === 'prompt' ? (opts as PromptOptions | null) : null;
  const missingRequired = !!(pOpts?.required && !inputValue.trim());

  return (
    <ConfirmCtx.Provider value={confirmValue}>
      <PromptCtx.Provider value={promptValue}>
        {children}
        <AlertDialog open={open} onOpenChange={(v) => { if (!v) finish(mode === 'prompt' ? null : false); }}>
          <AlertDialogContent
            onOpenAutoFocus={(e) => {
              if (mode !== 'prompt') return;
              e.preventDefault();
              inputRef.current?.focus();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{opts?.title ?? 'Confirmar'}</AlertDialogTitle>
              {/* QA-UX (rodada 3): o Radix exige uma descricao para leitores de
                  tela. Antes ela so existia quando opts.description era
                  fornecido, e o AlertDialogContent emitia aviso de
                  acessibilidade. Agora sempre ha contexto, ainda que enxuto. */}
              <AlertDialogDescription asChild>
                <div className="text-sm text-muted-foreground">
                  {opts?.description ?? (mode === 'prompt'
                    ? 'Preencha o campo abaixo e confirme para continuar.'
                    : 'Confira a ação antes de confirmar. Você pode cancelar sem alterar nada.')}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>

            {pOpts && (
              <FormField label={pOpts.inputLabel ?? 'Informação'} required={pOpts.required}>
                {pOpts.multiline ? (
                  <Textarea
                    ref={inputRef as React.Ref<HTMLTextAreaElement>}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={pOpts.placeholder}
                    rows={3}
                  />
                ) : (
                  <Input
                    ref={inputRef as React.Ref<HTMLInputElement>}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder={pOpts.placeholder}
                  />
                )}
              </FormField>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => handleClose(false)}>
                {opts?.cancelLabel ?? 'Cancelar'}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleClose(true)}
                disabled={missingRequired}
                className={cn(
                  variant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                  variant === 'warning' && 'bg-yellow-600 text-white hover:bg-yellow-600/90',
                  missingRequired && 'pointer-events-none opacity-50',
                )}
              >
                {opts?.confirmLabel ?? 'Confirmar'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PromptCtx.Provider>
    </ConfirmCtx.Provider>
  );
});

ConfirmDialogProvider.displayName = 'ConfirmDialogProvider';
