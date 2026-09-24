"use client";

// ============================================================================
// Atlas dash kit — the shared presentation primitives for the rebuilt dash
// surfaces (Review Queue, Candidate Registry, Candidate Dossier).
//
// One dependency direction only: views + *-bits compose from the kit; the kit
// composes from ui/* + lib tokens. Every tone flows through @/lib/status's
// Tone vocabulary so light/dark and the token palette stay consistent.
// ============================================================================

import {
  Fragment,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/client";
import { TONE_CLASSES, type Tone } from "@/lib/status";
import { Skeleton } from "@/components/ui/skeleton";

// ============================================================================
// Tone maps
// ============================================================================

/** Soft tinted chip classes (icon tiles, KPI tiles) per tone. */
export const toneSoft: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success-ink",
  warning: "bg-warning/10 text-warning-ink",
  danger: "bg-destructive/10 text-danger-ink",
  info: "bg-info/10 text-info-ink",
};

const METER_TONE: Record<Tone, string> = {
  neutral: "bg-muted-foreground/40",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
};

// ============================================================================
// Text helpers
// ============================================================================

/** Short date — "Aug 24, 2025" (the ledger rhythm). Null/invalid → "—". */
export function fmtDate(date: string | Date | null | undefined): string {
  return formatDate(date);
}

/** Compact relative age — "today" · "yesterday" · "3d ago" · "2mo ago" · "1y ago". */
export function relDays(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

/** "Juan Dela Cruz" → "JD". Empty → "?". */
export function initials(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  return (first + last).toUpperCase() || "?";
}

/** Debounced mirror of a fast-changing input value. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ============================================================================
// Monogram — gradient initial avatar
// ============================================================================

const MONOGRAM_SIZES = {
  sm: "size-9 text-xs",
  md: "size-10 text-sm",
  xl: "size-20 text-xl",
} as const;

export function Monogram({
  label,
  size = "md",
  className,
}: {
  label: string;
  size?: keyof typeof MONOGRAM_SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 select-none place-items-center rounded-full bg-linear-to-br from-primary via-primary/85 to-info font-semibold text-primary-foreground shadow-xs ring-1 ring-inset ring-black/[0.04]",
        MONOGRAM_SIZES[size],
        className
      )}
    >
      {label}
    </span>
  );
}

// ============================================================================
// PageShell + PageHeader — the page frame every dash view opens with
// ============================================================================

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1400px] flex-1 space-y-5 p-4 sm:p-6 lg:p-8 2xl:max-w-[1680px]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  chip,
  chipTone,
  sub,
  actions,
}: {
  eyebrow: string;
  title: string;
  chip?: ReactNode;
  chipTone?: Tone;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {eyebrow}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-[28px]">
            {title}
          </h1>
          {chip && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
                chipTone
                  ? TONE_CLASSES[chipTone].pill
                  : "border-border bg-secondary text-muted-foreground"
              )}
            >
              {chip}
            </span>
          )}
        </div>
        {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ============================================================================
// ViewTabs — the hairline underline tab strip (optional count badges)
// ============================================================================

export type ViewTab = {
  value: string;
  label: ReactNode;
  count?: number;
};

export function ViewTabs<T extends string>({
  value,
  onChange,
  tabs,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: ViewTab[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("flex items-center gap-1 border-b border-border", className)}
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value as T)}
            className={cn(
              "relative -mb-px inline-flex min-h-9 items-center gap-2 whitespace-nowrap border-b-2 px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                  active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Panel + PanelHead — the rounded-[20px] card frame and its head row
// ============================================================================

export function Panel({
  children,
  flush = false,
  className,
}: {
  children: ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[20px] border border-border bg-card shadow-xs",
        !flush && "p-4 sm:p-5",
        className
      )}
    >
      {children}
    </section>
  );
}

export function PanelHead({
  title,
  right,
  className,
}: {
  title: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-3", className)}>
      <div className="min-w-0 text-sm font-semibold text-foreground">{title}</div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

// ============================================================================
// KpiTile — icon chip + label + big numeral
// ============================================================================

export function KpiTile({
  icon: Icon,
  tone,
  label,
  value,
  className,
}: {
  icon: typeof Check;
  tone: Tone;
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3.5 rounded-[20px] border border-border/70 bg-card p-4 shadow-xs",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ring-black/[0.04]",
          toneSoft[tone]
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-[22px] font-semibold leading-tight tabular-nums tracking-[-0.02em] text-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Pill + ScoreChip + Dot — the quiet data chips
// ============================================================================

export function Pill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        TONE_CLASSES[tone].pill,
        className
      )}
    >
      {children}
    </span>
  );
}

/** Requirements/score chip — banded by score (85+/70+/50+ …). */
export function ScoreChip({ score, className }: { score: number; className?: string }) {
  const band: Tone =
    score >= 85 ? "success" : score >= 70 ? "primary" : score >= 50 ? "warning" : "danger";
  return (
    <span
      title={`Match score: ${score}%`}
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
        TONE_CLASSES[band].pill,
        className
      )}
    >
      {score}%
    </span>
  );
}

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-2 shrink-0 rounded-full", TONE_CLASSES[tone].dot, className)}
    />
  );
}

// ============================================================================
// Donut — the pipeline-overview ring (SVG, token-colored via stroke-*)
// ============================================================================

