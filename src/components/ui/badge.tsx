import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Accenture badge: flat, sharp, uppercase micro-label. Semantic tints are
// transparent washes with light-toned text so they read on the black canvas.
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-none border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-[#0E7ABF]",
        secondary:
          "border-transparent bg-secondary text-foreground [a&]:hover:bg-accent",
        gold: "border-transparent bg-gold text-black [a&]:hover:bg-gold/80",
        success:
          "border-transparent bg-success/15 text-success [a&]:hover:bg-success/25",
        warning:
          "border-transparent bg-warning/15 text-warning [a&]:hover:bg-warning/25",
        destructive:
          "border-destructive/40 bg-destructive/10 text-danger-ink [a&]:hover:bg-destructive/20",
        outline:
          "text-foreground border-input [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
