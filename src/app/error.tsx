"use client";

/**
 * App-level Error Boundary — catches rendering errors within the main layout
 * (below the topbar). Shows a professional Accenture-register error state with
 * retry option instead of a blank page. The topbar and footer remain visible.
 * Theme-aware: reads from the RMIS token sheet (light :root / dark .dark).
 */

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="block-surface w-full max-w-md overflow-hidden border border-border">
        {/* Brand header — primary block with gold hairline */}
        <div className="border-b-2 border-b-[var(--gold)] bg-primary px-5 py-3">
          <h2 className="text-sm font-semibold text-primary-foreground">System Error</h2>
        </div>

        {/* Error body */}
        <div className="p-6 text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center border border-danger/30 bg-danger/10">
            <AlertCircle className="size-7 text-danger-ink" strokeWidth={1.5} />
          </div>

          <h3 className="text-base font-semibold text-surface-foreground">
            An unexpected error occurred
          </h3>

          <p className="mt-2 text-sm leading-relaxed text-surface-foreground/60">
            We apologize for the inconvenience. The system encountered an error
            while processing your request. Please try again. If the problem
            persists, contact support.
          </p>

          <Button onClick={reset} className="mt-5">
            <RefreshCw className="size-4" />
            Try Again
          </Button>

          {error.digest && (
            <p className="mt-4 text-xs text-surface-foreground/40">
              Reference: {error.digest}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
