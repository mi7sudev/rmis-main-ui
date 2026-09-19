"use client";

// ============================================================================
// ThemeProvider — next-themes with the CLASS strategy on <html>.
//
// The RMIS Accenture system is dark-first: the signature black canvas sheet is
// the DEFAULT experience, and the light sheet (white canvas, #F1F1EF blocks)
// is opt-in via the toggle. `enableSystem` is off so the toggle is the single
// source of truth — a user's OS preference never fights the brand default.
// `suppressHydrationWarning` on <html> (see app/layout.tsx) absorbs the class
// next-themes injects before React hydrates.
// ============================================================================

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
