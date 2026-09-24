"use client";

// ============================================================================
// Atlas dash rebuild — §3.5 Candidate Detail Dossier (#/candidate?id=).
//
// Rebuilt from scratch against DASH-REBUILD-SPEC.md; behavior contract copied
// from the legacy candidate detail (reference only):
//
//   • GET /api/admin/applicants/:id        — the LIVE profile + applications.
//   • GET /api/evaluator/applications/:id  — requirements report + status
//     changes for the LATEST application (both ADMIN and EVALUATOR pass the
//     requireEvaluator guard). Failure here is non-fatal.
//   • Focus refresh only — NO poll (detail views are transient; navigation
//     already remounts them).
//   • Back → #/candidates. Header card: monogram · name · latest position ·
//     vitals (Applied on · Job Applied · Current Stage · Profile) · primary
//     action (Review Application / View Decision — the shared ReviewModal).
//   • Stage stepper: Applied → Under Review → Shortlisted (rejected family
//     renders the red "Not Selected" terminal) with per-stage dates from
//     statusChanges + a "N days since applied" chip.
//   • Atlas grid: About + Work Experience | Skill & Experience Matching +
//     Credentials. Then the Complete Profile ViewTabs (Overview / Education /
//     Experience / Training / Eligibility / Awards / Documents / Applications;
//     application rows open the review modal for THAT application).
// ============================================================================

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNav } from "@/components/nav-provider";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { apiFetch, fullName } from "@/lib/client";
import { humanizeName, humanizeTitle } from "@/lib/humanize";
import { getStatusMeta, isRejectedStatus, stageForStatus, type Tone } from "@/lib/status";
import type { RequirementsReport } from "@/lib/requirements";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  ArrowLeft,
  Award as AwardIcon,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  FileStack,
  GraduationCap,
  Info,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  DaysCard,
  EmptyState,
  Monogram,
  PageShell,
  Panel,
  PanelHead,
  Pill,
  ScoreChip,
  StageStepper,
  ViewTabs,
  fmtDate,
  initials,
  toneSoft,
  type StepperStage,
} from "@/components/dash/kit";
import { ReviewModal } from "@/components/dash/views/review";
import {
  DocumentRow,
  FieldRow,
  LoadError,
  MicroLabel,
  daysSince,
  humanizeRecord,
  renderAward,
  renderEducation,
  renderEligibility,
  renderExperience,
  renderTraining,
  shortDate,
  type ApplicantDetail,
  type ApplicationExtras,
  type ApplicationHistoryItem,
} from "@/components/dash/views/candidate-bits";

type TabKey =
  | "overview"
  | "education"
  | "experience"
  | "training"
  | "eligibility"
  | "awards"
  | "documents"
  | "applications";

// ============================================================================
// CandidateDetailView — the dossier page
// ============================================================================

