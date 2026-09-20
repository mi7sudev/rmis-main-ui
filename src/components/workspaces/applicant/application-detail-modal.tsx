"use client";

// ============================================================================
// RMIS — Application Detail Modal (applicant home · Accenture language)
// ============================================================================
// Opens when the applicant clicks a card in the "02. Your Applications ·
// In Progress" rail. Presents the COMPLETE posting they applied to — the
// EXACT register of the 02 board's full job detail page (hero → summary
// grid → dates → Brief Description / MQR / Duties & Responsibilities /
// Compensation Package / Other Qualifications) — closed by the application
// footer: the "Successfully Applied" strip and the same destructive
// "Cancel Application" action (+ confirm) the posting page offers.
//
// Cancelling calls DELETE /api/applications/[id], which removes the record
// while it is still in the initial "Applied" state; the server answers with
// guidance when the application has already progressed. On success the
// parent silently refetches — the rail card disappears and the Applied
// badge on the Open Positions pane clears.
// ============================================================================

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertCircle,
  Award,
  BadgeCheck,
  Banknote,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  Loader2,
  MapPin,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch, formatCurrency, formatDate } from "@/lib/client";
import { divisionLabel } from "@/lib/divisions";
import { humanizeTitle } from "@/lib/humanize";
import { currentStageLabel } from "@/lib/status";
import { StatusIndicator } from "@/components/primitives/workspace";
import {
  DateCell,
  DetailSection,
  ReqRow,
  SummaryCell,
} from "@/components/primitives/job-detail-bits";
import { SafeHtml } from "@/components/common/safe-html";
import { type Application as WireApplication } from "@/lib/wire";

