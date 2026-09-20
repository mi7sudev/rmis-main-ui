"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export interface ErrorResultProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Error result — MINIMAL ENTERPRISE.
 * A quiet, static statement of failure: warning icon, title, one supporting
 * line, one recovery action. No shake, no animation — errors should read as
 * information, not theatre.
 */
const ErrorResult = ({
  title = "Something went wrong",
  description = "There was a problem processing your request. Please try again.",
  onRetry,
  retryLabel = "Try again",
  action,
  className,
}: ErrorResultProps) => {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-sm flex-col items-center px-6 py-10 text-center sm:py-12",
        className
      )}
    >
      <div
        className="mb-4 grid size-12 shrink-0 place-items-center rounded-none border border-destructive/30 bg-destructive/10 text-danger-ink"
        aria-hidden
      >
        <AlertTriangle className="size-5" strokeWidth={1.5} />
      </div>

      <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h2>

      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>

      {(onRetry || action) && (
        <div className="mt-5 flex items-center gap-2">
          {onRetry && (
            <Button onClick={onRetry} size="sm" variant="outline">
              {retryLabel}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
};

export default ErrorResult;
