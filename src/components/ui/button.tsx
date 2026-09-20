import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// ============================================================================
// RMIS DESIGN.md button grammar ("warm obsidian workshop"):
// · Binary radius law — CTAs are ALWAYS 9999px pills; no in-between values
// · Primary = LUMINANCE CTA: parchment fill on obsidian (dark) /
//   obsidian fill on paper (light) — the brightest element on the page,
//   never an aggressive color CTA
// · Weight 380 (the spec's body voice) · 14-16px labels
// · Hover darkens/lifts via the primary-hover token; active presses 0.5px
// · Disabled = opacity 40 · Focus-visible = solid 2px luminance outline
// · Heights: 40px default (spec pill ~8px/20px padding), 44px sm touch,
//   48px lg for hero CTAs
// ============================================================================
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm leading-none transition-colors duration-200 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40 aria-invalid:outline-destructive [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary hover:bg-primary-hover hover:border-primary-hover",
        destructive:
          "bg-destructive text-[#e9ebdf] border border-destructive hover:bg-destructive/85",
        outline:
          "border border-rim bg-transparent text-foreground hover:border-input-hover hover:bg-accent hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground border border-rim hover:bg-accent",
        ghost:
          "text-foreground hover:bg-accent hover:text-foreground",
        link:
          "text-primary underline-offset-4 hover:text-brand-light hover:underline",
      },
      size: {
        default: "h-10 px-5 has-[>svg]:px-4",
        sm: "h-9 gap-1.5 px-4 text-xs has-[>svg]:px-3.5",
        lg: "h-12 px-7 text-base has-[>svg]:px-6",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "default"}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
