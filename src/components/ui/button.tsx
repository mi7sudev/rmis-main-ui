import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// ============================================================================
// Accenture button language (source-of-truth port):
// · Sharp 0px corners, flat fills — no shadows, no scale transforms
// · Primary #1591DC → hover darkens → active drops to opacity 60
// · Disabled = opacity 30 · Focus-visible = solid 2px blue outline
// · Heights: 48px default (secondary measure), 56px lg for hero CTAs
// ============================================================================
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none text-base font-medium leading-none transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-30 active:opacity-60 aria-invalid:outline-destructive [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[#0E7ABF]",
        destructive:
          "bg-destructive text-white hover:bg-[#B80525]",
        outline:
          "border border-input bg-transparent text-foreground hover:border-input-hover hover:bg-accent hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "text-foreground hover:bg-accent hover:text-foreground",
        link:
          "text-primary underline-offset-4 hover:text-brand-light hover:underline",
      },
      size: {
        default: "h-12 px-6 has-[>svg]:px-5",
        sm: "h-10 gap-1.5 px-4 text-sm has-[>svg]:px-3.5",
        lg: "h-14 px-8 text-base has-[>svg]:px-6",
        icon: "size-12",
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
