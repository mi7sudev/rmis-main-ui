"use client";

// =============================================================================
// RMIS — Fast-Track Apply with PDS (Apply-Without-Friction, Government-Gated)
// Accenture language: mode-aware popover · electric-blue header block · sharp
// corners · no shadows. Square step rail: blue = active · green = done ·
// hollow = ahead.
// ==============================================================================
// For applicants whose profile is incomplete: instead of blocking them
// ("complete your profile first"), we let them upload their PDS (CS Form 212)
// RIGHT FROM THE JOB POSTING and:
//
//   1. Upload the PDS document          → POST /api/applicant/documents
//   2. AI-extract every section          → POST /api/applicant/documents/extract
//      (page-aware: overflow trainings/awards on continuation pages/sheets
//       are recovered and routed to the correct form fields)
//   3. Auto-fill the profile             → POST /api/applicant/profile/auto-apply
//   4. REVIEW + CERTIFICATION (interactive step — the applicant inspects the
//      auto-filled data and certifies its accuracy, per civil service rules)
//   5. Qualification screen (MQR)        → POST /api/jobs/verify-mqr
//      (same Minimum Qualification Requirements gate as the normal apply
//       flow — without it the fast-track could bypass the position's
//       education/eligibility/experience/training requirements)
//   6. Mark the profile complete         → POST /api/applicant/profile/complete
//      (server validates the government completion rule — never trusted from
//       the client)
//   7. Submit the application            → POST /api/jobs/apply
//      (server re-enforces BOTH gates: profile completeness + MQR)
//
// GOVERNMENT RULE: browsing jobs is open to everyone, but applying requires a
// COMPLETE profile. If the extraction did not produce enough data (e.g. no
// education or work experience), step 5/6 are withheld and the applicant is
// routed to their Profile to finish the missing items — the system never lets
// an incomplete profile apply.
// =============================================================================

import { useRef, useState } from "react";
import { apiFetch } from "@/lib/client";
import type { DocumentUploadResponse } from "@/lib/wire";
import { useNav } from "@/components/nav-provider";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  UploadCloud,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  User,
  GraduationCap,
  Briefcase,
  BookOpen,
  ShieldCheck,
  Award as AwardIcon,
  ArrowRight,
  ChevronRight,
  RotateCcw,
  Zap,
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

type CompletionRequirement = {
  id: "personal" | "education" | "work";
  label: string;
  met: boolean;
};

type ProfileCompletionInfo = {
  complete: boolean;
  requirements: CompletionRequirement[];
  missingLabels: string[];
};

export type FastTrackJob = {
  id: number | string;
  title?: string | null;
  position?: { positionTitle?: string | null; itemNumber?: string | null } | null;
};

type Phase =
  | "idle"
  | "uploading"
  | "extracting"
  | "applying"
  | "review"
  | "completing"
  | "submitting"
  | "done"
  | "error";

const PROCESSING_PHASES: Array<
  Exclude<Phase, "idle" | "review" | "done" | "error">
> = ["uploading", "extracting", "applying", "completing", "submitting"];

const PHASE_PROGRESS: Record<
  Exclude<Phase, "idle" | "review" | "done" | "error">,
  number
> = {
  uploading: 12,
  extracting: 45,
  applying: 70,
  completing: 85,
  submitting: 95,
};

const PHASE_LABEL: Record<
  Exclude<Phase, "idle" | "review" | "done" | "error">,
  string
> = {
  uploading: "Uploading PDS...",
  extracting: "Reading every page — extracting all sections...",
  applying: "Auto-filling your profile fields...",
  completing: "Finalizing profile...",
  submitting: "Submitting your application...",
};

const STEP_SHORT = ["Upload", "Extract", "Auto-Fill", "Review", "Submit"];

const ACCEPTED_EXTS = ".pdf,.doc,.docx,.xlsx,.xls,.xlsm";

// MQR dimension keys (from /api/jobs/verify-mqr) → human labels.
const MQR_LABELS: Record<string, string> = {
  education: "Education",
  eligibility: "Eligibility",
  workExperience: "Work Experience",
  training: "Training",
};

