"use client";

// =============================================================================
// RMIS — PDS Upload & Auto-Extraction (Accenture language)
// Mode-aware canvas · electric blue #1591DC block header (white ink both
// modes) · royal-gold only as kicker heritage. Sharp dashed dropzone
// (border-input → blue hover/drag), square icon blocks, flat progress, zero
// shadows, zero pill corners.
//
// ONE-EXTRACTION LOCK: once a document has been extracted & auto-applied
// (phase "done", or the parent reports `locked` because a previous extraction
// exists), the dropzone is GONE — the applicant cannot upload another PDS
// until they press "Clear Forms & Re-upload", which (after confirmation)
// wipes every profile field the extraction and their own typing produced
// (parent wires it to POST /api/applicant/profile/clear). The next upload
// then overwrites the forms from a clean slate — no stale manual edits
// surviving a partial extraction.
// =============================================================================

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/client";
import type { DocumentUploadResponse } from "@/lib/wire";
import { useNav } from "@/components/nav-provider";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  User,
  GraduationCap,
  Briefcase,
  BookOpen,
  ShieldCheck,
  Award as AwardIcon,
  ChevronRight,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

type ExtractedField = {
  value: string | number | boolean | null;
  confidence: "high" | "medium" | "low" | "none";
  source?: string;
};

type ExtractionResult = {
  personalInfo?: Record<string, ExtractedField>;
  educations?: Array<Record<string, ExtractedField>>;
  workExperiences?: Array<Record<string, ExtractedField>>;
  trainings?: Array<Record<string, ExtractedField>>;
  eligibilities?: Array<Record<string, ExtractedField>>;
  awards?: Array<Record<string, ExtractedField>>;
};

type AppliedSummary = {
  personal: number;
  education: number;
  work: number;
  training: number;
  eligibility: number;
  awards: number;
};

type ReplacedSummary = {
  education: number;
  work: number;
  training: number;
  eligibility: number;
  awards: number;
};

type Phase = "idle" | "uploading" | "extracting" | "applying" | "done" | "error";

const ACCEPTED_EXTS = ".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xlsx,.xls,.xlsm";

const PHASE_PROGRESS: Record<Exclude<Phase, "idle" | "done" | "error">, number> = {
  uploading: 30,
  extracting: 70,
  applying: 90,
};

const PHASE_LABEL: Record<Exclude<Phase, "idle" | "done" | "error">, string> = {
  uploading: "Uploading document…",
  extracting: "Extracting encoded information…",
  applying: "Populating profile fields…",
};