export function CandidateDetailView() {
  const { params, navigate } = useNav();
  const applicantId = params.id;

  const [data, setData] = useState<ApplicantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Requirements report + status changes for the LATEST application.
  const [extras, setExtras] = useState<ApplicationExtras | null>(null);
  // The application currently open in the review modal (null = closed).
  const [reviewAppId, setReviewAppId] = useState<number | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  const load = useCallback(
    async (silent?: boolean) => {
      if (!applicantId) {
        setError("No applicant ID provided");
        setLoading(false);
        return;
      }
      // Silent (focus) refresh keeps the detail page in place — decisions or
      // profile edits recorded elsewhere surface without a skeleton flash.
      const isSilent = silent === true;
      if (!isSilent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await apiFetch<ApplicantDetail>(
          `/api/admin/applicants/${applicantId}`
        );
        setData(res);
      } catch (e: unknown) {
        // Silent refresh keeps the last good detail on a transient failure.
        if (!isSilent) {
          setError(
            e instanceof Error ? e.message : "Failed to load applicant profile"
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [applicantId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Realtime-lite: refresh when the tab regains focus (no poll — detail
  // views are transient and navigation already remounts them).
  useRefetchOnFocus(() => load(true));

  // Most-recent application (if any) — drives the hero band, the stepper,
  // the requirements fetch and the review modal.
  const latestApp = useMemo(() => {
    return [...(data?.applications ?? [])]
      .filter((a) => a.dateApplied != null)
      .sort((a, b) => {
        const at = a.dateApplied ? new Date(a.dateApplied).getTime() : 0;
        const bt = b.dateApplied ? new Date(b.dateApplied).getTime() : 0;
        return bt - at;
      })[0];
  }, [data]);
  const latestAppId = latestApp?.id ?? null;

  // Requirements report + stage-change dates for the latest application.
  // Both roles pass requireEvaluator (ADMIN included). A failure here is
  // non-fatal — the dossier renders without the matching card's data.
  useEffect(() => {
    if (latestAppId == null) {
      setExtras(null);
      return;
    }
    let cancelled = false;
    apiFetch<ApplicationExtras>(`/api/evaluator/applications/${latestAppId}`)
      .then((r) => {
        if (!cancelled)
          setExtras({
            requirements: r.requirements ?? null,
            statusChanges: Array.isArray(r.statusChanges) ? r.statusChanges : [],
          });
      })
      .catch(() => {
        if (!cancelled) setExtras(null);
      });
    return () => {
      cancelled = true;
    };
  }, [latestAppId]);

  // Top-level loading skeleton
  if (loading) {
    return (
      <PageShell>
        <DetailSkeleton />
      </PageShell>
    );
  }

  // Top-level error / not-found
  if (error || !data) {
    return (
      <PageShell>
        <nav aria-label="Breadcrumb" className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("candidates")}
            aria-label="Go back to candidates"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-sm text-muted-foreground">Candidates</span>
        </nav>
        <Panel className="mt-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <MicroLabel>Candidate Details</MicroLabel>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
                Candidate
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {error || "Applicant not found"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate("candidates")}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
            </div>
          </div>
        </Panel>
        <Panel flush className="mt-4">
          <LoadError
            message={error || "Applicant not found"}
            onRetry={() => void load()}
          />
        </Panel>
      </PageShell>
    );
  }

  const name = humanizeName(fullName(data) || "Unnamed Applicant");

  const latestPosition = latestApp?.positionTitle ?? null;
  const latestStatus = latestApp?.status ?? null;
  const latestAppliedAt = latestApp?.dateApplied ?? null;
  const decided =
    latestStatus != null &&
    (isRejectedStatus(latestStatus) || stageForStatus(latestStatus) === "Shortlisted");
  const statusMeta = latestStatus ? getStatusMeta(latestStatus) : null;

  // Location line — city, province (fall back to present address).
  const location =
    [data.city, data.province].filter(Boolean).join(", ") ||
    data.presentAddress ||
    null;

  // Applied-at ISO for the stepper dates + the days-since chip.
  const appliedIso = latestAppliedAt
    ? new Date(latestAppliedAt).toISOString()
    : null;

  return (
    <PageShell>
      {/* ===== Breadcrumb — back chevron · Candidates / {name} ===== */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm">
        <button
          type="button"
          onClick={() => navigate("candidates")}
          aria-label="Go back to candidates"
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => navigate("candidates")}
          className="ml-2 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          Candidates
        </button>
        <span aria-hidden className="shrink-0 text-muted-foreground/40">
          /
        </span>
        <span className="min-w-0 truncate font-medium text-foreground">{name}</span>
      </nav>

      {/* ===== Header card — monogram · name · position · location, the four
          vitals + the review action, and the stage stepper. ===== */}
      <Panel className="mt-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* Hero identity — the PROFILE_PICTURE upload already fetched with
              the detail payload when present, gradient monogram otherwise. */}
          <HeroAvatar name={fullName(data)} documents={data.documents} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[30px] font-semibold leading-[1.08] tracking-[-0.02em] text-foreground">
              {name}
            </h1>
            {/* Job-applied chip line + location. */}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {latestPosition && (
                <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  <Briefcase className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{humanizeTitle(latestPosition)}</span>
                </span>
              )}
              {location && (
                <span className="inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{humanizeTitle(location)}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("candidates")}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </div>
        </div>

        {/* Vitals row — the four dossier facts + the review action. The
            primary action opens the shared ReviewModal: "Review Application"
            while undecided, "View Decision" once decided. */}
        <div className="mt-5 flex flex-col gap-4 border-t border-border pt-4 lg:flex-row lg:items-center">
          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <MetaCell label="Applied on">
              <span className="tabular-nums">{fmtDate(latestAppliedAt)}</span>
            </MetaCell>
            <MetaCell label="Job Applied">
              <span className="block truncate">
                {latestPosition ? humanizeTitle(latestPosition) : "—"}
              </span>
            </MetaCell>
            <MetaCell label="Current Stage">
              {statusMeta ? (
                <Pill tone={statusMeta.tone}>{statusMeta.label}</Pill>
              ) : (
                "—"
              )}
            </MetaCell>
            <MetaCell label="Profile">
              {data.isProfileComplete ? (
                <Pill tone="success">
                  <Check className="size-3" aria-hidden /> Complete
                </Pill>
              ) : (
                <Pill tone="warning">
                  <AlertCircle className="size-3" aria-hidden /> Incomplete
                </Pill>
              )}
            </MetaCell>
          </dl>
          <div className="shrink-0">
            <Button
              size="sm"
              onClick={() => latestApp && setReviewAppId(Number(latestApp.id))}
              disabled={!latestApp}
              className="min-h-9 rounded-lg px-4"
            >
              <ClipboardCheck className="size-4" />
              {decided ? "View Decision" : "Review Application"}
            </Button>
          </div>
        </div>

        {/* Stage stepper + days-since-applied chip */}
        {latestApp && (
          <StepperBlock
            status={latestStatus ?? ""}
            appliedIso={appliedIso}
            statusChanges={extras?.statusChanges ?? []}
          />
        )}
      </Panel>

      {/* ===== Dossier grid — About + Work Experience (left), Matching +
          Credentials (right). ===== */}
      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <AboutPanel data={data} />
          <ExperiencePanel experiences={data.workExperiences} />
        </div>
        <div className="space-y-4">
          <MatchingPanel
            report={extras?.requirements ?? null}
            hasApplication={latestApp != null}
          />
          <CredentialsPanel
            eligibilities={data.eligibilities}
            trainings={data.trainings}
          />
        </div>
      </div>

      {/* ===== Complete Profile — the full PDS ledger (read-only tabs) ===== */}
      <section className="mt-6 sm:mt-8">
        <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
          <h2 className="flex min-w-0 items-center gap-2.5 text-base font-semibold tracking-[-0.01em] text-foreground sm:text-lg">
            <HeadChip icon={ClipboardList} />
            <span className="truncate">Complete Profile</span>
          </h2>
          <p className="shrink-0 text-sm text-muted-foreground">
            Full PDS ledger — every record on file
          </p>
        </div>
        <ViewTabs
          className="mt-3 flex-wrap"
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "education", label: "Education", count: data.educations.length > 0 ? data.educations.length : undefined },
            { value: "experience", label: "Experience", count: data.workExperiences.length > 0 ? data.workExperiences.length : undefined },
            { value: "training", label: "Training", count: data.trainings.length > 0 ? data.trainings.length : undefined },
            { value: "eligibility", label: "Eligibility", count: data.eligibilities.length > 0 ? data.eligibilities.length : undefined },
            { value: "awards", label: "Awards", count: data.awards.length > 0 ? data.awards.length : undefined },
            { value: "documents", label: "Documents", count: data.documents.length > 0 ? data.documents.length : undefined },
            { value: "applications", label: "Applications", count: data.applications.length > 0 ? data.applications.length : undefined },
          ]}
          value={tab}
          onChange={setTab}
        />

        <div className="mt-4">
          {tab === "overview" && <OverviewTab data={data} />}
          {tab === "education" && (
            <EntityPanel
              title="Education"
              description="Academic background and highest level achieved"
              emptyTitle="No education records"
              icon={GraduationCap}
              items={data.educations}
              render={renderEducation}
            />
          )}
          {tab === "experience" && (
            <EntityPanel
              title="Work Experience"
              description="Employment history, present work first"
              emptyTitle="No work experience records"
              icon={Briefcase}
              items={data.workExperiences}
              render={renderExperience}
            />
          )}
          {tab === "training" && (
            <EntityPanel
              title="Training Programs"
              description="Trainings and seminars attended"
              emptyTitle="No training records"
              icon={BookOpen}
              items={data.trainings}
              render={renderTraining}
            />
          )}
          {tab === "eligibility" && (
            <EntityPanel
              title="Eligibility"
              description="Civil service and professional eligibilities"
              emptyTitle="No eligibility records"
              icon={ShieldCheck}
              items={data.eligibilities}
              render={renderEligibility}
            />
          )}
          {tab === "awards" && (
            <EntityPanel
              title="Awards & Recognitions"
              description="Recognitions and accomplishments"
              emptyTitle="No award records"
              icon={AwardIcon}
              items={data.awards}
              render={renderAward}
            />
          )}
          {tab === "documents" && <DocumentsPanel documents={data.documents} />}
          {tab === "applications" && (
            <ApplicationsPanel
              applications={data.applications}
              onOpenReview={(id) => setReviewAppId(id)}
            />
          )}
        </div>
      </section>

      {/* Review modal — the shared Review Workspace. Opened by the header
          card's primary action AND by Applications-tab rows (that row's
          application); onDecided refreshes the dossier silently. Rendered
          only while an application is targeted. */}
      {reviewAppId != null && (
        <ReviewModal
          applicationId={reviewAppId}
          open={reviewAppId != null}
          onOpenChange={(v) => {
            if (!v) setReviewAppId(null);
          }}
          onDecided={() => {
            void load(true);
          }}
        />
      )}
    </PageShell>
  );
}

// ============================================================================
// MetaCell — one dossier vital (label over value) in the header card.
// ============================================================================

function MetaCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold text-foreground">{children}</dd>
    </div>
  );
}

// ============================================================================
// HeadChip — tone-tinted icon chip for dossier section heads.
// ============================================================================

function HeadChip({ icon: Icon, tone = "primary" }: { icon: typeof Briefcase; tone?: Tone }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[10px] ring-1 ring-inset ring-black/[0.04]",
        toneSoft[tone]
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

// ============================================================================
// HeroAvatar — dossier identity photo: the applicant's PROFILE_PICTURE upload
// (already part of the fetched detail payload) when present, the gradient
// monogram otherwise; a failed image falls back to the monogram.
// ============================================================================

function HeroAvatar({
  name,
  documents,
}: {
  name: string;
  documents: ApplicantDetail["documents"];
}) {
  const [broken, setBroken] = useState(false);
  const photo = documents.find((d) => d.category === "PROFILE_PICTURE") ?? null;
  const src = photo ? `/api/files/${photo.filePath}` : null;
  if (!src || broken) {
    return <Monogram label={initials(name)} size="xl" className="shrink-0" />;
  }
  return (
    <img
      src={src}
      alt=""
      onError={() => setBroken(true)}
      className="size-20 shrink-0 rounded-full object-cover shadow-xs ring-2 ring-white/80"
    />
  );
}

// ============================================================================
// StepperBlock — the horizontal pipeline progress (kit StageStepper): the
// rejected family renders the red "Not Selected" terminal instead of the
// Shortlisted node; per-stage dates come from the application's
// statusChanges; the "days in pipeline" chip sits flush right.
// ============================================================================

function StepperBlock({
  status,
  appliedIso,
  statusChanges,
}: {
  status: string;
  appliedIso: string | null;
  statusChanges: ApplicationExtras["statusChanges"];
}) {
  const rejected = isRejectedStatus(status);
  const stage = stageForStatus(status);

  // Earliest status-change timestamp per stage (ISO strings sort
  // chronologically as plain strings).
  const stageDate = (target: "Under Review" | "Shortlisted"): string | null => {
    const hits = statusChanges
      .filter((c) => stageForStatus(c.toStatus ?? "") === target)
      .map((c) => c.createdAt)
      .filter(Boolean)
      .sort();
    return hits[0] ?? null;
  };
  const rejectedDate =
    statusChanges
      .filter((c) => isRejectedStatus(c.toStatus ?? ""))
      .map((c) => c.createdAt)
      .filter(Boolean)
      .sort()[0] ?? null;

  const stages: StepperStage[] = rejected
    ? [
        { key: "Applied", label: "Applied", tone: "primary", date: shortDate(appliedIso) },
        { key: "Under Review", label: "Under Review", tone: "warning", date: shortDate(stageDate("Under Review")) },
        { key: "Rejected", label: "Not Selected", tone: "danger", date: shortDate(rejectedDate) },
      ]
    : [
        { key: "Applied", label: "Applied", tone: "primary", date: shortDate(appliedIso) },
        { key: "Under Review", label: "Under Review", tone: "warning", date: shortDate(stageDate("Under Review")) },
        { key: "Shortlisted", label: "Shortlisted", tone: "success", date: shortDate(stageDate("Shortlisted")) },
      ];

  const currentKey =
    stage === "Applied" ? "Applied" : stage === "Under Review" ? "Under Review" : "Shortlisted";

  const days = daysSince(appliedIso);

  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4 border-t border-border pt-5">
      <StageStepper
        stages={stages}
        currentKey={currentKey}
        rejected={rejected}
        className="min-w-0 flex-1 basis-72"
      />
      {days != null && (
        <DaysCard
          days={days}
          label={days === 1 ? "day since applied" : "days since applied"}
          className="ml-auto"
        />
      )}
    </div>
  );
}

// ============================================================================
// AboutPanel — a composed paragraph over the live profile facts (RMIS keeps
// no free-text bio, so the paragraph is assembled from what the PDS records).
// ============================================================================

function AboutPanel({ data }: { data: ApplicantDetail }) {
  const loc = [data.city, data.province].filter(Boolean).join(", ");
  const exp = data.workExperiences.length;
  const elig = data.eligibilities.length;
  const train = data.trainings.length;
  const edu = data.educations.length;

  const opener = [
    loc ? `based in ${humanizeTitle(loc)}` : null,
    data.citizenship ? `a ${humanizeTitle(data.citizenship)} citizen` : null,
  ]
    .filter(Boolean)
    .join(" and ");

  const creds = [
    exp ? `${exp} work experience ${exp === 1 ? "entry" : "entries"}` : null,
    edu ? `${edu} education ${edu === 1 ? "record" : "records"}` : null,
    elig
      ? `${elig} civil-service ${elig === 1 ? "eligibility" : "eligibilities"}`
      : null,
    train ? `${train} training ${train === 1 ? "program" : "programs"}` : null,
  ].filter(Boolean);

  const body =
    (opener ? `${nameSentence(data, opener)} ` : "") +
    (creds.length
      ? `On file: ${creds.join(", ")}.`
      : "No credential records have been submitted yet.");

  return (
    <Panel>
      <PanelHead
        title={
          <span className="flex items-center gap-2.5">
            <HeadChip icon={UserRound} />
            About
          </span>
        }
      />
      <p className="text-sm leading-relaxed text-foreground/80">{body}</p>
    </Panel>
  );
}

// "Maria Santos is based in Quezon City and a Filipino citizen." — composed
// opener sentence; falls back to the bare fact list when there is no opener.
function nameSentence(data: ApplicantDetail, opener: string): string {
  const named = humanizeName(fullName(data) || "This applicant");
  return `${named} is ${opener}.`;
}

// ============================================================================
// ExperiencePanel — work experience entries: employer tile, employer
// (primary ink) + role, dates · duration, quiet fact bullets. Present work
// sorts first, then most recent.
// ============================================================================

function ExperiencePanel({ experiences }: { experiences: Record<string, unknown>[] }) {
  const sorted = useMemo(() => {
    return [...experiences].sort((a, b) => {
      const pa = a.isPresentWork ? 1 : 0;
      const pb = b.isPresentWork ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const da = a.inclusiveDateFrom ? new Date(String(a.inclusiveDateFrom)).getTime() : 0;
      const db = b.inclusiveDateFrom ? new Date(String(b.inclusiveDateFrom)).getTime() : 0;
      return db - da;
    });
  }, [experiences]);

  return (
    <Panel>
      <PanelHead
        title={
          <span className="flex items-center gap-2.5">
            <HeadChip icon={Building2} />
            Work Experience
          </span>
        }
      />
      {sorted.length === 0 ? (
        <EmptyState icon={Briefcase} title="No work experience records" className="py-10" />
      ) : (
        <ul>
          {sorted.map((e, i) => {
            const employer =
              typeof e.employerName === "string" ? humanizeTitle(e.employerName) : null;
            const position =
              typeof e.positionTitle === "string" ? humanizeTitle(e.positionTitle) : null;
            const from = e.inclusiveDateFrom ? fmtDate(String(e.inclusiveDateFrom)) : null;
            const to = e.isPresentWork
              ? "Present"
              : e.inclusiveDateTo
                ? fmtDate(String(e.inclusiveDateTo))
                : null;
            const years =
              typeof e.yearDecimal === "number" || (typeof e.yearDecimal === "string" && e.yearDecimal)
                ? `${e.yearDecimal} yr${Number(e.yearDecimal) === 1 ? "" : "s"}`
                : null;
            const dates =
              from || to
                ? `${from ?? "—"} – ${to ?? "—"}${years ? ` · ${years}` : ""}`
                : null;
            const facts: string[] = [];
            if (typeof e.employerAddress === "string" && e.employerAddress)
              facts.push(humanizeTitle(e.employerAddress));
            if (typeof e.statusOfEmployment === "string" && e.statusOfEmployment)
              facts.push(`${humanizeTitle(e.statusOfEmployment)}`);
            if (e.isGovtService != null)
              facts.push(`Government service: ${e.isGovtService ? "Yes" : "No"}`);
            return (
              <li
                key={i}
                className="relative border-l-2 border-primary/20 pb-5 pl-4 last:pb-0"
              >
                <span
                  aria-hidden
                  className="absolute -left-[5px] top-1.5 size-2 rounded-full bg-primary/50 ring-[3px] ring-card"
                />
                <p className="truncate text-sm font-semibold text-foreground">
                  {position || employer || "—"}
                </p>
                {(position || dates) && (
                  <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                    {
                      [
                        ...(position && employer ? [employer] : []),
                        ...(dates ? [dates] : []),
                      ].join(" · ")
                    }
                  </p>
                )}
                {facts.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {facts.slice(0, 3).map((f, j) => (
                      <li key={j} className="flex gap-1.5 text-xs text-muted-foreground">
                        <span aria-hidden className="text-muted-foreground/50">•</span>
                        <span className="min-w-0">{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

// ============================================================================
// MatchingPanel — the REAL requirements verdict for the latest application:
// big match %, "X of Y requirements matched", verdict pill, per-standard
// checklist (met / not-met / verify glyphs), and the Match Summary box.
// ============================================================================

const VERDICT_META: Record<
  RequirementsReport["verdict"],
  { label: string; tone: Tone } | null
> = {
  ALL_MET: { label: "Strong match", tone: "success" },
  PARTIAL: { label: "Partial match", tone: "warning" },
  NONE_MET: { label: "Does not meet", tone: "danger" },
  NEEDS_REVIEW: { label: "Needs review", tone: "neutral" },
  NO_REQUIREMENTS: null,
};

function MatchingPanel({
  report,
  hasApplication,
}: {
  report: RequirementsReport | null;
  hasApplication: boolean;
}) {
  return (
    <Panel>
      <PanelHead
        title={
          <span className="flex items-center gap-2.5">
            <HeadChip icon={Sparkles} />
            Skill &amp; Experience Matching
          </span>
        }
        right={<Info className="size-4 text-muted-foreground/50" aria-hidden />}
      />

      {!hasApplication ? (
        <p className="text-sm text-muted-foreground">
          The applicant has not applied to any position yet.
        </p>
      ) : report == null ? (
        <p className="text-sm text-muted-foreground">Loading requirements match…</p>
      ) : report.verdict === "NO_REQUIREMENTS" ? (
        <p className="text-sm text-muted-foreground">
          This position declares no CSC qualification standards to match against.
        </p>
      ) : (
        <MatchingBody report={report} />
      )}
    </Panel>
  );
}

/** The loaded match report: display-scale numeral, score chip, per-standard
 *  checklist and the Match Summary callout. */
function MatchingBody({ report }: { report: RequirementsReport }) {
  const pct = Math.round((report.metCount / Math.max(1, report.requiredCount)) * 100);
  return (
    <>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <p className="text-[40px] font-semibold tabular-nums leading-none tracking-[-0.03em] text-foreground">
          {pct}%
        </p>
        <p className="min-w-0 flex-1 pb-1 text-xs text-muted-foreground">
          {report.metCount} of {report.requiredCount} requirements matched
        </p>
        <div className="flex shrink-0 items-center gap-1.5 pb-1">
          {VERDICT_META[report.verdict] && (
            <Pill tone={VERDICT_META[report.verdict]!.tone}>
              {VERDICT_META[report.verdict]!.label}
            </Pill>
          )}
          <ScoreChip score={pct} />
        </div>
      </div>

      {/* Per-standard checklist — required standards only */}
      <ul className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {report.checks
          .filter((c) => c.required)
          .map((c) => (
            <li
              key={c.key}
              className="flex items-start gap-2.5 text-sm"
              title={c.requirement ?? c.applicantSummary}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                  c.status === "MET"
                    ? "bg-success/10 text-success"
                    : c.status === "NOT_MET"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                )}
              >
                {c.status === "MET" ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : c.status === "NOT_MET" ? (
                  <X className="size-3" strokeWidth={3} />
                ) : (
                  <CircleHelp className="size-3" />
                )}
              </span>
              <span
                className={cn(
                  "min-w-0 truncate",
                  c.status === "MET" ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {c.label}
              </span>
            </li>
          ))}
      </ul>

      {/* Match Summary — composed from the report, rendered in the primary
          soft tint with an inset ring. */}
      <div className="mt-5 rounded-2xl bg-primary/[0.06] p-4 ring-1 ring-inset ring-primary/15">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
          <Sparkles className="size-3.5" aria-hidden />
          Match Summary
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
          {composeMatchSummary(report)}
        </p>
      </div>
    </>
  );
}

function composeMatchSummary(report: RequirementsReport): string {
  const head = `The applicant meets ${report.metCount} of ${report.requiredCount} minimum requirements for this position.`;
  const unmet = report.checks.filter((c) => c.required && c.status === "NOT_MET");
  const review = report.checks.filter((c) => c.required && c.status === "REVIEW");
  const bits: string[] = [];
  if (unmet.length) {
    const gap = unmet
      .map((c) => (c.shortfall ? `${c.label} (${c.shortfall})` : c.label))
      .join(", ");
    bits.push(`Not yet met: ${gap}.`);
  }
  if (review.length) {
    bits.push(`Needs manual verification: ${review.map((c) => c.label).join(", ")}.`);
  }
  if (!bits.length) {
    return `${head} All declared standards are satisfied by the credentials on file.`;
  }
  return `${head} ${bits.join(" ")}`;
}

// ============================================================================
// CredentialsPanel — eligibility + training chips fed by real PDS records.
// ============================================================================

function CredentialsPanel({
  eligibilities,
  trainings,
}: {
  eligibilities: Record<string, unknown>[];
  trainings: Record<string, unknown>[];
}) {
  const eligTitles = eligibilities
    .map((e) => (typeof e.eligibilityTitle === "string" ? e.eligibilityTitle.trim() : ""))
    .filter(Boolean)
    .map((t) => humanizeTitle(t));
  const trainTitles = trainings
    .map((t) => (typeof t.titleOfTraining === "string" ? t.titleOfTraining.trim() : ""))
    .filter(Boolean)
    .map((t) => humanizeTitle(t));

  return (
    <Panel>
      <PanelHead
        title={
          <span className="flex items-center gap-2.5">
            <HeadChip icon={ShieldCheck} />
            Credentials
          </span>
        }
      />
      {eligTitles.length === 0 && trainTitles.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No eligibilities or trainings on file"
          className="py-10"
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {eligTitles.map((t) => (
            <span
              key={`e-${t}`}
              className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
            >
              {t}
            </span>
          ))}
          {trainTitles.map((t) => (
            <span
              key={`t-${t}`}
              className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground/80"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ============================================================================
// Complete Profile tabs — read-only cards over the live profile
// ============================================================================

// Overview — personal info + contact info + character references.
function OverviewTab({ data }: { data: ApplicantDetail }) {
  const charRefs = Array.isArray(data.characterReferences)
    ? data.characterReferences
    : [];

  return (
    <div className="space-y-4 xl:grid xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start xl:gap-4 xl:space-y-0">
      <div className="min-w-0 space-y-4">
        <Panel flush>
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3 sm:px-5">
            <HeadChip icon={UserRound} />
            <MicroLabel>Personal Information</MicroLabel>
          </div>
          <dl className="divide-y divide-border px-4 py-2 sm:px-5">
            <FieldRow label="Full Name" value={humanizeName(fullName(data))} />
            <FieldRow label="First Name" value={humanizeName(data.firstName ?? "")} />
            <FieldRow label="Middle Name" value={humanizeName(data.middleName ?? "")} />
            <FieldRow label="Last Name" value={humanizeName(data.lastName ?? "")} />
            <FieldRow label="Extension" value={humanizeName(data.extensionName ?? "")} />
            <FieldRow label="Gender" value={humanizeTitle(data.gender ?? "")} />
            <FieldRow label="Civil Status" value={humanizeTitle(data.civilStatus ?? "")} />
            <FieldRow label="Citizenship" value={humanizeTitle(data.citizenship ?? "")} />
            <FieldRow
              label="Birth Date"
              value={data.birthDate ? fmtDate(data.birthDate) : null}
            />
            <FieldRow label="Birth Place" value={humanizeTitle(data.birthPlace ?? "")} />
          </dl>
        </Panel>

        <Panel>
          <PanelHead
            title={
              <span className="flex items-center gap-2.5">
                <HeadChip icon={Mail} />
                Contact Information
              </span>
            }
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ContactCard icon={Mail} label="Email">
              {data.emailAddress ? (
                <a
                  href={`mailto:${data.emailAddress}`}
                  className="break-all text-primary hover:underline"
                >
                  {data.emailAddress}
                </a>
              ) : (
                <EmptyValue />
              )}
            </ContactCard>
            <ContactCard icon={Phone} label="Phone">
              {data.contactNumber || data.mobileNumber || <EmptyValue />}
            </ContactCard>
            <ContactCard icon={Calendar} label="Birth Date">
              {data.birthDate ? fmtDate(data.birthDate) : <EmptyValue />}
            </ContactCard>
            <ContactCard icon={MapPin} label="Address">
              {[data.presentAddress, data.city, data.province, data.country]
                .filter(Boolean)
                .join(", ") || <EmptyValue />}
            </ContactCard>
          </div>
        </Panel>
      </div>

      <aside className="xl:sticky xl:top-6 xl:self-start">
        <Panel flush>
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3 sm:px-5">
            <HeadChip icon={Users} />
            <MicroLabel>Character References</MicroLabel>
          </div>
          {charRefs.length === 0 ? (
            <p className="px-4 py-6 text-sm italic text-muted-foreground sm:px-5">
              No character references provided
            </p>
          ) : (
            <div className="max-h-[60vh] divide-y divide-border overflow-y-auto">
              {charRefs.map((ref, i) => (
                <div key={i} className="px-4 py-3.5 sm:px-5">
                  <p className="text-sm font-medium text-foreground">
                    {humanizeName(ref.name || "Unnamed")}
                  </p>
                  {(ref.title || ref.company || ref.email || ref.contact) && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      {ref.title && <span>{humanizeTitle(ref.title)}</span>}
                      {ref.title && ref.company && <span aria-hidden>·</span>}
                      {ref.company && <span>{humanizeTitle(ref.company)}</span>}
                      {ref.email && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="break-all">{ref.email}</span>
                        </>
                      )}
                      {ref.contact && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="tabular-nums">{ref.contact}</span>
                        </>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </aside>
    </div>
  );
}

function ContactCard({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Mail;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-3.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-card text-muted-foreground shadow-xs">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0">
        <MicroLabel>{label}</MicroLabel>
        <div className="mt-0.5 text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

function EmptyValue() {
  return <span className="text-muted-foreground/50">—</span>;
}

// EntityPanel — read-only renderer for the PDS child sections (education /
// experience / training / eligibility / awards): hairline toolbar (micro
// label + N entries), description line, and one hairline ledger of snapshot
// rows rendered through the shared renderers.
function EntityPanel({
  title,
  description,
  emptyTitle,
  icon,
  items,
  render,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  icon: typeof GraduationCap;
  items: Record<string, unknown>[];
  render: (item: Record<string, unknown>) => ReactNode;
}) {
  return (
    <Panel flush>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="flex min-w-0 items-center gap-2.5">
          <HeadChip icon={icon} />
          <MicroLabel className="truncate">{title}</MicroLabel>
        </span>
        <p className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
          {items.length} entr{items.length === 1 ? "y" : "ies"}
        </p>
      </div>
      <p className="px-4 pt-3 text-sm text-muted-foreground sm:px-5">{description}</p>
      {items.length === 0 ? (
        <EmptyState icon={icon} title={emptyTitle} />
      ) : (
        <div className="mt-3 max-h-[60vh] divide-y divide-border overflow-y-auto">
          {items.map((item, i) => (
            <div key={i} className="px-4 py-4 sm:px-5">
              <dl>{render(humanizeRecord(item))}</dl>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// DocumentsPanel — one ledger sheet of document rows (status pill stays: it
// is DATA, not decoration). Rows open the file in a new tab.
function DocumentsPanel({ documents }: { documents: ApplicantDetail["documents"] }) {
  return (
    <Panel flush>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="flex min-w-0 items-center gap-2.5">
          <HeadChip icon={FileStack} />
          <MicroLabel>Supporting Documents</MicroLabel>
        </span>
        <p className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
          {documents.length} {documents.length === 1 ? "document" : "documents"}
        </p>
      </div>
      <p className="px-4 pt-3 text-sm text-muted-foreground sm:px-5">
        Files uploaded by the applicant — click to open in a new tab.
      </p>
      {documents.length === 0 ? (
        <EmptyState
          icon={FileStack}
          title="No documents uploaded"
          sub="This applicant has not uploaded any files yet."
        />
      ) : (
        <div className="mt-3 max-h-[60vh] divide-y divide-border overflow-y-auto">
          {documents.map((d, i) => (
            <DocumentRow key={d.id} doc={d} showUploaded index={i} />
          ))}
        </div>
      )}
    </Panel>
  );
}

// ApplicationsPanel — the applicant's application history. Rows carry the
// status pill (DATA) and open the review modal for THAT application.
function ApplicationsPanel({
  applications,
  onOpenReview,
}: {
  applications: ApplicationHistoryItem[];
  onOpenReview: (id: number) => void;
}) {
  return (
    <Panel flush>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="flex min-w-0 items-center gap-2.5">
          <HeadChip icon={ClipboardList} />
          <MicroLabel>Application History</MicroLabel>
        </span>
        <p className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
          {applications.length}{" "}
          {applications.length === 1 ? "application" : "applications"}
        </p>
      </div>
      <p className="px-4 pt-3 text-sm text-muted-foreground sm:px-5">
        Positions this applicant has applied for — click a row to open its review.
      </p>
      {applications.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No applications"
          sub="This applicant has not submitted any applications."
        />
      ) : (
        <div className="mt-3 max-h-[60vh] divide-y divide-border overflow-y-auto">
          {applications.map((app, i) => {
            const meta = app.status ? getStatusMeta(app.status) : null;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => onOpenReview(Number(app.id))}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span
                  aria-hidden
                  className="hidden shrink-0 text-xs tabular-nums text-muted-foreground/60 sm:inline"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {humanizeTitle(app.positionTitle || "Untitled Position")}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Applied{" "}
                    <span className="tabular-nums">{fmtDate(app.dateApplied)}</span>
                  </span>
                </span>
                {meta && <Pill tone={meta.tone}>{meta.label}</Pill>}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ============================================================================
// Loading skeleton — mirrors the dossier layout: breadcrumb bar → header
// card (avatar + name/position bars + vitals row + stepper) → the 2×2
// dossier grid → tabs strip + ledger.
// ============================================================================

function DetailSkeleton() {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="h-3.5 w-40" />
      </div>
      <div className="mt-3 rounded-[20px] border border-border bg-card p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <Skeleton className="size-20 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <Skeleton className="h-7 w-56 max-w-full" />
            <Skeleton className="h-3.5 w-72 max-w-full" />
          </div>
          <Skeleton className="hidden h-8 w-24 shrink-0 sm:block" />
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 flex items-center gap-4 border-t border-border pt-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="size-9 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-2.5 w-10" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-[20px] border border-border bg-card p-5">
            <Skeleton className="h-4 w-32" />
            <div className="mt-3 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="mt-8 h-10 w-full max-w-2xl" />
      <div className="mt-4 divide-y divide-border rounded-2xl border border-border bg-card">
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-4 py-4 sm:px-5">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="mt-3 h-3 w-3/4" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