export function FastTrackApplyDialog({
  job,
  open,
  onOpenChange,
  onApplied,
}: {
  job: FastTrackJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: (job: FastTrackJob) => void;
}) {
  const { navigate } = useNav();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [applied, setApplied] = useState<AppliedSummary | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [completion, setCompletion] = useState<ProfileCompletionInfo | null>(
    null
  );
  const [certified, setCertified] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mqrBlocked, setMqrBlocked] = useState<{
    jobTitle: string;
    results: Record<string, string>;
  } | null>(null);

  const jobTitle = job?.position?.positionTitle || job?.title || "this position";

  function reset() {
    setPhase("idle");
    setFileName("");
    setError("");
    setApplied(null);
    setWarnings([]);
    setCompletion(null);
    setCertified(false);
    setMqrBlocked(null);
  }

  function closeDialog() {
    if (isProcessing()) return;
    onOpenChange(false);
    // Leave the completed state visible if the user re-opens; reset otherwise.
    if (phase === "error") reset();
  }

  function isProcessing(): boolean {
    return PROCESSING_PHASES.includes(
      phase as Exclude<Phase, "idle" | "review" | "done" | "error">
    );
  }

  // Fallback when the auto-apply response did not carry the completion
  // status: compute the same government rule from the live profile.
  async function fetchCompletionFallback(): Promise<ProfileCompletionInfo | null> {
    try {
      const p = await apiFetch<{
        firstName: string | null;
        lastName: string | null;
        emailAddress: string | null;
        educations: unknown[];
        workExperiences: unknown[];
      }>("/api/applicant/profile");
      const requirements: CompletionRequirement[] = [
        {
          id: "personal",
          label: "Personal information (first name, last name, email)",
          met: Boolean(
            p.firstName?.trim() && p.lastName?.trim() && p.emailAddress?.trim()
          ),
        },
        {
          id: "education",
          label: "At least one education entry",
          met: p.educations.length > 0,
        },
        {
          id: "work",
          label: "At least one work experience entry",
          met: p.workExperiences.length > 0,
        },
      ];
      return {
        complete: requirements.every((r) => r.met),
        requirements,
        missingLabels: requirements.filter((r) => !r.met).map((r) => r.label),
      };
    } catch {
      return null;
    }
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setError("");
    setApplied(null);
    setWarnings([]);
    setCompletion(null);
    setCertified(false);

    try {
      // ── 1. Upload (multipart — apiFetch skips Content-Type for FormData) ──
      setPhase("uploading");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "PDS");
      const doc = await apiFetch<DocumentUploadResponse>("/api/applicant/documents", {
        method: "POST",
        body: fd,
      });

      // ── 2. Extract (multi-page aware) ──
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
            "No information could be extracted from this document. Try the digital (Excel/PDF) PDS file instead of a photo."
        );
      }

      // ── 3. Auto-fill profile ──
      setPhase("applying");
      const applyRes = await apiFetch<{
        applied: AppliedSummary;
        profileCompletion?: ProfileCompletionInfo | null;
        message?: string;
      }>("/api/applicant/profile/auto-apply", {
        method: "POST",
        body: JSON.stringify({ extraction: extractRes.merged }),
      });
      setApplied(applyRes.applied);

      // ── 4. STOP for review — the applicant must inspect and certify the
      // auto-filled data before anything is finalized or submitted. ──
      const completionInfo =
        applyRes.profileCompletion ?? (await fetchCompletionFallback());
      setCompletion(completionInfo);
      setCertified(false);
      setPhase("review");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      setError(message);
      setPhase("error");
      toast.error(message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Runs after the applicant reviewed and certified the auto-filled data.
  async function confirmAndSubmit() {
    try {
      if (!job) throw new Error("No position selected.");

      // ── 5a. Qualification screen (MQR) — same rule the normal apply flow
      // enforces (jobs-view pre-checks verify-mqr before submitting). The
      // check is read-only and evaluates the freshly auto-filled profile
      // saved in step 3, so it runs BEFORE anything is finalized.
      setPhase("completing");
      const mqr = await apiFetch<{
        mqrResults: Record<string, string>;
        allMet: boolean;
      }>("/api/jobs/verify-mqr", {
        method: "POST",
        body: JSON.stringify({ jobId: job.id }),
      });
      if (!mqr.allMet) {
        setMqrBlocked({ jobTitle, results: mqr.mqrResults });
        setPhase("error");
        toast.error(
          "You don't yet meet the Minimum Qualification Requirements for this position."
        );
        return;
      }

      // ── 5b. Mark profile complete (server validates the government rule) ──
      await apiFetch("/api/applicant/profile/complete", { method: "POST" });

      // ── 6. Submit the application ──
      setPhase("submitting");
      await apiFetch("/api/jobs/apply", {
        method: "POST",
        body: JSON.stringify({ jobId: job.id }),
      });

      setPhase("done");
      toast.success("Application submitted! Review your auto-filled profile anytime.");
      if (onApplied && job) onApplied(job);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      setError(message);
      setPhase("error");
      toast.error(message);
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

  const totalFilled = applied
    ? applied.personal + applied.education + applied.work +
      applied.training + applied.eligibility + applied.awards
    : 0;

  const stepNum = phase === "uploading" ? 1
    : phase === "extracting" ? 2
    : phase === "applying" ? 3
    : phase === "review" ? 4
    : phase === "completing" ? 5
    : phase === "submitting" ? 5
    : 6;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); }}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="space-y-0 gap-0 bg-primary px-5 py-5 text-left sm:px-6">
          <DialogTitle className="flex items-center gap-3 text-base font-bold tracking-[-0.01em] text-white">
            <span className="grid size-10 shrink-0 place-items-center rounded-none bg-white/10 text-white">
              <Zap className="size-5" strokeWidth={1.5} />
            </span>
            <span className="min-w-0">
              Fast-Track Apply · PDS Auto-Fill
            </span>
          </DialogTitle>
          <DialogDescription className="mt-1.5 pl-[52px] text-[11px] font-medium leading-relaxed text-white/80 sm:text-xs">
            Apply to <strong className="font-semibold text-white">{jobTitle}</strong> by uploading your PDS
            (CS Form 212). We read every page — including your extra trainings &amp; awards —
            auto-fill your profile, and <strong className="text-white">you review and certify</strong>{" "}
            the details before submitting.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto p-4 sm:p-6">
          {phase === "idle" && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer rounded-none border border-dashed border-input bg-secondary/50 p-6 text-center transition-colors ${
                  dragging
                    ? "border-primary bg-primary/10"
                    : "hover:border-primary hover:bg-secondary/70"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTS}
                  className="hidden"
                  onChange={onInputChange}
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="grid size-14 place-items-center rounded-none bg-primary/10 text-primary">
                    <UploadCloud className="size-6" strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    Upload your PDS to apply
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Digital file recommended: XLSX or text-based PDF (CS Form 212) — max 10MB
                  </p>
                </div>
              </div>
              <p className="mt-4 flex items-start gap-2 text-[11px] font-medium leading-relaxed text-muted-foreground">
                <FileText className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
                Multi-page PDS with continuation sheets/pages? Covered — every overflow
                training, award, and eligibility is extracted and placed in the right
                section. You will review everything before your application is submitted.
              </p>
              <p className="mt-2 flex items-start gap-2 text-[11px] font-medium leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
                Government recruitment rule: your profile must be complete before you can
                apply. If your PDS is missing required details, we will show you exactly
                what to finish in your Profile.
              </p>
            </>
          )}

          {isProcessing() && (
            <div className="py-6">
              <div className="mb-4 flex items-center gap-3">
                <Loader2 className="size-5 animate-spin text-primary" strokeWidth={2} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {PHASE_LABEL[phase as Exclude<Phase, "idle" | "review" | "done" | "error">]}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{fileName}</p>
                </div>
                <FileText className="size-5 shrink-0 text-muted-foreground/40" strokeWidth={1.5} />
              </div>
              <Progress
                value={PHASE_PROGRESS[phase as Exclude<Phase, "idle" | "review" | "done" | "error">]}
                className="h-2 transition-all duration-500"
              />
              {/* Square step rail — done = green · active = blue · hollow = ahead */}
              <div className="mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-2">
                {STEP_SHORT.map((step, idx) => {
                  const n = idx + 1;
                  const isDone = n < stepNum;
                  const isActive = n === stepNum;
                  return (
                    <span key={step} className="flex items-center gap-1.5">
                      <span
                        className={`grid size-5 place-items-center rounded-none text-[10px] font-medium tabular-nums tracking-[-0.02em] ${
                          isDone
                            ? "bg-success text-success-foreground"
                            : isActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-muted-foreground"
                        }`}
                        aria-current={isActive ? "step" : undefined}
                      >
                        {isDone ? <CheckCircle2 className="size-3" strokeWidth={2.5} /> : n}
                      </span>
                      <span className={`text-[11px] font-semibold ${isDone || isActive ? "text-foreground" : "text-muted-foreground"}`}>
                        {step}
                      </span>
                      {idx < STEP_SHORT.length - 1 && (
                        <ChevronRight className="size-3 text-muted-foreground/50" aria-hidden />
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {phase === "review" && (
            <div className="py-1">
              <div className="mb-4 flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-none bg-primary/10 text-primary">
                  <ShieldCheck className="size-5" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold tracking-[-0.01em] text-foreground">
                    Review Your Auto-Filled Profile
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {applied && totalFilled > 0
                      ? `${totalFilled} field${totalFilled === 1 ? "" : "s"} auto-filled from ${fileName || "your PDS"}.`
                      : "Extraction finished."}{" "}
                    Check the details below before your application is submitted.
                  </p>
                </div>
              </div>

              {applied && (
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <SummaryChip icon={User} label="Personal Info" count={applied.personal} />
                  <SummaryChip icon={GraduationCap} label="Education" count={applied.education} />
                  <SummaryChip icon={Briefcase} label="Work Experience" count={applied.work} />
                  <SummaryChip icon={BookOpen} label="Training" count={applied.training} />
                  <SummaryChip icon={ShieldCheck} label="Eligibility" count={applied.eligibility} />
                  <SummaryChip icon={AwardIcon} label="Awards" count={applied.awards} />
                </div>
              )}

              {/* Government completion checklist */}
              {completion ? (
                <div className="mb-4 overflow-hidden rounded-none border border-border">
                  <div className="border-b border-border bg-secondary/60 px-4 py-2.5">
                    <p className="kicker text-muted-foreground">
                      Completion Requirements
                    </p>
                  </div>
                  <ul className="px-4 py-3">
                    {completion.requirements.map((r) => (
                      <li key={r.id} className="flex items-start gap-2.5 py-1.5">
                        {r.met ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2} />
                        ) : (
                          <XCircle className="mt-0.5 size-4 shrink-0 text-danger-ink" strokeWidth={2} />
                        )}
                        <span className={`text-xs font-medium leading-relaxed ${r.met ? "text-foreground" : "text-muted-foreground"}`}>
                          {r.label}
                          {!r.met && <span className="font-semibold text-danger-ink"> — still required</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="mb-4 rounded-none border border-border bg-secondary/60 px-4 py-3 text-xs font-medium leading-relaxed text-muted-foreground">
                  Requirements could not be checked automatically — the system will
                  verify them server-side when you submit.
                </div>
              )}

              {completion && !completion.complete ? (
                <>
                  {/* Gate closed — profile not finished yet */}
                  <div className="mb-4 flex items-start gap-3 rounded-none border border-destructive/40 bg-destructive/10 px-4 py-3">
                    <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger-ink" strokeWidth={2} />
                    <p className="text-xs font-medium leading-relaxed text-danger-ink">
                      <strong className="font-bold text-foreground">Profile incomplete.</strong>{" "}
                      Under government recruitment rules, you must finish your profile
                      before you can apply for any position. Go to your Profile to add
                      the missing sections — your auto-filled data is already saved.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      onClick={() => { onOpenChange(false); navigate("profile"); }}
                      className="group flex-1"
                    >
                      Go to Profile
                      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </Button>
                    <Button
                      onClick={reset}
                      variant="outline"
                    >
                      <RotateCcw className="size-4" strokeWidth={1.5} /> Upload Another Document
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Gate open — certify and submit */}
                  <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-none border border-border bg-secondary/60 px-4 py-3.5 transition-colors hover:bg-secondary">
                    <input
                      type="checkbox"
                      checked={certified}
                      onChange={(e) => setCertified(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      aria-describedby="fasttrack-certification"
                    />
                    <span id="fasttrack-certification" className="text-[11px] font-medium leading-relaxed text-muted-foreground">
                      <strong className="font-bold text-foreground">
                        Certification.
                      </strong>{" "}
                      I hereby certify that all information in my profile — including data
                      auto-extracted from my PDS (CS Form 212) — is true, correct, and
                      complete to the best of my knowledge. I understand that any
                      misrepresentation shall be grounds for disqualification from this
                      hiring process or nullification of appointment, pursuant to
                      applicable civil service rules.
                    </span>
                  </label>
                  <Button
                    onClick={confirmAndSubmit}
                    disabled={!certified}
                    size="lg"
                    className="group w-full"
                  >
                    Certify &amp; Submit Application
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                  </Button>
                  <Button
                    onClick={reset}
                    variant="outline"
                    className="mt-2 w-full"
                  >
                    <RotateCcw className="size-4" strokeWidth={1.5} /> Upload a Different Document
                  </Button>
                </>
              )}
            </div>
          )}

          {phase === "done" && (
            <div className="py-2">
              <div className="mb-5 flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-none bg-success/10 text-success">
                  <CheckCircle2 className="size-5" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold tracking-[-0.01em] text-foreground">
                    Application Submitted
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {totalFilled > 0
                      ? `${totalFilled} field${totalFilled === 1 ? "" : "s"} auto-filled from your PDS and your profile was marked complete.`
                      : "Your profile was completed and your application was submitted."}{" "}
                    Review and correct your details in <strong className="text-foreground">Profile</strong> anytime — your entry
                    remains fully editable.
                  </p>
                </div>
              </div>

              {applied && (
                <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <SummaryChip icon={User} label="Personal Info" count={applied.personal} />
                  <SummaryChip icon={GraduationCap} label="Education" count={applied.education} />
                  <SummaryChip icon={Briefcase} label="Work Experience" count={applied.work} />
                  <SummaryChip icon={BookOpen} label="Training" count={applied.training} />
                  <SummaryChip icon={ShieldCheck} label="Eligibility" count={applied.eligibility} />
                  <SummaryChip icon={AwardIcon} label="Awards" count={applied.awards} />
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => { onOpenChange(false); navigate("home"); }}
                  className="group flex-1"
                >
                  View My Applications
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Button>
                <Button
                  onClick={() => { onOpenChange(false); navigate("profile"); }}
                  variant="outline"
                >
                  Review Profile
                </Button>
              </div>
            </div>
          )}

          {phase === "error" && mqrBlocked && (
            <div className="py-6">
              <div className="mb-4 flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-none bg-destructive/10 text-danger-ink">
                  <ShieldCheck className="size-5" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold tracking-[-0.01em] text-foreground">
                    Qualification Requirements Not Met
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Your application to <strong className="text-foreground">{mqrBlocked.jobTitle}</strong> was not
                    submitted — you don&apos;t yet meet the Minimum Qualification Requirements
                    below. Your auto-filled profile data is already saved: add the missing
                    qualifications in your Profile, then apply again.
                  </p>
                </div>
              </div>

              <div className="mb-4 overflow-hidden rounded-none border border-border">
                <div className="border-b border-border bg-secondary/60 px-4 py-2.5">
                  <p className="kicker text-muted-foreground">
                    Minimum Qualification Requirements
                  </p>
                </div>
                <ul className="px-4 py-3">
                  {Object.entries(mqrBlocked.results).map(([key, value]) => (
                    <li key={key} className="flex items-start gap-2.5 py-1.5">
                      {value.startsWith("Meets") ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2} />
                      ) : (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-danger-ink" strokeWidth={2} />
                      )}
                      <span className="text-xs font-medium leading-relaxed text-foreground">
                        <span className="font-bold">{MQR_LABELS[key] ?? key}</span>: {value}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={() => { onOpenChange(false); navigate("profile"); }}
                  className="group flex-1"
                >
                  Go to Profile
                  <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Button>
                <Button
                  onClick={closeDialog}
                  variant="outline"
                >
                  Close
                </Button>
              </div>
            </div>
          )}

          {phase === "error" && !mqrBlocked && (
            <div className="py-6">
              <div className="mb-4 flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-none bg-destructive/10 text-danger-ink">
                  <AlertCircle className="size-5" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold tracking-[-0.01em] text-foreground">
                    Fast-Track Paused
                  </h3>
                  <p className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">{error}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground/80">
                    Your data was NOT lost — anything already extracted is saved. You can
                    retry, or complete your profile manually.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  onClick={reset}
                  className="flex-1"
                >
                  <RotateCcw className="size-4" strokeWidth={1.5} /> Try Again
                </Button>
                <Button
                  onClick={() => { onOpenChange(false); navigate("profile"); }}
                  variant="outline"
                >
                  Fill Profile Manually
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryChip({
  icon: Icon,
  label,
  count,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  count: number;
}) {
  const has = count > 0;
  return (
    <div
      className={`flex items-center gap-2.5 rounded-none border border-border p-3 transition-colors ${
        has ? "bg-secondary/60" : "bg-secondary/30"
      }`}
    >
      <div className={`grid size-8 shrink-0 place-items-center rounded-none ${has ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
        <Icon className="size-3.5" strokeWidth={1.5} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="kicker text-muted-foreground">{label}</p>
        <p className={`text-sm font-extrabold leading-tight tabular-nums ${has ? "text-foreground" : "text-muted-foreground/60"}`}>
          {has ? count : "—"}
        </p>
      </div>
    </div>
  );
}
