"use client";

// =============================================================================
// RMIS — Applicant Profile View (premium scope)
// Modern enterprise surface for the applicant experience: soft rounded cards,
// layered elevation, an animated completion ring, a sliding segmented section
// navigator on mobile and a tinted rail on desktop. AI automation (document
// extraction + AI Profile Coach) is surfaced as first-class citizens.
//
// The `premium` class on the root opts this subtree into the modern geometry
// defined in globals.css — every other RMIS view keeps the Accenture-flat
// language. All data logic lives in use-profile-data; this file is chrome.
// =============================================================================

import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { formatDate, fullName } from "@/lib/client";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Info,
  Check,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileStack,
} from "lucide-react";
import { Eyebrow, WorkspaceTitle, Skeleton, ErrorState } from "@/components/primitives/workspace";

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
// CompletionRing — animated SVG progress ring (the hero's primary signal)
// -----------------------------------------------------------------------------
function CompletionRing({ percent, size = 76 }: { percent: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id="pui-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1591DC" />
            <stop offset="100%" stopColor="#0E7ABF" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted-foreground/15"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#pui-ring-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div
        className="absolute inset-0 grid place-items-center"
        aria-hidden
      >
        <span className="text-base font-extrabold tabular-nums tracking-[-0.02em] text-foreground sm:text-lg">
          {percent}
          <span className="text-[10px] font-bold text-muted-foreground">%</span>
        </span>
      </div>
      <span className="sr-only" role="status">{`Profile ${percent} percent complete`}</span>
    </div>
  );
}

// -----------------------------------------------------------------------------
// DesktopStepper (lg+) — a single-row numbered step bar in the reference's
// wizard grammar: circle indicators (filled check = completed, primary ring =
// current, numbered dot = upcoming) locked to their labels, joined by
// flexing connectors (solid primary through completed steps, dashed into the
// current one, muted hairline ahead). Unfinished steps carry their
// "(Approx X Min)" estimate under the label on a fixed-height text block —
// every cell shares one baseline, so the connectors stay perfectly centered.
// -----------------------------------------------------------------------------

// Compact step labels — the reference keeps step names short ("Preliminary",
// "Your Details"); full names live in aria-labels.
const STEP_LABELS: Record<SectionId, string> = {
  personal: "Personal",
  education: "Education",
  work: "Work",
  training: "Training",
  eligibility: "Eligibility",
  awards: "Awards",
  documents: "Documents",
};

