"use client";

// ============================================================================
// job-detail-bits — the four building blocks of a job-posting detail page.
// ----------------------------------------------------------------------------
// ONE register, TWO consumers: the 02 board's full posting page (jobs-view)
// and the applicant home's application detail modal (application-detail-
// modal). Extracted verbatim from jobs-view so the modal that opens from the
// "Your Applications" rail renders the EXACT same blocks as the posting page
// it mirrors — fixing a cell fixes both surfaces (locality, like wire.ts).
// Sharp 0px corners, hairline borders, zero shadows — the Accenture block.
// ============================================================================

import type { ReactNode } from "react";

// SummaryCell — one vital-stat cell of the detail summary grid
// (Item No. · Vacancies · Salary Grade · Monthly Salary).
export function SummaryCell({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="border border-border bg-card p-3.5 sm:p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="kicker">{label}</span></div>
      <div className="mt-1.5 break-all text-sm font-semibold tracking-[-0.01em] text-foreground">{value}</div>
    </div>
  );
}

// DateCell — one publication date cell; `urgent` flips the block to the
// warning tone (deadline inside the next 7 days).
export function DateCell({ icon, label, value, urgent }: { icon: ReactNode; label: string; value: string; urgent?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 border p-3.5 sm:p-4 ${urgent ? "border-warning/40 bg-warning/10" : "border-border bg-card"}`}>
      <span className={urgent ? "text-warning" : "text-muted-foreground"}>{icon}</span>
      <div>
        <div className="kicker text-muted-foreground">{label}</div>
        <div className={`text-sm font-semibold tracking-[-0.01em] ${urgent ? "text-warning" : "text-foreground"}`}>{value}</div>
      </div>
    </div>
  );
}

// DetailSection — one titled document block of the posting body
// (Brief Description · MQR · Duties & Responsibilities · Compensation ·
// Other Qualifications), led by the square icon chip.
export function DetailSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-6 border border-border bg-card p-5 sm:mt-8 sm:p-6">
      <h3 className="flex items-center gap-2.5 text-base font-semibold tracking-[-0.01em] text-foreground">
        <span className="grid size-8 shrink-0 place-items-center border border-border bg-secondary text-primary">{icon}</span> {title}
      </h3>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// ReqRow — one row of the Minimum Qualification Requirements ledger.
export function ReqRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 p-3.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground sm:w-44">{icon}<span className="kicker">{label}</span></div>
      <div className="flex-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
