import * as React from "react"

import { cn } from "@/lib/utils"

// Accenture textarea — same language as Input: sharp, flat, blue focus edge.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground/60 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive flex field-sizing-content min-h-24 w-full rounded-none border bg-transparent px-3.5 py-2.5 text-base transition-[color,border-color,background-color,box-shadow] outline-none hover:border-input-hover focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:border-input disabled:bg-foreground/5 disabled:text-foreground/40 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
