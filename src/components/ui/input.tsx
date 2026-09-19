import * as React from "react"

import { cn } from "@/lib/utils"

// Accenture input: sharp corners, transparent over the black canvas,
// mid-grey stroke that brightens on hover; focus = blue border + 1px ring
// (reads as the spec's 2px accent edge). Disabled states are token-driven
// so they hold in both dark and light modes.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground/60 selection:bg-primary selection:text-primary-foreground border-input flex h-12 w-full min-w-0 rounded-none border bg-transparent px-3.5 py-1 text-base transition-[color,border-color,background-color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium hover:border-input-hover disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-input disabled:bg-foreground/5 disabled:text-foreground/40 disabled:opacity-100 md:text-sm",
        "focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary",
        "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
