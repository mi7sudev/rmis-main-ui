"use client";

import { Loader2 } from "lucide-react";
import { type ReactNode } from "react";
import EmptyResult from "@/components/ui/empty-result";
import ErrorResult from "@/components/ui/error-result";
import SuccessResult from "@/components/ui/success-result";
import { ScrollBar } from "@/components/ui/scroll-area";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

// ============================================================================
// RMIS × Accenture shared primitives — black canvas · white ink · electric
// blue #1591DC · royal gold reserved for kickers · sharp 0px corners · no
// shadows (depth is colour-blocking). Exports keep their props/API identical.
// ============================================================================

// ---- Pagination ------------------------------------------------------------
export function TablePagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const items = pageItems(page, totalPages);
  return (
    <Pagination className="w-auto">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            onClick={(e) => { e.preventDefault(); if (page > 1) onPageChange(page - 1); }}
            aria-disabled={page <= 1}
            className={`${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
          />
        </PaginationItem>
        {items.map((it, i) =>
          it === "…" ? (
            <PaginationItem key={`ellipsis-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={it}>
              <PaginationLink
                href="#"
                isActive={it === page}
                onClick={(e) => { e.preventDefault(); onPageChange(it); }}
              >
                {it}
              </PaginationLink>
            </PaginationItem>
          )
        )}
        <PaginationItem>
          <PaginationNext
            href="#"
            onClick={(e) => { e.preventDefault(); if (page < totalPages) onPageChange(page + 1); }}
            aria-disabled={page >= totalPages}
            className={`${page >= totalPages ? "pointer-events-none opacity-50" : ""}`}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

function pageItems(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

// ---- Scrollable table card ------------------------------------------------
export function ScrollableTableCard({
  children,
  page,
  totalPages,
  onPageChange,
  total,
  pageSize,
  height = "60vh",
  countLabel = "items",
}: {
  children: ReactNode;
  page?: number;
  totalPages?: number;
  onPageChange?: (p: number) => void;
  total?: number;
  pageSize?: number;
  height?: string;
  countLabel?: string;
}) {
  const showPagination = page != null && totalPages != null && onPageChange != null && totalPages > 1;
  return (
    <div className="overflow-hidden border border-border bg-card">
      <ScrollAreaPrimitive.Root style={{ height }} className="w-full overflow-hidden">
        <ScrollAreaPrimitive.Viewport className="size-full w-full">
          {children}
        </ScrollAreaPrimitive.Viewport>
        <ScrollBar />
        <ScrollBar orientation="horizontal" />
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
      {showPagination && (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-border p-4 sm:flex-row">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {total != null && pageSize != null
              ? `Showing ${Math.min(pageSize, total - (page! - 1) * pageSize)} of ${total} ${countLabel}`
              : `Page ${page} of ${totalPages}`}
          </span>
          <TablePagination page={page!} totalPages={totalPages!} onPageChange={onPageChange!} />
        </div>
      )}
    </div>
  );
}

// ---- Page header -----------------------------------------------------------
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 border-b border-border pb-5 sm:mb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="display-lg text-foreground">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

// ---- Loading / Empty / Error / Success states -------------------------------
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <Loader2 className="mb-3 size-6 animate-spin text-primary" strokeWidth={2} />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

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
  // Animated result card (dotLottie + motion) — icon prop accepted for
  // backward compatibility with existing call sites.
  return <EmptyResult title={title} description={description} action={action} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <ErrorResult description={message} onRetry={onRetry} />;
}

export function SuccessState({
  title = "Success",
  description = "Your operation was completed successfully.",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return <SuccessResult title={title} description={description} action={action} />;
}

// ---- Section card -----------------------------------------------------------
export function SectionCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="overflow-hidden border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-[-0.01em] text-foreground">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="px-5 py-5 text-foreground sm:px-6">{children}</div>
    </div>
  );
}

// ---- FieldRow ----------------------------------------------------------------
export function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/70 py-3 last:border-0 sm:flex-row sm:items-start sm:gap-4">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:w-44">
        {label}
      </dt>
      <dd className="whitespace-pre-line break-words text-sm font-medium text-foreground">
        {value || <span className="text-muted-foreground/40">—</span>}
      </dd>
    </div>
  );
}
