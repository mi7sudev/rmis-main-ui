"use client";

import React from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyResultProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  /** Optional icon — rendered inside the quiet square block. */
  icon?: React.ReactNode;
  className?: string;
  /** Optional custom visual (replaces the default icon block). */
  children?: React.ReactNode;
}

/**
 * Empty result — MINIMAL ENTERPRISE.
 * A quiet, static block: one hairline icon square, one title, one supporting
 * line, one action. No animation, no illustration, no motion choreography —
 * the emptiness communicates itself.
 */
const EmptyResult = ({
  title = "No Data Found",
  description = "It looks like there's nothing here yet!",
  action,
  icon,
  className,
  children,
}: EmptyResultProps) => {
  return (
    <div
      data-slot="empty-result"
      className={cn(
        "mx-auto flex w-full max-w-sm flex-col items-center px-6 py-10 text-center sm:py-12",
        className
      )}
    >
      {children ? (
        <div className="mb-4" aria-hidden>
          {children}
        </div>
      ) : (
        <div
          data-slot="empty-result-icon"
          className="mb-4 grid size-12 shrink-0 place-items-center rounded-none border border-border bg-muted/40 text-muted-foreground"
          aria-hidden
        >
          {icon ?? <Inbox className="size-5" strokeWidth={1.5} />}
        </div>
      )}

      <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h2>

      {description && (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}

      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};

export default EmptyResult;