export function ApplicationDetailModal({
  app,
  open,
  onOpenChange,
  onCancelled,
}: {
  /** The application whose card was clicked; null when the modal is closed. */
  app: WireApplication | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful cancel — the parent closes + refetches. */
  onCancelled: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // A closed modal never keeps a stale confirm dialog around.
  useEffect(() => {
    if (!open) setConfirmOpen(false);
  }, [open]);

  async function doCancel() {
    if (!app) return;
    setCancelling(true);
    try {
      await apiFetch(`/api/applications/${app.id}`, { method: "DELETE" });
      toast.success("Application cancelled successfully.");
      onCancelled();
    } catch (e) {
      // Includes the server's guidance when the application has already
      // progressed past "Applied" ("contact HR to withdraw").
      toast.error(e instanceof Error ? e.message : "Failed to cancel application.");
    } finally {
      setCancelling(false);
    }
  }

  const job = app?.job ?? null;
  const pos = job?.position ?? null;
  const title = pos?.positionTitle || job?.title || "Position Title Unavailable";
  const place = pos?.placeOfAssignment?.name ?? null;
  const stageLabel = currentStageLabel(app?.status ?? null);
  const deadline = job?.deadlineDate ?? null;
  const deadlineSoon = !!deadline && new Date(deadline).getTime() < Date.now() + 7 * 86400000;

  // The applications wire keeps the RAW richtext columns (the *Html aliases
  // are a jobs-route enrichment that /api/applications does not add). Alias
  // them here with the EXACT mapping /api/jobs applies, so this modal's
  // content matches the board's posting page byte for byte.
  const briefHtml = job?.briefDescriptionRichtext ?? null;
  const dutiesHtml = job?.dutiesResponsibilities ?? null;
  const compHtml = job?.compensationPackageRichtext ?? null;
  const otherHtml = job?.otherQualificationsRichtext ?? null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 bg-background p-0 sm:max-w-[980px] lg:max-w-[1080px]">
          {app && (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* ===== Hero — gold kicker + status chip, title, brand rule,
                     the board detail hero's meta row ===== */}
              <div className="shrink-0 border-b border-border px-5 pb-6 pr-14 pt-6 sm:px-8 sm:pt-8">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <p className="kicker kicker-gold">Position Details</p>
                  <StatusIndicator status={stageLabel} size="sm" />
                </div>
                <DialogTitle className="mt-2 text-2xl font-medium leading-tight tracking-[-0.02em] text-foreground sm:text-3xl">
                  {humanizeTitle(title)}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Complete details of the position you applied for, with the option to cancel your application.
                </DialogDescription>
                <div aria-hidden className="mt-4 h-0.5 w-16 bg-primary" />
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-muted-foreground">
                  {place && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-4" strokeWidth={1.5} /> {place}
                    </span>
                  )}
                  {pos?.division && (
                    <span className="flex items-center gap-1.5">
                      <Building2 className="size-4" strokeWidth={1.5} /> {divisionLabel(pos.division)}
                    </span>
                  )}
                  {job?.positionType && (
                    <span className="rounded-full border border-input px-2.5 py-0.5 text-foreground">{job.positionType}</span>
                  )}
                </div>
              </div>

              {/* ===== Body — the posting document, board detail register ===== */}
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
                {!job ? (
                  /* Defensive fallback: the linked posting record is gone. */
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-6">
                    <AlertCircle className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Posting details unavailable</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        The record for this posting is no longer available. Your application and its status are
                        unaffected — the Human Resource Office can assist with any questions.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Summary grid — the board's four vital cells */}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <SummaryCell icon={<FileText className="size-4" strokeWidth={1.5} />} label="Item No." value={pos?.itemNumber || "—"} />
                      <SummaryCell icon={<Users className="size-4" strokeWidth={1.5} />} label="Vacancies" value={job.numberOfVacancy != null ? String(job.numberOfVacancy) : "—"} />
                      <SummaryCell
                        icon={<Banknote className="size-4" strokeWidth={1.5} />}
                        label="Salary Grade"
                        value={pos?.salaryGrade ? `SG ${pos.salaryGrade}${pos.positionSalaryStep ? `/${pos.positionSalaryStep}` : ""}` : "—"}
                      />
                      <SummaryCell
                        icon={<Banknote className="size-4" strokeWidth={1.5} />}
                        label="Monthly Salary"
                        value={pos?.salaryAmount ? formatCurrency(pos.salaryAmount) : "—"}
                      />
                    </div>

                    {/* Dates */}
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <DateCell icon={<Calendar className="size-4" strokeWidth={1.5} />} label="Published" value={formatDate(job.publishDate)} />
                      <DateCell icon={<Clock className="size-4" strokeWidth={1.5} />} label="Deadline" value={formatDate(job.deadlineDate)} urgent={deadlineSoon} />
                      <DateCell icon={<Calendar className="size-4" strokeWidth={1.5} />} label="Processing" value={formatDate(job.processingDate)} />
                    </div>

                    {/* Brief description — sanitized richtext first, plain
                        column fallback, exactly like the board detail page */}
                    {briefHtml ? (
                      <DetailSection title="Brief Description" icon={<FileText className="size-4" strokeWidth={1.5} />}>
                        <SafeHtml html={briefHtml} className="max-w-none overflow-x-auto text-foreground/90" />
                      </DetailSection>
                    ) : job.briefDescription ? (
                      <DetailSection title="Brief Description" icon={<FileText className="size-4" strokeWidth={1.5} />}>
                        <p className="text-sm font-medium text-foreground/90">{job.briefDescription}</p>
                      </DetailSection>
                    ) : null}

                    {/* Minimum Qualification Requirements ledger */}
                    {pos && (pos.cscEducation || pos.cscWorkExperience || pos.cscTrainingRequirements || pos.cscEligibilityGroup || pos.specialSkill) && (
                      <DetailSection title="Minimum Qualification Requirements" icon={<GraduationCap className="size-4" strokeWidth={1.5} />}>
                        <dl className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
                          {pos.cscEducation && <ReqRow icon={<GraduationCap className="size-4" strokeWidth={1.5} />} label="Education" value={pos.cscEducation} />}
                          {pos.cscWorkExperience && <ReqRow icon={<Briefcase className="size-4" strokeWidth={1.5} />} label="Work Experience" value={pos.cscWorkExperience} />}
                          {pos.cscTrainingRequirements && <ReqRow icon={<Award className="size-4" strokeWidth={1.5} />} label="Training" value={pos.cscTrainingRequirements} />}
                          {pos.cscEligibilityGroup && pos.cscEligibilityGroup !== "N/A" && <ReqRow icon={<CheckCircle2 className="size-4" strokeWidth={1.5} />} label="Eligibility" value={pos.cscEligibilityGroup} />}
                          {pos.specialSkill && <ReqRow icon={<BadgeCheck className="size-4" strokeWidth={1.5} />} label="License / Certification" value={pos.specialSkill} />}
                        </dl>
                      </DetailSection>
                    )}

                    {dutiesHtml && (
                      <DetailSection title="Duties & Responsibilities" icon={<FileText className="size-4" strokeWidth={1.5} />}>
                        <SafeHtml html={dutiesHtml} className="max-w-none overflow-x-auto text-foreground/90" />
                      </DetailSection>
                    )}

                    {compHtml && (
                      <DetailSection title="Compensation Package" icon={<Banknote className="size-4" strokeWidth={1.5} />}>
                        <SafeHtml html={compHtml} className="max-w-none overflow-x-auto text-foreground/90" />
                      </DetailSection>
                    )}

                    {otherHtml && (
                      <DetailSection title="Other Qualifications" icon={<CheckCircle2 className="size-4" strokeWidth={1.5} />}>
                        <SafeHtml html={otherHtml} className="max-w-none overflow-x-auto text-foreground/90" />
                      </DetailSection>
                    )}
                  </>
                )}
              </div>

              {/* ===== Footer — applied strip + the cancel action ===== */}
              <div className="shrink-0 border-t border-border px-5 py-4 sm:px-8">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-2.5">
                    <CheckCircle2 className="size-5 shrink-0 text-success" strokeWidth={1.5} />
                    <div>
                      <p className="text-sm font-semibold text-success">Successfully Applied</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Applied {formatDate(app.dateApplied)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setConfirmOpen(true)}
                    disabled={cancelling}
                    className="group flex h-11 shrink-0 items-center gap-2 rounded-lg border border-input px-5 text-sm font-semibold text-foreground transition-colors hover:border-destructive/60 hover:bg-destructive/5 hover:text-danger-ink disabled:opacity-50"
                  >
                    <Trash2 className="size-4" strokeWidth={1.5} />
                    Cancel Application
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== Cancel Confirmation — the board's exact destructive confirm ===== */}
      <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!o && !cancelling) setConfirmOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader className="shrink-0">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-destructive/40 bg-destructive/10 text-danger-ink">
                <AlertCircle className="size-5" strokeWidth={1.5} />
              </div>
              <div className="min-w-0 flex-1">
                <AlertDialogTitle className="text-lg font-semibold tracking-[-0.01em] text-foreground">Cancel Application?</AlertDialogTitle>
                <AlertDialogDescription className="mt-1 leading-relaxed">
                  This action <strong className="text-danger-ink">cannot be undone</strong>. You will need to re-apply if you change your mind.
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          {app && (
            <div className="space-y-1.5 rounded-xl border border-border bg-secondary px-4 py-3">
              <div className="flex items-center gap-2">
                <Briefcase className="size-4 shrink-0 text-foreground" strokeWidth={1.5} />
                <p className="truncate text-sm font-semibold text-foreground">{title}</p>
              </div>
              {pos?.itemNumber && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="kicker">Item</span>
                  <span>{pos.itemNumber}</span>
                </div>
              )}
            </div>
          )}
          <AlertDialogFooter className="shrink-0">
            <AlertDialogCancel disabled={cancelling}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmOpen(false); void doCancel(); }}
              disabled={cancelling}
              className="bg-destructive text-[#e9ebdf] hover:bg-destructive/85"
            >
              {cancelling && <Loader2 className="size-4 animate-spin" />}
              {cancelling ? "Cancelling…" : "Yes, Cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