export function UploadPdsCard({
  onReview,
  onApplied,
  locked = false,
  onClearForms,
}: {
  onReview?: () => void;
  onApplied?: () => void;
  /**
   * True when a document has already been extracted & applied (survives
   * remounts — derived from the documents list server-side). Renders a locked
   * strip instead of the dropzone: no re-upload until the forms are cleared.
   */
  locked?: boolean;
  /**
   * Wipes ALL profile data (extracted + manually typed) via the parent.
   * Resolve `true` when cleared — the card then returns to the idle dropzone.
   * Resolve `false` (or throw) to keep the current state.
   */
  onClearForms?: () => Promise<boolean>;
} = {}) {
  const { navigate } = useNav();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [applied, setApplied] = useState<AppliedSummary | null>(null);
  const [replaced, setReplaced] = useState<ReplacedSummary | null>(null);
  const [dragging, setDragging] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function handleFile(file: File) {
    setFileName(file.name);
    setError("");
    setApplied(null);
    setPhase("uploading");

    try {
      // apiFetch skips Content-Type for FormData — browser sets the multipart boundary.
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "PDS");
      const doc = await apiFetch<DocumentUploadResponse>("/api/applicant/documents", {
        method: "POST",
        body: fd,
      });

      setPhase("extracting");
      const extractRes = await apiFetch<{
        results: Array<{ id: string; status: string; error?: string }>;
        merged: ExtractionResult;
      }>("/api/applicant/documents/extract", {
        method: "POST",
        body: JSON.stringify({ documentIds: [doc.id] }),
      });

      const okCount = extractRes.results.filter((r) =>
        ["EXTRACTED", "PARTIALLY_EXTRACTED"].includes(r.status)
      ).length;
      if (okCount === 0) {
        throw new Error(
          extractRes.results[0]?.error ||
            "No information could be extracted from this document. Try a clearer scan or a different file."
        );
      }

      setPhase("applying");
      const applyRes = await apiFetch<{
        applied: AppliedSummary;
        replaced?: ReplacedSummary;
        totalFilled: number;
        totalReplaced?: number;
        message?: string;
      }>("/api/applicant/profile/auto-apply", {
        method: "POST",
        body: JSON.stringify({ extraction: extractRes.merged }),
      });

      setApplied(applyRes.applied);
      setReplaced(applyRes.replaced ?? null);
      setPhase("done");
      toast.success(
        applyRes.message ||
          `${applyRes.totalFilled} field${applyRes.totalFilled === 1 ? "" : "s"} updated. Please review for accuracy.`
      );
      if (onApplied) onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setPhase("error");
      toast.error(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function reset() {
    setPhase("idle");
    setFileName("");
    setError("");
    setApplied(null);
    setReplaced(null);
  }

  async function handleClearForms() {
    if (!onClearForms) return;
    setClearing(true);
    try {
      const cleared = await onClearForms();
      if (cleared) {
        setClearOpen(false);
        reset();
        toast.success("All forms cleared. You can now upload a new document.");
      }
    } finally {
      setClearing(false);
    }
  }

  // The confirm-dialog action — shared by the locked strip and the done card.
  const clearFormsButton = (className: string) => (
    <Button
      onClick={() => setClearOpen(true)}
      variant="outline"
      disabled={clearing}
      className={className}
      aria-label="Clear all forms and allow re-uploading a document"
    >
      <RotateCcw className="size-4" strokeWidth={1.5} /> Clear Forms & Re-upload
    </Button>
  );

  const totalFilled = applied
    ? applied.personal + applied.education + applied.work +
      applied.training + applied.eligibility + applied.awards
    : 0;
  const totalReplaced = replaced
    ? replaced.education + replaced.work + replaced.training +
      replaced.eligibility + replaced.awards
    : 0;

  // Compact single-row shell, built for the profile's LEFT RAIL (~352px
  // column under the Sections nav): idle = one dashed drop strip (~64px);
  // every other phase swaps in a slim status card. All states stack vertically
  // — the rail is narrow in both desktop and mobile layouts. All logic
  // (upload → extract → auto-apply) is unchanged — only the chrome shrank.
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTS}
        className="hidden"
        onChange={onInputChange}
      />
      {phase === "idle" && locked ? (
        // ONE-EXTRACTION LOCK — a document was already extracted & applied
        // (state survives navigation). No dropzone until the forms are cleared.
        // Compact single-column layout on phones: icon inline with the copy,
        // action button tucked under it — the strip is informational, not a
        // hero, so it must not eat a phone screen.
        <div className="pui-card flex w-full gap-3 p-4 sm:items-center sm:gap-4">
          <span className="pui-tile grid size-10 shrink-0 place-items-center bg-success/10 text-success">
            <CheckCircle2 className="size-5" strokeWidth={1.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold tracking-[-0.01em] text-foreground">
              Profile populated from your document
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              To use a different document, clear all forms first — this erases
              every section so the new document can overwrite everything.
            </p>
            {clearFormsButton(
              "mt-2.5 w-full sm:w-auto shrink-0 border-destructive/40 text-danger-ink hover:bg-destructive/10 hover:text-danger-ink"
            )}
          </div>
        </div>
      ) : phase === "idle" ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          aria-label="Upload PDS, resume, or certificate for auto-extraction"
          className={`flex w-full items-center gap-3.5 rounded-xl border border-dashed p-4 text-left shadow-sm transition-all sm:gap-4 ${
            dragging
              ? "border-primary bg-primary/10 ring-2 ring-primary/25"
              : "border-primary/35 bg-secondary/40 hover:border-primary hover:bg-secondary/70 hover:shadow"
          }`}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-primary to-[#0E7ABF] text-white shadow-sm">
            <UploadCloud className="size-5" strokeWidth={1.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-sm font-bold tracking-[-0.01em] text-foreground">
              PDS Upload · AI Auto-Fill
              <Sparkles className="size-3.5 text-primary" />
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              Drop your PDS, resume, or certificates — AI fills your profile fields
              <span className="hidden sm:inline"> · PDF, DOC, XLS, images · max 10MB</span>
            </span>
          </span>
          <span className="hidden shrink-0 items-center gap-1.5 border border-border bg-card px-3 py-2 text-xs font-bold text-foreground sm:inline-flex">
            Select File <ChevronRight className="size-3.5 text-muted-foreground" />
          </span>
        </button>
      ) : (
        <div className="pui-card p-4 text-foreground sm:p-5">
          {(phase === "uploading" || phase === "extracting" || phase === "applying") && (
            <div>
              <div className="flex items-center gap-3">
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" strokeWidth={2} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{PHASE_LABEL[phase]}</p>
                  <p className="truncate text-xs text-muted-foreground">{fileName}</p>
                </div>
                <span className="kicker shrink-0 tabular-nums text-primary">{PHASE_PROGRESS[phase]}%</span>
              </div>
              <Progress value={PHASE_PROGRESS[phase]} className="mt-3 h-1.5 transition-all duration-500" />
              <div className="mt-2.5 flex items-center gap-2 text-[11px] font-semibold">
                {["Uploading", "Extracting", "Applying"].map((step, idx) => {
                  const stepNum = idx + 1;
                  const currentNum = phase === "uploading" ? 1 : phase === "extracting" ? 2 : 3;
                  const isDone = stepNum < currentNum;
                  const isActive = stepNum === currentNum;
                  return (
                    <div key={step} className="flex items-center gap-1.5">
                      <span className={`size-1.5 rounded-full ${isDone ? "bg-success" : isActive ? "bg-primary" : "bg-input"}`} />
                      <span className={isDone ? "text-foreground" : isActive ? "text-primary" : "text-muted-foreground"}>
                        {step}
                      </span>
                      {idx < 2 && <ChevronRight className="mx-0.5 size-3 text-muted-foreground/50" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {phase === "done" && applied && (
            <div>
              <div className="flex items-start gap-3">
                <span className="pui-tile grid size-9 shrink-0 place-items-center bg-success/10 text-success">
                  <CheckCircle2 className="size-4.5" strokeWidth={1.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold tracking-[-0.01em] text-foreground">Profile updated</p>
                  <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">
                    {totalFilled} field{totalFilled === 1 ? "" : "s"} updated from{" "}
                    <span className="font-semibold text-foreground">{fileName}</span>.
                    {totalReplaced > 0 && (
                      <>
                        {" "}
                        <span className="font-semibold text-warning-ink">
                          {totalReplaced} existing entr{totalReplaced === 1 ? "y was" : "ies were"} replaced
                        </span>{" "}
                        with the latest document data.
                      </>
                    )}
                    {" "}Please review each section below for accuracy. Uploading a
                    different document requires clearing the forms first.
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <SummaryChip icon={User} label="Personal Info" count={applied.personal} unit={applied.personal === 1 ? "field" : "fields"} />
                <SummaryChip icon={GraduationCap} label="Education" count={applied.education} unit={applied.education === 1 ? "entry" : "entries"} replacedCount={replaced?.education} />
                <SummaryChip icon={Briefcase} label="Work Experience" count={applied.work} unit={applied.work === 1 ? "entry" : "entries"} replacedCount={replaced?.work} />
                <SummaryChip icon={BookOpen} label="Training" count={applied.training} unit={applied.training === 1 ? "entry" : "entries"} replacedCount={replaced?.training} />
                <SummaryChip icon={ShieldCheck} label="Eligibility" count={applied.eligibility} unit={applied.eligibility === 1 ? "entry" : "entries"} replacedCount={replaced?.eligibility} />
                <SummaryChip icon={AwardIcon} label="Awards" count={applied.awards} unit={applied.awards === 1 ? "entry" : "entries"} replacedCount={replaced?.awards} />
              </div>

              <div className="mt-3 flex flex-col gap-2">
                <Button
                  onClick={() => (onReview ? onReview() : navigate("profile"))}
                  className="group w-full"
                >
                  {onReview ? "Review Sections" : "Review in Profile"}
                  <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Button>
                {clearFormsButton(
                  "border-destructive/40 text-danger-ink hover:bg-destructive/10 hover:text-danger-ink"
                )}
              </div>
            </div>
          )}

          {phase === "error" && (
            <div>
              <div className="flex items-start gap-3">
                <span className="pui-tile grid size-9 shrink-0 place-items-center bg-destructive/10 text-destructive">
                  <AlertCircle className="size-4.5" strokeWidth={1.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold tracking-[-0.01em] text-foreground">Processing failed</p>
                  <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">{error}</p>
                  {fileName && <p className="mt-1 break-words text-[11px] text-muted-foreground/80">File: {fileName}</p>}
                </div>
              </div>
              <Button onClick={reset} variant="outline" className="mt-3">
                <RotateCcw className="size-4" strokeWidth={1.5} /> Try Again
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Clear-forms confirmation — the ONLY gate back to the dropzone after
          a successful extraction. Explicit about what gets erased. */}
      <AlertDialog open={clearOpen} onOpenChange={(open) => { if (!clearing) setClearOpen(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader className="shrink-0">
            <AlertDialogTitle className="text-lg font-bold tracking-[-0.01em] text-foreground">
              Clear all forms and start over?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              This erases <span className="font-semibold text-foreground">ALL</span> of
              your profile information — everything extracted from{" "}
              {fileName ? (
                <span className="font-semibold text-foreground">{fileName}</span>
              ) : (
                "your document"
              )}{" "}
              and anything you typed manually — across every section: Personal
              Information, Education, Work Experience, Training, Eligibility,
              and Awards. Your profile will also be marked incomplete again.
              Uploaded files stay in Supporting Documents.
              <br />
              <br />
              After clearing, you can upload a different PDS or document and
              its extracted data will overwrite the forms from scratch.{" "}
              <span className="font-semibold text-warning-ink">
                This action cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="shrink-0">
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Radix auto-closes on Action click — prevent that so the
                // dialog stays up with the "Clearing…" spinner until the
                // wipe finishes (handleClearForms closes it on success).
                e.preventDefault();
                void handleClearForms();
              }}
              disabled={clearing}
              className="bg-destructive text-white hover:bg-[#B80525]"
            >
              {clearing ? (
                <><Loader2 className="size-4 animate-spin" /> Clearing…</>
              ) : (
                <><AlertTriangle className="size-4" strokeWidth={1.5} /> Yes, Clear Everything</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function SummaryChip({
  icon: Icon,
  label,
  count,
  unit,
  replacedCount,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  count: number;
  unit: string;
  replacedCount?: number;
}) {
  const has = count > 0;
  const replaced = replacedCount != null && replacedCount > 0;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border border-border/70 p-2.5 transition-colors ${
        has ? "bg-secondary/60" : "bg-secondary/30"
      }`}
    >
      <span className={`grid size-7 shrink-0 place-items-center rounded-md ${has ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
        <Icon className="size-3.5" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="kicker truncate text-muted-foreground">{label}</p>
        <p className={`text-xs font-bold leading-tight ${has ? "text-foreground" : "text-muted-foreground/60"}`}>
          {has ? `${count} ${unit}` : "—"}
        </p>
        {replaced && (
          <p className="text-[10px] font-semibold leading-tight text-warning-ink">{replacedCount} replaced</p>
        )}
      </div>
    </div>
  );
}
