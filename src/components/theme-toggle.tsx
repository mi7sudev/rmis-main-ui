"use client";

// ============================================================================
// ThemeToggle — the dark/light switch in the Accenture language.
//
// · Sharp 0px square, 44px touch target, hairline border, no shadow
// · Ghost variant for the nav rail (borderless, rail-tinted hover)
// · CSS-driven icon swap: BOTH icons render and the .dark class (set on
//   <html> by next-themes before hydration) decides which shows — Sun while
//   the black canvas is active (tap → light), Moon while the light sheet is
//   active (tap → dark). No mounted-state means zero hydration risk.
// ============================================================================

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

type ThemeToggleProps = {
  variant?: "default" | "ghost";
  className?: string;
};

export function ThemeToggle({ variant = "default", className = "" }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();

  const base =
    "inline-grid size-11 shrink-0 place-items-center rounded-none transition-colors active:opacity-60";
  const skin =
    variant === "ghost"
      ? "hover:bg-accent hover:text-foreground"
      : "border border-border hover:bg-accent";

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle light and dark mode"
      title="Toggle light and dark mode"
      className={`${base} ${skin} ${className}`}
    >
      <Sun className="hidden size-[18px] dark:block" aria-hidden />
      <Moon className="block size-[18px] dark:hidden" aria-hidden />
    </button>
  );
}
