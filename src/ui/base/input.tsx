import * as React from "react";

import { cn } from "@/lib/utils";
import { fieldRef } from "./errorRef";

/**
 * QA-UX (rodada 4): quando o input nao tem nome explicito NEM `id`
 * (ou seja, nenhum `<label for>` pode aponta-lo), derivamos `aria-label`
 * do `placeholder`.
 *
 * QA-UX (rodada 6): formularios de negocio usam `<Label>` + `<Input>`
 * SOLTOS, sem `htmlFor`/`id` e sem `placeholder`. `labelledRef` completa
 * o nome a partir do `<label>` visivel ja renderizado, sem sobrescrever
 * nomes explicitos.
 *
 * QA-UX (rodada 11, UX9-04/UX10-03): o nome derivado do placeholder agora
 * é MARCADO com `data-ux-label-source="placeholder"`. Assim o `labelledRef`
 * pode substitui-lo pelo rótulo visível quando ele existir (ex.: "CEP *"
 * em vez de "00000-000"), preservando a r4 para campos que realmente não
 * têm `<label>` e mantendo intocáveis os `aria-label` explícitos.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, placeholder, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, ...props }, forwardedRef) => {
    const placeholderDerived =
      !ariaLabel && !ariaLabelledBy && !props.id && placeholder
        ? String(placeholder)
        : undefined;
    const derivedAriaLabel = ariaLabel ?? placeholderDerived;

    return (
      <input
        type={type}
        placeholder={placeholder}
        aria-label={derivedAriaLabel}
        aria-labelledby={ariaLabelledBy}
        data-ux-label-source={placeholderDerived ? "placeholder" : undefined}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={fieldRef(forwardedRef)}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
