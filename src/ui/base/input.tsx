import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * QA-UX (rodada 4): campos de busca sem rotulo.
 *
 * Medido no Chromium: 9 inputs de filtro em 7 telas tinham apenas
 * `placeholder` — sem `id`, sem `<label for>`, sem `aria-label`. Para quem
 * usa leitor de tela eram campos anonimos ("editar, em branco").
 *
 * Quando o input nao tem nome acessivel explicito NEM `id` (ou seja, nao ha
 * como um `<label for>` apontar para ele), derivamos `aria-label` do
 * placeholder. Inputs com `id` — inclusive os gerenciados por `FormField` —
 * NAO recebem o nome derivado, para que o `<label htmlFor>` continue tendo
 * precedencia e o rotulo visivel seja o anunciado.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, placeholder, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy, ...props }, ref) => {
    const derivedAriaLabel =
      ariaLabel ??
      (ariaLabelledBy || props.id || !placeholder ? undefined : String(placeholder));

    return (
      <input
        type={type}
        placeholder={placeholder}
        aria-label={derivedAriaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
