import * as React from "react";

import { cn } from "@/lib/utils";
import { labelledRef } from "./labelledRef";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/** QA-UX (rodada 6): deriva `aria-label` do `<Label>` visivel quando solto. */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, forwardedRef) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={labelledRef(forwardedRef)}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