export function Donut({
  size = 116,
  thickness = 14,
  segments,
  className,
  children,
}: {
  size?: number;
  thickness?: number;
  segments: { value: number; className: string }[];
  className?: string;
  children?: ReactNode;
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={total > 0 ? `${total} total` : "No data"}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={thickness}
          className="stroke-muted"
        />
        {total > 0 &&
          segments.map((seg, i) => {
            const v = Math.max(0, seg.value);
            const dash = (v / total) * C;
            const drawn = Math.max(dash - 2, 0); // 2px gap between segments
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                strokeWidth={thickness}
                strokeDasharray={`${drawn} ${C - drawn}`}
                strokeDashoffset={-offset}
                className={seg.className}
              />
            );
            offset += dash;
            return el;
          })}
      </svg>
      {children && <div className="absolute inset-0 grid place-items-center">{children}</div>}
    </div>
  );
}

// ============================================================================
// Sparkline — 14-day volume strip (line + soft area)
// ============================================================================

export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  const W = 280;
  const H = 44;
  const max = Math.max(...points, 1);
  const step = points.length > 1 ? W / (points.length - 1) : W;
  const y = (p: number) => H - 4 - (p / max) * (H - 10);
  const line = points.map((p, i) => `${i * step},${y(p)}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden
      className={cn("h-11 w-full", className)}
    >
      <polygon points={area} className="fill-primary/10" />
      <polyline
        points={line}
        fill="none"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="stroke-primary"
      />
    </svg>
  );
}

// ============================================================================
// StageMeters — one horizontal stacked verdict bar
// ============================================================================

export function StageMeters({
  counts,
  className,
}: {
  counts: { tone: Tone; value: number }[];
  className?: string;
}) {
  const total = counts.reduce((s, c) => s + Math.max(0, c.value), 0);
  return (
    <div
      aria-hidden
      className={cn("flex h-2.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      {total > 0 &&
        counts
          .filter((c) => c.value > 0)
          .map((c, i) => (
            <span
              key={i}
              style={{ width: `${(c.value / total) * 100}%` }}
              className={cn("h-full", METER_TONE[c.tone])}
            />
          ))}
    </div>
  );
}

// ============================================================================
// EmptyState — the shared quiet empty/error state
// ============================================================================

export function EmptyState({
  icon: Icon,
  title,
  sub,
  action,
  className,
}: {
  icon: typeof Check;
  title: string;
  sub?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className
      )}
    >
      <span
        aria-hidden
        className="mb-3 grid size-11 place-items-center rounded-2xl bg-muted text-muted-foreground/70"
      >
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {sub && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ============================================================================
// Skeletons — SkBoard (pipeline columns) + SkLedger (ledger rows)
// ============================================================================

export function SkBoard({ cols = 4 }: { cols?: number }) {
  return (
    <div
      aria-hidden
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2",
        cols >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"
      )}
    >
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="rounded-[20px] border border-border/70 bg-secondary/40 p-3">
          <Skeleton className="mb-3 h-5 w-28" />
          <div className="space-y-2">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkLedger({ rows = 6 }: { rows?: number }) {
  return (
    <div
      aria-hidden
      className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-8 w-24 shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// DaysCard — the "N days since applied" chip
// ============================================================================

export function DaysCard({
  days,
  label,
  className,
}: {
  days: number;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-secondary/60 px-4 py-3 text-center",
        className
      )}
    >
      <p className="text-2xl font-semibold leading-none tabular-nums text-foreground">{days}</p>
      <p className="mt-1 whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

// ============================================================================
// StageStepper — the horizontal pipeline progress
// ============================================================================

export type StepperStage = {
  key: string;
  label: string;
  tone: Tone;
  /** Short date sub-label ("Aug 24") — null renders an empty slot. */
  date?: string | null;
};

const STEP_RING: Record<Tone, string> = {
  neutral: "ring-muted-foreground/20",
  primary: "ring-primary/20",
  success: "ring-success/25",
  warning: "ring-warning/25",
  danger: "ring-destructive/25",
  info: "ring-info/25",
};

export function StageStepper({
  stages,
  currentKey,
  rejected = false,
  className,
}: {
  stages: StepperStage[];
  currentKey: string;
  /** The negative terminal: the LAST stage is the reached one (red). */
  rejected?: boolean;
  className?: string;
}) {
  const reached = rejected ? stages.length - 1 : stages.findIndex((s) => s.key === currentKey);

  return (
    <div className={cn("flex min-w-0 items-start", className)}>
      {stages.map((s, i) => {
        const done = reached >= 0 && i < reached;
        const current = reached >= 0 && i === reached;
        return (
          <Fragment key={s.key}>
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "mx-2 mt-[18px] h-px flex-1",
                  done || current ? "bg-primary/50" : "bg-border"
                )}
              />
            )}
            <div className="flex min-w-0 flex-col items-center gap-1">
              <span
                className={cn(
                  "grid size-9 place-items-center rounded-full border text-xs font-semibold",
                  done || current
                    ? cn("border-transparent", TONE_CLASSES[s.tone].solid)
                    : "border-border bg-card text-muted-foreground",
                  current && "ring-4",
                  current && STEP_RING[s.tone]
                )}
              >
                {done ? (
                  <Check className="size-4" strokeWidth={3} aria-hidden />
                ) : current ? (
                  <span aria-hidden className="size-2 rounded-full bg-white/85" />
                ) : (
                  <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/40" />
                )}
              </span>
              <span
                className={cn(
                  "whitespace-nowrap text-xs font-medium",
                  reached >= 0 && i <= reached ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {s.label}
              </span>
              <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground/70">
                {s.date || ""}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
