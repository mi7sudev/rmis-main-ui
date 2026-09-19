"use client";

import { type ReactNode } from "react";
import { Loader2, Tag } from "lucide-react";
import EmptyResult from "@/components/ui/empty-result";
import ErrorResult from "@/components/ui/error-result";
import { TONE_CLASSES, getStatusMeta, type Tone } from "@/lib/status";

// ============================================================================
// Accenture workspace primitives — black canvas · white ink · electric blue
// #1591DC · royal-gold kickers · sharp blocks · hairline borders · no shadows.
// ============================================================================

// ---- Status label (Tag-icon + word pill — a proper label, never a bare dot)
export function StatusIndicator({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const meta = getStatusMeta(status);
  const tone = TONE_CLASSES[meta.tone];
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border font-medium tracking-[0.01em] ${tone.pill} ${pad}`}>
      <Tag aria-hidden className={size === "sm" ? "size-3 shrink-0" : "size-3.5 shrink-0"} strokeWidth={2.25} />
      <span className="truncate">{meta.label}</span>
    </span>
  );
}

// ---- Section label (eyebrow) — royal gold kicker (heritage accent) --------
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`kicker kicker-gold ${className}`}>
      {children}
    </p>
  );
}

// ---- Workspace header — kicker → display headline → serif standfirst ------
// Accenture grammar: ONE uppercase kicker + ONE display title + ONE serif
// editorial sentence (the GT Sectra standfirst slot) per page hero.
export function WorkspaceTitle({
  title,
  description,
  actions,
  kicker,
  standfirst,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  kicker?: ReactNode;
  standfirst?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {kicker && <p className="kicker kicker-gold mb-3">{kicker}</p>}
        <h1 className="display-lg text-foreground">
          {title}
        </h1>
        {standfirst && (
          <p className="standfirst mt-3 max-w-2xl text-lg text-muted-foreground">{standfirst}</p>
        )}
        {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---- Filter bar — flat hairline panel ---------------------------------------
export function FilterBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 rounded-none border border-border bg-card p-3 sm:flex-row sm:items-center sm:gap-3 ${className}`}>
      {children}
    </div>
  );
}

// ---- Empty state — animated result card (dotLottie + motion) ---------------
// Delegates to the shared EmptyResult component; `icon` is accepted for
// backward compatibility with existing call sites but the animation is the
// system-wide empty visual now.
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return <EmptyResult title={title} description={description} action={action} />;
}

// ---- Loading state ----------------------------------------------------------
export function LoadingState({ label = "Loading…", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center py-16 ${className}`}>
      <Loader2 className="mb-3 size-6 animate-spin text-primary" strokeWidth={2} />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

// ---- Error state — animated result card (shake + dotLottie) -----------------
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <ErrorResult description={message} onRetry={onRetry} />;
}

// ---- Skeleton ---------------------------------------------------------------
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-none bg-muted ${className}`} />;
}

// ---- Metric -----------------------------------------------------------------
const METRIC_TONE: Record<Tone, string> = {
  neutral: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger-ink",
  info: "text-info-ink",
};

export function Metric({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="kicker text-muted-foreground">{label}</span>
      <span className={`stat-numeral text-2xl ${METRIC_TONE[tone]}`}>{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

// ---- Section divider with label ----------------------------------------------
export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="text-sm font-semibold tracking-[-0.01em] text-foreground">{children}</span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}
