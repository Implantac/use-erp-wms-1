import * as React from 'react';
import { Label } from '@/ui/base/label';
import { cn } from '@/lib/utils';

/**
 * QA-UX / S005 — campo de formulário com RÓTULO ASSOCIADO de verdade.
 *
 * Antes, os formulários de lançamento usavam `<label>` solto e `<Input>` sem
 * `id`: medido no Chromium, 0 pares label↔campo válidos em apontamento,
 * pedido de compra e terminal do operador. Consequência: leitor de tela não
 * anuncia o campo, clicar no rótulo não foca, e `aria-describedby` não tem
 * onde apontar.
 *
 * Este componente gera um id estável com useId(), liga Label.htmlFor ao
 * controle e propaga required / aria-invalid / aria-describedby para o filho
 * (Input, SelectTrigger, Textarea...). Use em todo formulário novo.
 */
interface FormFieldProps {
  label: string;
  children: React.ReactElement;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  /** Id explícito, quando o restante do código já depende dele. */
  id?: string;
}

export function FormField({ label, children, hint, error, required, className, id }: FormFieldProps) {
  const generated = React.useId().replace(/:/g, '');
  const fieldId = id ?? `ux-field-${generated}`;
  const describedBy = error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined;
  const childProps = (children as React.ReactElement<Record<string, unknown>>).props ?? {};

  const control = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    id: (childProps.id as string | undefined) ?? fieldId,
    'aria-describedby': (childProps['aria-describedby'] as string | undefined) ?? describedBy,
    'aria-invalid': error ? true : (childProps['aria-invalid'] as boolean | undefined),
    required: required ? true : (childProps.required as boolean | undefined),
  });

  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={fieldId}>
        {label}{required ? <span className="ml-0.5 text-destructive" aria-hidden="true">*</span> : null}
      </Label>
      {control}
      {hint && !error ? (
        <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-error`} role="alert" className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
