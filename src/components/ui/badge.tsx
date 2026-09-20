import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// RMIS DESIGN.md badge register — 4px tags ("tags-badges" radius law) in the
// pxGrotesk label voice (Space Grotesk, sentence case, +0.02em). Semantic
// tints are transparent washes with mode-tuned ink text so they read on the
// obsidian canvas and the warm-paper sheet alike.
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-[4px] border px-2 py-0.5 font-label text-[11px] font-normal tracking-[0.02em] w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary-hover",
        secondary:
          "border-rim bg-secondary text-secondary-foreground [a&]:hover:bg-accent",
        gold: "border-transparent bg-gold text-[#151515] [a&]:hover:bg-gold/80",
        success:
          "border-transparent bg-success/15 text-success-ink [a&]:hover:bg-success/25",
        warning:
          "border-transparent bg-warning/15 text-warning-ink [a&]:hover:bg-warning/25",
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
