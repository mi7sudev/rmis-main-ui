"use client";

// =============================================================================
// RMIS — Applicant Profile View (enterprise workspace scope)
// Restrained enterprise HR surface: cool-gray canvas, pure-white surfaces,
// neutral hairlines, one cohesive workspace. Hierarchy comes from typography,
// spacing, and alignment — not decoration. Blue #1591DC is rationed to
// progress, CTA, focus, and active navigation.
//
// Page layers (top → bottom):
//   A. Profile header   — employee record (identity + completion indicator)
//   B. Completion note  — quiet informational banner (never an alert)
//   C. Import workspace — PDS upload / AI auto-fill horizontal strip
//   D. Section nav      — premium numbered workflow (sticky on desktop)
//   E. Section header   — title + subtitle + Save CTA
//   F. Form content     — one clean surface per section
//
// The `premium` class on the root opts this subtree into the enterprise
// geometry + token sheet defined in globals.css (light mode). All data logic
// lives in use-profile-data; this file is chrome.
// =============================================================================

import { Fragment, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
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
import { fullName } from "@/lib/client";
import {
  CheckCircle2,
  Clock,
  Loader2,
  ShieldCheck,
  Info,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileStack,
} from "lucide-react";
import { Eyebrow, Skeleton, ErrorState } from "@/components/primitives/workspace";

import { SECTIONS, type SectionId } from "./profile/types";
import { useProfileData } from "./profile/use-profile-data";
import { ProfileAvatar } from "./profile/profile-avatar";
import { PersonalInfoSection } from "./profile/personal-info-section";
import { EducationSection } from "./profile/education-section";
import { WorkExperienceSection } from "./profile/work-experience-section";
import { TrainingSection } from "./profile/training-section";
import { EligibilitySection } from "./profile/eligibility-section";
import { AwardsSection } from "./profile/awards-section";
import { DocumentsSection } from "./profile/documents-section";
import { UploadPdsCard } from "./upload-pds-card";

// Mirrors the extract route's EXTRACTABLE_CATEGORIES — categories whose
// extraction populates profile forms (everything else is a storage-only
// attachment and never locks the uploader).
const EXTRACTABLE_DOC_CATEGORIES: ReadonlySet<string> = new Set([
  "PDS",
  "RESUME",
  "EDUCATION",
  "WORK_EXPERIENCE",
  "TRAINING",
  "ELIGIBILITY",
  "AWARD",
  "ACCOMPLISHMENT",
]);

// -----------------------------------------------------------------------------
// CompletionRing — compact radial indicator (the record header's only graph).
// Flat primary stroke on a hairline track; the percentage sits centered.
// -----------------------------------------------------------------------------
function CompletionRing({ percent, size = 72 }: { percent: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-border"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-primary"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center" aria-hidden>
        <span className="text-[17px] font-semibold tabular-nums tracking-[-0.01em] text-foreground">
          {percent}
          <span className="text-[11px] font-medium text-muted-foreground">%</span>
        </span>
      </div>
      <span className="sr-only" role="status">{`Profile ${percent} percent complete`}</span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SectionNav (lg+) — premium horizontal workflow. Compact numbered circles
// (check once completed, primary circle = current, hairline circle = ahead)
// joined by hairline connectors that stretch to fill the row; each step
// carries a two-line label (name + "Approx N Min" estimate — Documents is
// open-ended, so it carries none). The band is sticky under the workspace
// header so navigation is reachable anywhere in a long form.
// -----------------------------------------------------------------------------

// Compact step labels; full names live in aria-labels.
const STEP_LABELS: Record<SectionId, string> = {
  personal: "Personal",
  education: "Education",
  work: "Work",
  training: "Training",
  eligibility: "Eligibility",
  awards: "Awards",
  documents: "Documents",
};

function SectionNav({
  active,
  checks,
  onSelect,
}: {
  active: SectionId;
  checks: Record<SectionId, boolean>;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <nav
      aria-label="Profile sections"
      className="sticky top-16 z-20 -mx-4 mt-6 hidden border-b border-border/70 bg-background/90 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:block lg:-mx-8 lg:px-8"
    >
      <ol className="flex items-center">
        {SECTIONS.map((s, i) => {
          const isActive = active === s.id;
          const done = checks[s.id];
          const reached = done || isActive;
          const approx = s.id === "documents" ? null : `Approx ${s.minutes} Min`;
          return (
            <Fragment key={s.id}>
              {i > 0 && (
                <li aria-hidden className="h-px min-w-3 flex-1 bg-border xl:min-w-4" />
              )}
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Section ${i + 1}: ${s.label}`}
                  className="group flex items-center gap-2.5 rounded-[10px] py-1 pl-0.5 pr-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span
                    aria-hidden
                    className={`grid size-8 shrink-0 place-items-center rounded-full border text-[12px] font-semibold tabular-nums transition-colors duration-200 ${
                      reached
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground group-hover:border-primary/40 group-hover:text-foreground"
                    }`}
                  >
                    {done ? (
                      <Check className="size-3.5" strokeWidth={3} />
                    ) : (
                      String(i + 1).padStart(2, "0")
                    )}
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span
                      className={`whitespace-nowrap text-[13.5px] font-semibold transition-colors ${
                        reached
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      {STEP_LABELS[s.id]}
                    </span>
                    {approx && (
                      <span className="mt-0.5 whitespace-nowrap text-[11px] leading-none text-muted-foreground">
                        {approx}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

export function ProfileView() {
  const { user, refresh: refreshSession } = useSession();
  const data = useProfileData();
  const sectionsRef = useRef<HTMLDivElement>(null);
  const {
    loading, error, profile, loadAll, activeSection, setActiveSection,
    reference, personalForm, personalDirty,
    savingPersonal, updatePersonalField, savePersonal, autosaveStatus,
    educations, workExperiences, trainings, eligibilities, awards,
    educationHandlers, workHandlers, trainingHandlers, eligibilityHandlers,
    awardsHandlers, documentsHandlers, documents,
    completeOpen, setCompleteOpen, markingComplete, handleMarkComplete,
    completion, canMarkComplete,
  } = data;

  void user;

  // Mobile stepper: switch section AND bring the rail back into view —
  // tapping "04" while stranded deep inside section 01's long form must not
  // leave the viewport mid-scroll in the old section. Desktop (lg+) skips
  // this: the nav is sticky above the content, no jump needed.
  function handleMobileSectionChange(id: SectionId) {
    if (id === activeSection) return;
    setActiveSection(id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      requestAnimationFrame(() => {
        sectionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  // Index of the active section — drives the mobile caption + prev/next.
  const activeIdx = Math.max(0, SECTIONS.findIndex((s) => s.id === activeSection));

  // ── ONE-EXTRACTION LOCK ──
  // A document with a live extraction result (EXTRACTED / PARTIALLY_EXTRACTED
  // in an extractable category) means the auto-apply already wrote into the
  // forms. The upload strip stays locked until "Clear Forms & Re-upload"
  // wipes the profile (POST /api/applicant/profile/clear resets these doc
  // statuses to UPLOADED — which is exactly what unlocks the strip again).
  const pdsLocked = documents.some(
    (d) =>
      EXTRACTABLE_DOC_CATEGORIES.has(d.category) &&
      (d.status === "EXTRACTED" || d.status === "PARTIALLY_EXTRACTED")
  );

  // Confirmation-gated in the UploadPdsCard's AlertDialog — this only runs on
  // "Yes, Clear Everything". Wipes ALL profile data (extracted + manually
  // typed) so the next upload overwrites from scratch; returns true when the
  // wipe succeeded so the card can flip back to the idle dropzone.
  async function handleClearForms(): Promise<boolean> {
    try {
      await apiFetch("/api/applicant/profile/clear", { method: "POST" });
      // Silent reload — sections now show empty; document statuses dropped
      // back to UPLOADED so `pdsLocked` recomputes to false (dropzone back).
      await loadAll(true);
      // isProfileComplete flipped false server-side — re-sync the session so
      // the home banner / apply gate reflect it immediately.
      await refreshSession();
      return true;
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to clear the forms. Please try again."
      );
      return false;
    }
  }

  if (loading) {
    return (
      <div className="premium min-h-screen bg-background text-foreground">
        <div className="relative z-10 mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <header className="pb-6">
            <Eyebrow>Profile</Eyebrow>
            <div className="mt-1.5 h-7 w-40 animate-pulse rounded-md bg-muted" />
          </header>
          <Skeleton className="h-[104px] w-full rounded-xl" />
          <Skeleton className="mt-3 h-12 w-full rounded-[10px]" />
          <Skeleton className="mt-3 h-20 w-full rounded-xl" />
          <Skeleton className="mt-5 h-11 w-full rounded-lg" />
          <Skeleton className="mt-4 h-96 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="premium min-h-screen bg-background text-foreground">
        <div className="relative z-10 mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <header className="pb-6">
            <Eyebrow>Profile</Eyebrow>
            <h1 className="mt-1 text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-foreground">
              My Profile
            </h1>
          </header>
          <div className="pui-card mt-2">
            <ErrorState message={error || "Profile not found"} onRetry={loadAll} />
          </div>
        </div>
      </div>
    );
  }

  const applicantName = fullName({
    firstName: profile.firstName,
    middleName: profile.middleName,
    lastName: profile.lastName,
    extensionName: profile.extensionName,
  });

  // Initials for the avatar block ("Maria C. Santos" → "MS").
  const initials = (applicantName || "?")
    .split(/\s+/)
    .filter((w) => w && w !== "Jr." && w !== "Sr." && w !== "III")
    .map((w) => w.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Profile photo — latest PROFILE_PICTURE document (PDS-extracted 1×1 or a
  // manual upload; documents arrive newest-first). Clicking the avatar lets
  // the applicant replace it manually.
  const photoDoc = documents.find((d) => d.category === "PROFILE_PICTURE");
  const photoUrl = photoDoc ? `/api/files/${photoDoc.filePath}` : null;

  // Compact enterprise status pill — quiet neutral for "Incomplete" (a
  // work-in-progress state, not an error); success tint only when complete.
  const statusBadge = profile.isProfileComplete ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-medium leading-none text-success-ink">
      <CheckCircle2 className="size-3" strokeWidth={2} />
      Complete
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-medium leading-none text-muted-foreground">
      <Clock className="size-3" strokeWidth={2} />
      Incomplete
    </span>
  );

  return (
    <div className="premium min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* ── A–C. Employee record — ONE cohesive card: identity + completion
                indicator, the quiet completion note, and the PDS import
                workspace. Flat enterprise surfaces, no floating card stack. ── */}
        <section aria-label="Profile record" className="pui-card p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            {/* Identity — avatar + name/status/documents. The completion ring
                is pinned to the RIGHT of this row on phones (shrink-0, and
                the name column is min-w-0 + truncate, so a long applicant
                name only ever ellipsizes — it can never push the circle out
                of view); on lg the ring lives in the right-hand lockup. */}
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <ProfileAvatar
                photoUrl={photoUrl}
                initials={initials}
                name={applicantName || "Applicant"}
                onPhotoChanged={() => void loadAll(true)}
              />
              <div className="min-w-0 flex-1">
                <h2
                  className="truncate text-[20px] font-semibold tracking-[-0.02em] text-foreground sm:text-[22px]"
                  title={applicantName}
                >
                  {applicantName}
                </h2>
                {/* Status BELOW the name — never squeezed beside it. */}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                  {statusBadge}
                  {pdsLocked && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/[0.07] px-2 py-1 text-[11px] font-medium leading-none text-primary">
                      <Sparkles className="size-2.5" /> AI-assisted
                    </span>
                  )}
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <FileStack className="size-3.5" strokeWidth={1.5} />
                  {documents.length} document{documents.length === 1 ? "" : "s"}
                </p>
              </div>
              {/* Phones: compact ring at the right edge of the identity row.
                  lg hides it — the lockup below-right owns the ring there. */}
              <div className="shrink-0 lg:hidden" title={`Profile ${completion.percent}% complete`}>
                <CompletionRing percent={completion.percent} size={64} />
              </div>
            </div>

            {/* Completion lockup — lg: ring + readout + finalize CTA on the
                right (hairline-separated). Phones: the ring is already in
                the identity row, so this row carries the readout + CTA only
                under a hairline. Exactly one ring is visible per viewport
                (display:none instances also drop out of the a11y tree, so
                the sr-only percent status never announces twice). */}
            <div className="flex items-center justify-between gap-4 border-t border-border pt-4 lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <div className="flex items-center gap-4">
                <div className="hidden lg:block">
                  <CompletionRing percent={completion.percent} />
                </div>
                <div>
                  <p className="text-[14px] font-semibold leading-tight text-foreground">
                    {completion.filled} of {completion.total} sections
                  </p>
                  <p className="mt-0.5 text-[13px] leading-tight text-muted-foreground">
                    {profile.isProfileComplete ? "All sections complete" : "to go"}
                  </p>
                </div>
              </div>
              {!profile.isProfileComplete && canMarkComplete && (
                <Button onClick={() => setCompleteOpen(true)} disabled={markingComplete} size="sm" className="shrink-0">
                  <ShieldCheck className="size-4" strokeWidth={1.5} />
                  Mark Complete
                </Button>
              )}
            </div>
          </div>

          {/* ── B. Completion note — quiet informational banner (never an alert).
                  Blue wash + hairline + small filled icon; concise copy. ── */}
          {!canMarkComplete && !profile.isProfileComplete && (
            <div className="mt-5 flex items-start gap-3 rounded-[10px] border border-primary/15 bg-primary/[0.06] px-4 py-3">
              <span
                aria-hidden
                className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full bg-primary"
              >
                <Info className="size-2.5 text-primary-foreground" strokeWidth={3} />
              </span>
              <p className="text-[13.5px] leading-relaxed text-foreground/85">
                Profile completion requires your Personal Information (first
                name, last name, and email) and at least one entry each in
                Education and Work Experiences.
              </p>
            </div>
          )}

          {/* ── C. Import workspace — PDS Upload · AI Auto-Fill ── */}
          <div className="mt-4 sm:mt-5">
            <UploadPdsCard
              locked={pdsLocked}
              onClearForms={handleClearForms}
              onApplied={() => loadAll(true)}
              onReview={() => {
                setActiveSection("personal");
                requestAnimationFrame(() => {
                  sectionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
            />
          </div>
        </section>

        {/* ── D. Section navigation (lg+) — sticky premium workflow band ── */}
        <SectionNav
          active={activeSection}
          checks={completion.checks}
          onSelect={setActiveSection}
        />

        {/* Desktop owns navigation via the sticky band above; this grid is a
            single full-width column. On phones the step strip is its own grid
            child so it can STICK under the workspace header — navigation stays
            reachable anywhere in the wizard. */}
        <div ref={sectionsRef} className="mt-4 grid scroll-mt-32 grid-cols-[minmax(0,1fr)] gap-4 sm:gap-5 lg:mt-5">
          {/* MOBILE (< lg) — sticky segmented strip + caption + prev/next.
              A direct grid child so its sticky containing block is the full
              grid: the whole card pins below the workspace header while the
              forms scroll beneath it. The active cell is a sliding pill
              (motion layoutId) — one saturated element, no double borders. */}
          <nav
            aria-label="Profile sections"
            className="pui-card sticky top-16 z-30 p-1.5 lg:hidden"
          >
            <div className="grid grid-cols-7 gap-1">
              {SECTIONS.map((s, i) => {
                const isActive = activeSection === s.id;
                const filled = completion.checks[s.id];
                return (
                  <button
                    key={s.id}
                    onClick={() => handleMobileSectionChange(s.id)}
                    aria-label={`Section ${i + 1}: ${s.label}`}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative isolate flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 transition-colors ${
                      isActive
                        ? "text-primary-foreground"
                        : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    {/* Sliding pill — rendered INSIDE the active cell so
                        inset-0 matches the cell bounds; layoutId slides it
                        between cells on section change. (Rendered once at
                        grid level, inset-0 would cover the entire strip.) */}
                    {isActive && (
                      <motion.span
                        aria-hidden
                        layoutId="pui-mobile-seg"
                        className="absolute inset-0 -z-10 rounded-lg bg-primary"
                        transition={{ type: "spring", stiffness: 500, damping: 42 }}
                      />
                    )}
                    <span
                      className={`text-[10px] font-semibold leading-none tabular-nums ${
                        isActive ? "text-primary-foreground/85" : "text-muted-foreground"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {filled ? (
                      <CheckCircle2
                        className={`size-3.5 shrink-0 ${isActive ? "text-primary-foreground" : "text-success"}`}
                        strokeWidth={2}
                      />
                    ) : (
                      <span
                        aria-hidden
                        className={`size-1.5 shrink-0 rounded-full ${
                          isActive ? "bg-primary-foreground/60" : "bg-muted-foreground/35"
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            {/* Caption + sequential stepping — hairline footer bar with ghost
                chevrons and an aria-live position readout. */}
            <div className="mt-1.5 flex items-stretch border-t border-border/60">
              <button
                type="button"
                onClick={() => activeIdx > 0 && handleMobileSectionChange(SECTIONS[activeIdx - 1].id)}
                disabled={activeIdx === 0}
                aria-label="Previous section"
                className="grid w-12 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
              >
                <ChevronLeft className="size-4" strokeWidth={1.5} />
              </button>
              <p aria-live="polite" className="min-w-0 flex-1 truncate py-2.5 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {`Section ${activeIdx + 1} of ${SECTIONS.length} · ${SECTIONS[activeIdx]?.label ?? ""}`}
              </p>
              <button
                type="button"
                onClick={() => activeIdx < SECTIONS.length - 1 && handleMobileSectionChange(SECTIONS[activeIdx + 1].id)}
                disabled={activeIdx === SECTIONS.length - 1}
                aria-label="Next section"
                className="grid w-12 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
              >
                <ChevronRight className="size-4" strokeWidth={1.5} />
              </button>
            </div>
          </nav>

          {/* SECTION CONTENT — cards swap with a quiet fade/rise (180ms):
              perceptible placement without choreography. */}
          <div className="min-w-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                {activeSection === "personal" && (
                  <PersonalInfoSection
                    form={personalForm}
                    dirty={personalDirty}
                    saving={savingPersonal}
                    autosave={autosaveStatus}
                    onChange={updatePersonalField}
                    onSave={savePersonal}
                  />
                )}
                {activeSection === "education" && (
                  <EducationSection items={educations} {...educationHandlers} />
                )}
                {activeSection === "work" && (
                  <WorkExperienceSection items={workExperiences} {...workHandlers} />
                )}
                {activeSection === "training" && (
                  <TrainingSection items={trainings} {...trainingHandlers} />
                )}
                {activeSection === "eligibility" && (
                  <EligibilitySection items={eligibilities} reference={reference} {...eligibilityHandlers} />
                )}
                {activeSection === "awards" && (
                  <AwardsSection items={awards} {...awardsHandlers} />
                )}
                {activeSection === "documents" && (
                  <DocumentsSection documents={documents} {...documentsHandlers} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Mark Profile Complete Confirmation */}
        <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
          <AlertDialogContent className="premium">
            <AlertDialogHeader className="shrink-0">
              <AlertDialogTitle className="text-lg font-semibold tracking-[-0.01em] text-foreground">
                Mark Profile as Complete?
              </AlertDialogTitle>
              <AlertDialogDescription className="leading-relaxed">
                This will finalize your profile and allow you to apply for job
                postings. You can still edit your profile afterward, but the
                system will treat it as &quot;ready for application.&quot;
                <br /><br />
                Please ensure all information is accurate. Submitted profiles are
                subject to verification by the HR office.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="shrink-0">
              <AlertDialogCancel disabled={markingComplete}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleMarkComplete}
                disabled={markingComplete}
              >
                {markingComplete ? (
                  <><Loader2 className="size-4 animate-spin" /> Submitting…</>
                ) : (
                  <><ShieldCheck className="size-4" /> Yes, Mark Complete</>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