function DesktopStepper({
  active,
  checks,
  onSelect,
}: {
  active: SectionId;
  checks: Record<SectionId, boolean>;
  onSelect: (id: SectionId) => void;
}) {
  return (
    <nav aria-label="Profile sections" className="mt-6 hidden lg:block">
      <ol className="flex items-center">
        {SECTIONS.map((s, i) => {
          const isActive = active === s.id;
          const done = checks[s.id];
          // Connector BEFORE this step reflects progress up to its RIGHT
          // endpoint (this step): solid primary once completed, dashed while
          // it is the current one, muted hairline for everything still ahead.
          const lineTone = done
            ? "border-primary"
            : isActive
              ? "border-dashed border-primary/70"
              : "border-border";
          return (
            <li key={s.id} className="flex min-w-0 items-center">
              {i > 0 && (
                <span
                  aria-hidden
                  className={`mx-2 h-0 min-w-2 flex-1 border-t-2 xl:mx-3 ${lineTone}`}
                />
              )}
              <button
                type="button"
                onClick={() => onSelect(s.id)}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Section ${i + 1}: ${s.label}`}
                className="group flex shrink-0 items-center gap-2 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                {/* Circle indicator — the step number lives INSIDE the circle
                    (check once completed), so each step is one tight lockup. */}
                <span
                  aria-hidden
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-extrabold tabular-nums transition-colors ${
                    done
                      ? "bg-primary text-primary-foreground"
                      : isActive
                        ? "border-2 border-primary bg-background text-primary"
                        : "border border-border bg-muted/60 text-muted-foreground"
                  }`}
                >
                  {done ? (
                    <Check className="size-3" strokeWidth={3.5} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                {/* Fixed-height text block — keeps every cell the same height
                    whether or not the estimate line is shown, so the flex
                    connectors stay centered on the circle row. */}
                <span className="flex h-8 flex-col justify-center">
                  <span
                    className={`text-[13px] font-semibold leading-tight transition-colors ${
                      isActive || done ? "text-foreground" : "text-muted-foreground"
                    } group-hover:text-primary`}
                  >
                    {STEP_LABELS[s.id]}
                  </span>
                  {!done && (
                    <span className="hidden text-[10px] font-medium leading-tight text-muted-foreground/75 xl:block">
                      Approx {s.minutes} Min
                    </span>
                  )}
                </span>
              </button>
            </li>
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
  // this: the rail is sticky beside the content, no jump needed.
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
        <div className="relative z-10 mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
          <div className="border-b border-border pb-5 sm:pb-8">
            <Eyebrow>Profile</Eyebrow>
            <div className="mt-2 sm:mt-3">
              <WorkspaceTitle title="My Profile" />
            </div>
          </div>
          <>
            <Skeleton className="mt-6 h-40 w-full rounded-2xl" />
            <Skeleton className="mt-6 h-9 w-full rounded-lg" />
            <Skeleton className="mt-5 h-96 w-full rounded-2xl" />
          </>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="premium min-h-screen bg-background text-foreground">
        <div className="relative z-10 mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
          <div className="border-b border-border pb-5 sm:pb-8">
            <Eyebrow>Profile</Eyebrow>
            <div className="mt-2 sm:mt-3">
              <WorkspaceTitle title="My Profile" />
            </div>
          </div>
          <div className="pui-card mt-8">
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

  return (
    <div className="premium relative min-h-screen bg-background text-foreground">
      {/* Ambient brand wash — a faint primary gradient bleeds from the top of
          the canvas, lifting the card layer off the flat background. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ backgroundImage: "var(--pui-canvas)" }}
      />

      <div className="relative z-10 mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        {/* Header — kicker → display title. Phones skip it entirely: the
            workspace shell already reads "Profile" at the top of the screen,
            so the in-page title is redundant chrome. ≥ sm it returns for the
            editorial hero grammar. */}
        <header className="hidden border-b border-border pb-5 sm:block sm:pb-8">
          <Eyebrow>Profile</Eyebrow>
          <div className="mt-2 sm:mt-3">
            <WorkspaceTitle
              title="My Profile"
              description="AI-assisted application system — upload a document, let it fill your forms, review, save."
              descriptionClassName="hidden sm:block"
            />
          </div>
        </header>

        {/* Identity + completion hero — first surface on phones. Desktop (lg+)
            composes two zones: identity + requirement note on the left, the
            completion lockup in a divider-separated panel on the right; the
            PDS auto-fill strip stays docked along the card's bottom edge. */}
        <div className="pui-card mt-0 p-4 sm:mt-6 sm:p-5 lg:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            {/* Zone A — identity: avatar, name, status chips, documents, and
                the requirement note (guidance amber, never error red). */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-4">
                <ProfileAvatar
                  photoUrl={photoUrl}
                  initials={initials}
                  name={applicantName || "Applicant"}
                  onPhotoChanged={() => void loadAll(true)}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-bold tracking-[-0.015em] text-foreground sm:text-lg">
                      {applicantName}
                    </h2>
                    {profile.isProfileComplete ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="size-3" /> Complete
                      </Badge>
                    ) : (
                      // Amber, not red: "incomplete" is a work-in-progress
                      // state, not an error — red is reserved for failures.
                      <Badge variant="warning" className="gap-1">
                        <AlertCircle className="size-3" /> Incomplete
                      </Badge>
                    )}
                    {pdsLocked && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-primary/30 bg-primary/10 text-[11px] text-info-ink"
                      >
                        <Sparkles className="size-3" /> AI-assisted
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {profile.submittedDate && (
                      <span>Submitted {formatDate(profile.submittedDate)}</span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <FileStack className="size-3.5" />
                      {documents.length} document{documents.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Requirements hint — calm amber advisory (guidance, not an
                  error: red is reserved for real failures). Lives inside the
                  identity zone as a footnote to the name, not a standalone
                  banner row. */}
              {!canMarkComplete && !profile.isProfileComplete && (
                <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-warning/25 bg-warning/10 px-3.5 py-2.5">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-warning" strokeWidth={1.5} />
                  <span className="text-xs leading-relaxed text-warning-ink">
                    Profile completion requires your Personal Information (first name,
                    last name, and email) and at least one entry each in Education and
                    Work Experience.
                  </span>
                </div>
              )}
            </div>

            {/* Zone B — completion lockup: ring + position readout, with the
                primary action beside it. A hairline divider separates it from
                the identity zone on desktop. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 lg:shrink-0 lg:border-l lg:border-border/70 lg:pl-6">
              <div className="flex items-center gap-3.5">
                <CompletionRing percent={completion.percent} />
                <div>
                  <p className="text-sm font-bold tabular-nums tracking-[-0.01em] text-foreground">
                    {completion.filled} of {completion.total} sections
                  </p>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {profile.isProfileComplete
                      ? "All sections complete"
                      : `${completion.total - completion.filled} to go`}
                  </p>
                </div>
              </div>
              {!profile.isProfileComplete && canMarkComplete && (
                <Button
                  onClick={() => setCompleteOpen(true)}
                  disabled={markingComplete}
                  className="shrink-0"
                >
                  <ShieldCheck className="size-4" strokeWidth={1.5} />
                  Mark Complete
                </Button>
              )}
            </div>
          </div>

          {/* PDS auto-fill — docked at the bottom of the identity card so the
              stepper → form-card rhythm below stays exactly like the reference
              (no standalone banner card between them). */}
          <div className="mt-4 border-t border-border/70 pt-3.5 sm:mt-5 sm:pt-4">
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
        </div>

        {/* DESKTOP STEPPER (lg+) — the reference layout base: a horizontal
            numbered step bar spanning the canvas above the form card; the
            section card below takes the full content width. */}
        <DesktopStepper
          active={activeSection}
          checks={completion.checks}
          onSelect={setActiveSection}
        />

        {/* Desktop owns navigation via the horizontal stepper above; this
            grid is a single full-width column. On phones the step strip is
            its own grid child so it can STICK under the workspace header —
            navigation stays reachable anywhere in the wizard — with the
            upload strip and content flowing below. */}
        <div ref={sectionsRef} className="mt-4 grid scroll-mt-24 grid-cols-[minmax(0,1fr)] gap-4 sm:mt-6 sm:gap-6">
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
                      className={`text-[10px] font-extrabold leading-none tabular-nums ${
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
              <p aria-live="polite" className="min-w-0 flex-1 truncate py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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

          {/* RIGHT CONTENT — section cards swap with a quiet fade/rise
              (180ms): perceptible placement without choreography. */}
          <div className="min-w-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 10 }}
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
              <AlertDialogTitle className="text-lg font-bold tracking-[-0.01em] text-foreground">
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