"use client";

// =============================================================================
// RMIS — Applicant Profile View (Accenture language)
// Mode-aware canvas (light :root / dark .dark token sheets) · electric blue
// #1591DC · royal-gold kickers only.
// WorkspaceTitle header + flat sharp cards, square avatar block, section nav
// rail with solid primary active block. 7-section profile wizard with AI
// document intelligence.
// =============================================================================

import { useRef } from "react";
import { useSession } from "@/components/session-provider";
import { apiFetch } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  CircleDot,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Reveal } from "@/components/ui/motion/reveal";

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
import { Eyebrow, WorkspaceTitle, Skeleton, ErrorState } from "@/components/primitives/workspace";

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
      <div className="min-h-screen bg-background text-foreground">
        <div className="relative z-10 mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
          <div className="border-b border-border pb-5 sm:pb-8">
            <Eyebrow>Profile</Eyebrow>
            <div className="mt-2 sm:mt-3">
              <WorkspaceTitle title="My Profile" />
            </div>
          </div>
          <Reveal y={12} delay={0.1}>
            <Skeleton className="mt-6 h-24 w-full" />
            <Skeleton className="mt-3 h-16 w-full" />
            <div className="mt-6 grid gap-4 lg:grid-cols-[260px_1fr]">
              <Skeleton className="h-72" />
              <Skeleton className="h-96" />
            </div>
          </Reveal>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="relative z-10 mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
          <div className="border-b border-border pb-5 sm:pb-8">
            <Eyebrow>Profile</Eyebrow>
            <div className="mt-2 sm:mt-3">
              <WorkspaceTitle title="My Profile" />
            </div>
          </div>
          <Reveal y={20}>
            <div className="mt-8 border border-border bg-card">
              <ErrorState message={error || "Profile not found"} onRetry={loadAll} />
            </div>
          </Reveal>
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

  // Initials for the square avatar block ("Maria C. Santos" → "MS").
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
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative z-10 mx-auto max-w-[1400px] 2xl:max-w-[1680px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        {/* Header — kicker → display title. Phones skip it entirely: the
            workspace shell already reads "Profile" at the top of the screen,
            so the in-page title is 150px of redundant chrome before the
            identity card. ≥ sm it returns for the editorial hero grammar. */}
        <header className="hidden border-b border-border pb-5 sm:block sm:pb-8">
          <Eyebrow>Profile</Eyebrow>
          <div className="mt-2 sm:mt-3">
            <WorkspaceTitle
              title="My Profile"
              description="Document-assisted application system — upload, extract, review, save."
              descriptionClassName="hidden sm:block"
            />
          </div>
        </header>

        {/* Identity + completion — first surface on phones, single compact
            card (section fill state lives in the sticky step grid below). */}
        <Reveal y={20}>
          <div className="overflow-hidden rounded-none border border-border bg-card sm:mt-6">
            <div className="px-4 py-3.5 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex min-w-0 items-center gap-3.5">
                  <ProfileAvatar
                    photoUrl={photoUrl}
                    initials={initials}
                    name={applicantName || "Applicant"}
                    onPhotoChanged={() => void loadAll(true)}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-bold tracking-[-0.01em] text-foreground sm:text-lg">{applicantName}</h2>
                      {profile.isProfileComplete ? (
                        <Badge variant="success"><CheckCircle2 className="size-3" /> Complete</Badge>
                      ) : (
                        <Badge variant="destructive"><AlertCircle className="size-3" /> Incomplete</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {completion.filled} of {completion.total} sections have data
                      {profile.submittedDate ? ` · Submitted ${formatDate(profile.submittedDate)}` : ""}
                    </p>
                  </div>
                </div>
                {/* Actionable-only button: a permanently-disabled "Mark
                    Complete" is dead chrome that eats a full-width row on
                    phones. It appears once requirements are met; until then
                    the requirement strip below explains what is missing. */}
                {!profile.isProfileComplete && canMarkComplete && (
                  <Button
                    onClick={() => setCompleteOpen(true)}
                    disabled={markingComplete}
                    className="shrink-0"
                  >
                    <ShieldCheck className="size-4" strokeWidth={1.5} /> Mark Complete
                  </Button>
                )}
              </div>
              <div className="mt-3 flex items-center gap-3 sm:mt-4">
                <span className="kicker hidden shrink-0 text-muted-foreground sm:inline">Completion</span>
                <Progress
                  value={completion.percent}
                  className="h-1.5 flex-1"
                />
                <span className="text-sm font-extrabold tabular-nums text-foreground">
                  {completion.percent}%
                </span>
              </div>
            </div>

            {/* Requirements hint */}
            {!canMarkComplete && !profile.isProfileComplete && (
              <div className="flex items-start gap-2.5 border-t border-border bg-destructive/10 px-4 py-2.5 sm:px-6">
                <Info className="mt-0.5 size-3.5 shrink-0 text-danger-ink" strokeWidth={1.5} />
                <span className="text-xs leading-relaxed text-danger-ink">
                  To unlock Mark Complete: fill in Personal Information (first name, last name, email) and add at least one Education and one Work Experience entry.
                </span>
              </div>
            )}
          </div>
        </Reveal>

        {/* Two-column layout: sections nav + PDS upload rail + right content
            cards.
            On desktop: the rail is sticky with its own scroll container so it
            stays in view while the right content scrolls.
            On mobile: the step grid is its own grid child so it can STICK
            under the workspace header — navigation stays reachable anywhere
            in the wizard — with the upload strip and content flowing below. */}
        <Reveal y={20}>
          <div ref={sectionsRef} className="mt-4 grid scroll-mt-20 grid-cols-[minmax(0,1fr)] gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[352px_minmax(0,1fr)]">
            {/* MOBILE (< lg) — sticky 7-cell step grid + caption + prev/next.
                A direct grid child so its sticky containing block is the full
                grid: the whole card pins below the workspace header while the
                forms scroll beneath it. Cells carry 01–07 + fill state; the
                caption row adds one-tap sequential stepping. */}
            <nav
              aria-label="Profile sections"
              className="sticky top-16 z-30 rounded-none border border-border bg-card p-2 lg:hidden"
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
                      className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-none border px-0.5 transition-colors ${
                        isActive
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:bg-secondary"
                      }`}
                    >
                      <span className={`text-[11px] font-extrabold leading-none tabular-nums ${isActive ? "text-white/80" : "text-muted-foreground"}`}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      {filled ? (
                        <CheckCircle2
                          className={`size-3.5 shrink-0 ${isActive ? "text-white" : "text-success"}`}
                          strokeWidth={2}
                        />
                      ) : (
                        <span
                          aria-hidden
                          className={`size-1.5 shrink-0 rounded-full ${isActive ? "bg-white/50" : "bg-muted-foreground/40"}`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Caption + sequential stepping — the cells only carry numbers,
                  so spell out where you are (also aids screen readers) and
                  flank it with prev/next for linear wizard flow. */}
              <div className="flex items-center gap-1 px-0.5 pt-1.5">
                <button
                  type="button"
                  onClick={() => activeIdx > 0 && handleMobileSectionChange(SECTIONS[activeIdx - 1].id)}
                  disabled={activeIdx === 0}
                  aria-label="Previous section"
                  className="grid size-8 shrink-0 place-items-center rounded-none border border-border text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" strokeWidth={1.5} />
                </button>
                <p aria-live="polite" className="kicker min-w-0 flex-1 truncate text-center text-muted-foreground">
                  {`Section ${activeIdx + 1} of ${SECTIONS.length} · ${SECTIONS[activeIdx]?.label ?? ""}`}
                </p>
                <button
                  type="button"
                  onClick={() => activeIdx < SECTIONS.length - 1 && handleMobileSectionChange(SECTIONS[activeIdx + 1].id)}
                  disabled={activeIdx === SECTIONS.length - 1}
                  aria-label="Next section"
                  className="grid size-8 shrink-0 place-items-center rounded-none border border-border text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                >
                  <ChevronRight className="size-4" strokeWidth={1.5} />
                </button>
              </div>
            </nav>

            {/* LEFT RAIL — desktop vertical nav + PDS upload strip. Sticks on
                desktop as one unit (internal scroll when tall). On phones only
                the upload strip remains here; the step grid is the sticky nav
                above. */}
            <div className="h-fit min-w-0 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-80px)] lg:overflow-y-auto">
              {/* DESKTOP (lg+) — full vertical nav rail (unchanged) */}
              <nav
                aria-label="Profile sections"
                className="hidden rounded-none border border-border bg-card p-2 lg:block"
              >
                <p className="kicker px-3 pb-1.5 pt-2.5 text-sm! text-muted-foreground">Sections</p>
                <div className="flex flex-col gap-1">
                  {SECTIONS.map((s, i) => {
                    const isActive = activeSection === s.id;
                    const filled = completion.checks[s.id];
                    const Icon = s.icon;
                    return (
                      <button
                        key={s.id}
                        onClick={() => setActiveSection(s.id)}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex w-full items-center gap-3 rounded-none px-3 py-2.5 text-left text-base font-semibold transition-colors ${
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-secondary"
                        }`}
                      >
                        <span className={`shrink-0 text-sm font-extrabold tabular-nums ${isActive ? "text-white/70" : "text-muted-foreground"}`}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <Icon className="size-5 shrink-0" strokeWidth={1.5} />
                        <span className="min-w-0 flex-1 truncate">{s.label}</span>
                        {filled ? (
                          <CheckCircle2 className={`size-4.5 shrink-0 ${isActive ? "text-white" : "text-success"}`} strokeWidth={2} />
                        ) : (
                          <CircleDot className={`size-4.5 shrink-0 ${isActive ? "text-white/40" : "text-muted-foreground/40"}`} strokeWidth={1.5} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </nav>

              {/* PDS auto-extraction — upload strip under the Sections list,
                  beside the form so it's always in reach while filling out. */}
              <div className="mt-3">
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

            {/* RIGHT CONTENT — flat section cards scroll naturally. Keyed by
                the active section so each switch replays the reveal — a
                quiet "new page" cue on phones where the URL never changes. */}
            <div className="min-w-0">
              <Reveal key={activeSection} y={12}>
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
              </Reveal>
            </div>
          </div>
        </Reveal>

        {/* Mark Profile Complete Confirmation */}
        <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
          <AlertDialogContent>
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
