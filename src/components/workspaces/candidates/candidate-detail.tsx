"use client";

// ============================================================================
// RMIS 2.0 — Candidate Detail (workspace)
// A dedicated, deeper-than-the-drawer view of a single applicant's profile.
//
// Composition (minimalist staff surface — mirrors review-queue: compact
// header, quiet section headings, flat bordered cards, token colours only,
// 150ms colour-only transitions; no editorial hero type, no gold kickers,
// no momentum sweeps, no staggered entrances, no ghost numerals):
//   • Contextual header — back breadcrumb + quiet overline + h1 name +
//     vitals line (position · applied · profile-complete chip + status pill)
//     + Back outline button.
//   • Contextual tabs (shadcn Tabs): Overview · Education · Experience ·
//     Training · Eligibility · Awards · Documents · Applications.
//   • Each child tab renders read-only entity cards via the shared
//     renderEducation / renderExperience / ... snapshot renderers.
//
// Reads params.id from the nav provider. Fetches GET /api/admin/applicants/:id.
// ============================================================================

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { useNav } from "@/components/nav-provider";
import { apiFetch, formatDate, fullName } from "@/lib/client";
import {
  StatusIndicator,
  EmptyState,
  ErrorState,
  SectionLabel,
} from "@/components/primitives/workspace";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  FileText,
  User as UserIcon,
  GraduationCap,
  Briefcase,
  BookOpen,
  Award as AwardIcon,
  FileStack,
  ShieldCheck,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  MapPin,
  ArrowUpRight,
} from "lucide-react";
import { humanizeTitle, humanizeName } from "@/lib/humanize";
import {
  renderEducation,
  renderExperience,
  renderTraining,
  renderEligibility,
  renderAward,
} from "@/components/views/evaluator/types";
import {
  CATEGORY_LABEL,
  DOC_STATUS_META,
  formatFileSize,
  type CharacterReference,
} from "@/components/views/profile/types";
import { FieldRow } from "@/components/views/shared";

// ============================================================================
// Types — shape returned by GET /api/admin/applicants/:id
// (mirrors the contract documented in the API route handler)
// ============================================================================
type ApplicantDocument = {
  id: string;
  originalName: string;
  fileName: string;
  filePath: string;
  category: string;
  status: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

type ApplicationHistoryItem = {
  id: number;
  status: string | null;
  dateApplied: Date | null;
  jobId: number | null;
  positionTitle: string | null;
};

// Typographic middot between row vitals — quiet punctuation, no icons.
function Dot() {
  return <span aria-hidden className="select-none text-foreground/25">·</span>;
}

// Humanize ALL-CAPS DB strings inside a record before the shared snapshot
// renderers display them (degrees, schools, employers, eligibility titles…).
// humanizeTitle passes mixed-case through untouched; short codes (N/A, PRC,
// II) and date strings without letters are left exactly as stored.
function humanizeRecord(rec: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    out[k] =
      typeof v === "string" && v.length >= 4 && /[A-Za-z]/.test(v)
        ? humanizeTitle(v)
        : v;
  }
  return out;
}

type ApplicantDetail = {
  id: number;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  extensionName: string | null;
  emailAddress: string | null;
  contactNumber: string | null;
  mobileNumber: string | null;
  gender: string | null;
  civilStatus: string | null;
  citizenship: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  presentAddress: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zipCode: string | null;
  isProfileComplete: boolean;
  educations: Record<string, unknown>[];
  workExperiences: Record<string, unknown>[];
  trainings: Record<string, unknown>[];
  eligibilities: Record<string, unknown>[];
  awards: Record<string, unknown>[];
  characterReferences: CharacterReference[] | null;
  documents: ApplicantDocument[];
  applications: ApplicationHistoryItem[];
};

export function CandidateDetail() {
  const { params, navigate } = useNav();
  const applicantId = params.id;

  const [data, setData] = useState<ApplicantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent?: boolean) => {
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
        `/api/admin/applicants/${applicantId}`,
      );
      setData(res);
    } catch (e: unknown) {
      // Silent refresh keeps the last good detail on a transient failure.
      if (!isSilent) {
        setError(
          e instanceof Error ? e.message : "Failed to load applicant profile",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime-lite: refresh when the tab regains focus (no poll — detail
  // views are transient and navigation already remounts them).
  useRefetchOnFocus(() => load(true));

  // Top-level loading skeleton
  if (loading) {
    return (
      <DetailShell>
        <DetailSkeleton />
      </DetailShell>
    );
  }

  // Top-level error / not-found
  if (error || !data) {
    return (
      <DetailShell>
        <button
          type="button"
          onClick={() => navigate("candidates")}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Candidates
        </button>
        <header className="mb-6 mt-3 border-b border-border pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Candidate Details
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
                Candidate
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {error || "Applicant not found"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("candidates")}
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
            </div>
          </div>
        </header>
        <ErrorState
          message={error || "Applicant not found"}
          onRetry={load}
        />
      </DetailShell>
    );
  }

  const name = humanizeName(fullName(data) || "Unnamed Applicant");

  // Find the most-recent application (if any) to show position + status in
  // the hero band. Sort by dateApplied desc; nulls last.
  const latestApp = [...(data.applications ?? [])]
    .filter((a) => a.dateApplied != null)
    .sort((a, b) => {
      const at = a.dateApplied ? new Date(a.dateApplied).getTime() : 0;
      const bt = b.dateApplied ? new Date(b.dateApplied).getTime() : 0;
      return bt - at;
    })[0];
  const latestPosition = latestApp?.positionTitle ?? null;
  const latestStatus = latestApp?.status ?? null;
  const latestAppliedAt = latestApp?.dateApplied ?? null;

  return (
    <DetailShell>
      {/* Back breadcrumb — small navigation hint above the hero band */}
      <button
        type="button"
        onClick={() => navigate("candidates")}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Candidates
      </button>

      {/* ===== Compact header — quiet overline + semibold name + one muted
          vitals line (position · applied · profile-complete chip · status
          pill). Back button flush right. No display type, no gold kicker. ===== */}
      <header className="mb-6 mt-3 border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Candidate Details
            </p>
            <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight text-foreground">
              {name}
            </h1>
            {/* One quiet vitals line — position · applied + status pill */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {latestPosition && (
                <span className="font-medium text-foreground">
                  {humanizeTitle(latestPosition)}
                </span>
              )}
              {latestAppliedAt && (
                <>
                  <Dot />
                  <span className="shrink-0 tabular-nums">
                    Applied {formatDate(latestAppliedAt)}
                  </span>
                </>
              )}
              <Dot />
              {data.isProfileComplete ? (
                <span className="inline-flex items-center gap-1 border border-success/40 bg-success/10 px-2 py-0.5 text-xs font-medium text-success-ink">
                  <CheckCircle2 className="size-3" /> Profile complete
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-danger-ink">
                  <AlertCircle className="size-3" /> Incomplete
                </span>
              )}
              {latestStatus && <StatusIndicator status={latestStatus} size="sm" />}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("candidates")}
            >
              <ArrowLeft className="size-4" />
              Back
            </Button>
          </div>
        </div>
      </header>

      {/* ===== KPI tiles — Education / Experience / Documents / Applications
          counts. Flat bordered bg-card cells: quiet uppercase micro-label +
          tabular figure (all numbers text-foreground — no ghost numerals, no
          icons, no colored figures). The Tabs strip below drills into each
          ledger. ===== */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* 01 — Education */}
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Education
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {data.educations.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Academic records on file
          </p>
        </div>
        {/* 02 — Work experience */}
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Work experience
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {data.workExperiences.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Employment history entries
          </p>
        </div>
        {/* 03 — Documents */}
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Documents
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {data.documents.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Files uploaded by applicant
          </p>
        </div>
        {/* 04 — Applications */}
        <div className="border border-border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Applications
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
            {data.applications.length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Positions applied for
          </p>
        </div>
      </div>

      {/* Tabs — positive mt-4 below the KPI grid. */}
      <Tabs defaultValue="overview" className="mt-4">
        <TabsList className="flex h-auto max-w-full flex-wrap gap-1 p-1">
          <DetailTabsTrigger value="overview" icon={<UserIcon className="size-[1.1429em]" />} label="Overview" />
          <DetailTabsTrigger
            value="education"
            icon={<GraduationCap className="size-[1.1429em]" />}
            label="Education"
            count={data.educations.length}
          />
          <DetailTabsTrigger
            value="experience"
            icon={<Briefcase className="size-[1.1429em]" />}
            label="Experience"
            count={data.workExperiences.length}
          />
          <DetailTabsTrigger
            value="training"
            icon={<BookOpen className="size-[1.1429em]" />}
            label="Training"
            count={data.trainings.length}
          />
          <DetailTabsTrigger
            value="eligibility"
            icon={<ShieldCheck className="size-[1.1429em]" />}
            label="Eligibility"
            count={data.eligibilities.length}
          />
          <DetailTabsTrigger
            value="awards"
            icon={<AwardIcon className="size-[1.1429em]" />}
            label="Awards"
            count={data.awards.length}
          />
          <DetailTabsTrigger
            value="documents"
            icon={<FileStack className="size-[1.1429em]" />}
            label="Documents"
            count={data.documents.length}
          />
          <DetailTabsTrigger
            value="applications"
            icon={<ClipboardList className="size-[1.1429em]" />}
            label="Applications"
            count={data.applications.length}
          />
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab data={data} />
        </TabsContent>
        <TabsContent value="education" className="mt-4">
          <EntityList
            title="Education"
            description="Academic background and highest level achieved"
            emptyTitle="No education records"
            items={data.educations}
            render={renderEducation}
          />
        </TabsContent>
        <TabsContent value="experience" className="mt-4">
          <EntityList
            title="Work Experience"
            description="Employment history, present work first"
            emptyTitle="No work experience records"
            items={data.workExperiences}
            render={renderExperience}
          />
        </TabsContent>
        <TabsContent value="training" className="mt-4">
          <EntityList
            title="Training Programs"
            description="Trainings and seminars attended"
            emptyTitle="No training records"
            items={data.trainings}
            render={renderTraining}
          />
        </TabsContent>
        <TabsContent value="eligibility" className="mt-4">
          <EntityList
            title="Eligibility"
            description="Civil service and professional eligibilities"
            emptyTitle="No eligibility records"
            items={data.eligibilities}
            render={renderEligibility}
          />
        </TabsContent>
        <TabsContent value="awards" className="mt-4">
          <EntityList
            title="Awards & Recognitions"
            description="Recognitions and accomplishments"
            emptyTitle="No award records"
            items={data.awards}
            render={renderAward}
          />
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <DocumentsTab documents={data.documents} />
        </TabsContent>
        <TabsContent value="applications" className="mt-4">
          <ApplicationsTab applications={data.applications} />
        </TabsContent>
      </Tabs>
    </DetailShell>
  );
}

// ============================================================================
// Shell — page wrapper (max-w + sticky footer support)
// ============================================================================
function DetailShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}

// ============================================================================
// Detail tab trigger — icon + label + count badge
// ============================================================================
function DetailTabsTrigger({
  value,
  icon,
  label,
  count,
}: {
  value: string;
  icon: ReactNode;
  label: string;
  count?: number;
}) {
  // Fluid Accenture type: inherit the base trigger's text-sm (which rides
  // the 14→18.67px fluid curve) — never pin a fixed text-xs here. Icon and
  // count badge are sized in em so they scale with the fluid label.
  return (
    <TabsTrigger
      value={value}
      className="group"
    >
      {icon}
      <span className="ml-[0.43em]">{label}</span>
      {count != null && count > 0 && (
        <span className="ml-[0.43em] inline-flex h-[1.8em] min-w-[1.8em] items-center justify-center bg-primary/10 px-[0.4em] text-[0.7143em] font-medium tabular-nums tracking-[-0.02em] text-primary">
          {count}
        </span>
      )}
    </TabsTrigger>
  );
}

// ============================================================================
// Overview tab — personal info + contact info + character references
// ============================================================================
function OverviewTab({ data }: { data: ApplicantDetail }) {
  const charRefs = Array.isArray(data.characterReferences)
    ? data.characterReferences
    : [];

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Personal Information</SectionLabel>
        <div className="mt-3 border border-border bg-card">
          {/* Rows padded via child selector (matches the px-4 ledger register
              used by EntityList / Character References) so labels and values
              get proper left padding while hairlines stay edge-to-edge. */}
          <dl className="divide-y divide-border [&>div]:px-4">
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
              value={data.birthDate ? formatDate(data.birthDate) : null}
            />
            <FieldRow label="Birth Place" value={humanizeTitle(data.birthPlace ?? "")} />
          </dl>
        </div>
      </section>

      <section>
        <SectionLabel>Contact Information</SectionLabel>
        <div className="mt-3 grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2">
          <ContactRow icon={<Mail className="size-4" />} label="Email">
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
          </ContactRow>
          <ContactRow icon={<Phone className="size-4" />} label="Phone">
            {data.contactNumber || data.mobileNumber || <EmptyValue />}
          </ContactRow>
          <ContactRow
            icon={<Calendar className="size-4" />}
            label="Birth Date"
          >
            {data.birthDate ? formatDate(data.birthDate) : <EmptyValue />}
          </ContactRow>
          <ContactRow icon={<MapPin className="size-4" />} label="Address">
            {[data.presentAddress, data.city, data.province, data.country]
              .filter(Boolean)
              .join(", ") || <EmptyValue />}
          </ContactRow>
        </div>
      </section>

      <section>
        <SectionLabel>Character References</SectionLabel>
        {charRefs.length === 0 ? (
          <div className="mt-3 flex min-h-[120px] items-center border border-border bg-card">
            <p className="p-4 text-sm italic text-muted-foreground">
              No character references provided
            </p>
          </div>
        ) : (
          /* ONE ledger sheet — hairline-parted reference rows, quiet inks,
             plain names (no ghost numerals, no staggered entrances). */
          <div className="mt-3 max-h-[60vh] divide-y divide-border overflow-y-auto border border-border bg-card">
            {charRefs.map((ref, i) => (
              <div key={i} className="px-4 py-3.5">
                <p className="text-sm font-medium text-foreground">
                  {humanizeName(ref.name || "Unnamed")}
                </p>
                {(ref.title || ref.company || ref.email || ref.contact) && (
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {ref.title && <span>{humanizeTitle(ref.title)}</span>}
                    {ref.title && ref.company && <Dot />}
                    {ref.company && <span>{humanizeTitle(ref.company)}</span>}
                    {ref.email && (
                      <>
                        <Dot />
                        <span className="break-all">{ref.email}</span>
                      </>
                    )}
                    {ref.contact && (
                      <>
                        <Dot />
                        <span className="tabular-nums">{ref.contact}</span>
                      </>
                    )}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 bg-card p-3.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        <div className="mt-0.5 text-sm text-foreground">{children}</div>
      </div>
    </div>
  );
}

function EmptyValue() {
  return <span className="text-muted-foreground/50">—</span>;
}

// ============================================================================
// Entity list — read-only renderer for child sections
// (education / experience / training / eligibility / awards)
// ONE continuous ledger container, hairline-parted rows (rows render through
// the shared FieldRow snapshot renderers). Quiet hairline toolbar above the
// sheet carries the micro-label + N entries count. No ghost numerals, no
// staggered entrances — a plain quiet ledger.
// ============================================================================
function EntityList({
  title,
  description,
  emptyTitle,
  items,
  render,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  items: Record<string, unknown>[];
  render: (item: Record<string, unknown>) => ReactNode;
}) {
  return (
    <section>
      {/* Hairline toolbar — quiet micro-label + N entries count (border-b pb-3). */}
      <div className="flex items-baseline justify-between border-b border-border pb-3">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </p>
        <p className="text-sm font-medium tabular-nums text-muted-foreground">
          {items.length} entr{items.length === 1 ? "y" : "ies"}
        </p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>

      {items.length === 0 ? (
        <div className="mt-3 border border-border bg-card">
          <EmptyState title={emptyTitle} />
        </div>
      ) : (
        <div className="mt-3 max-h-[60vh] divide-y divide-border overflow-y-auto border border-border bg-card">
          {items.map((item, i) => (
            <div key={i} className="px-4 py-4">
              <dl>
                {render(humanizeRecord(item))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// Documents tab — ONE ledger sheet of document rows (hairline-parted, token
// inks, plain hover tint, quiet forward affordance). Hairline toolbar above
// the sheet carries the micro-label + N documents count.
// ============================================================================
function DocumentsTab({ documents }: { documents: ApplicantDocument[] }) {
  if (documents.length === 0) {
    return (
      <section>
        {/* Hairline toolbar — quiet micro-label + N documents count (border-b pb-3). */}
        <div className="flex items-baseline justify-between border-b border-border pb-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Supporting Documents
          </p>
          <p className="text-sm font-medium tabular-nums text-muted-foreground">
            0 documents
          </p>
        </div>
        <div className="mt-3 border border-border bg-card">
          <EmptyState
            title="No documents uploaded"
            description="This applicant has not uploaded any files yet."
          />
        </div>
      </section>
    );
  }

  return (
    <section>
      {/* Hairline toolbar — quiet micro-label + N documents count (border-b pb-3). */}
      <div className="flex items-baseline justify-between border-b border-border pb-3">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Supporting Documents
        </p>
        <p className="text-sm font-medium tabular-nums text-muted-foreground">
          {documents.length} {documents.length === 1 ? "document" : "documents"}
        </p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Files uploaded by the applicant — click to open in a new tab.
      </p>
      <div className="mt-3 max-h-[60vh] divide-y divide-border overflow-y-auto border border-border bg-card">
        {documents.map((d, i) => (
          <DocumentLink key={d.id} doc={d} index={i} />
        ))}
      </div>
    </section>
  );
}

function DocumentLink({ doc: d, index }: { doc: ApplicantDocument; index: number }) {
  const statusMeta = DOC_STATUS_META[d.status] || {
    label: d.status || "Unknown",
    color: "text-muted-foreground",
    bg: "bg-secondary",
  };
  const catLabel = CATEGORY_LABEL[d.category] || d.category;
  // Ledger row — quiet muted index, bg-muted file tile, plain file name,
  // single hover tint. The status chip stays: it is DATA, not decoration.
  return (
    <a
      href={`/api/files/${d.filePath}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full items-center gap-3 px-4 py-3.5 transition-colors hover:bg-accent/40"
    >
      {/* Row index — quiet, desktop only */}
      <span
        aria-hidden
        className="hidden shrink-0 text-xs tabular-nums text-muted-foreground/60 sm:inline"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="grid size-9 shrink-0 place-items-center bg-muted">
        <FileText className="size-4 text-muted-foreground" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {d.originalName}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{catLabel}</span>
          <Dot />
          <span className="tabular-nums">{formatFileSize(d.size)}</span>
          <Dot />
          <span>
            Uploaded <span className="tabular-nums">{formatDate(d.createdAt)}</span>
          </span>
        </span>
      </span>
      <span
        className={`inline-flex shrink-0 items-center border px-2 py-0.5 text-xs font-medium ${docStatusChipCls(d.status)}`}
      >
        {statusMeta.label}
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/40" />
    </a>
  );
}

// ============================================================================
// Applications tab — applicant's application history
// Hairline toolbar above the sheet carries the micro-label + N applications
// count. Rows keep the StatusIndicator pill (status is DATA) and jump to the
// review workspace on click.
// ============================================================================
function ApplicationsTab({
  applications,
}: {
  applications: ApplicationHistoryItem[];
}) {
  const { navigate } = useNav();

  if (applications.length === 0) {
    return (
      <section>
        {/* Hairline toolbar — quiet micro-label + N applications count (border-b pb-3). */}
        <div className="flex items-baseline justify-between border-b border-border pb-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Application History
          </p>
          <p className="text-sm font-medium tabular-nums text-muted-foreground">
            0 applications
          </p>
        </div>
        <div className="mt-3 border border-border bg-card">
          <EmptyState
            title="No applications"
            description="This applicant has not submitted any applications."
          />
        </div>
      </section>
    );
  }

  return (
    <section>
      {/* Hairline toolbar — quiet micro-label + N applications count (border-b pb-3). */}
      <div className="flex items-baseline justify-between border-b border-border pb-3">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Application History
        </p>
        <p className="text-sm font-medium tabular-nums text-muted-foreground">
          {applications.length} {applications.length === 1 ? "application" : "applications"}
        </p>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Positions this applicant has applied for — click to open the review workspace.
      </p>
      <div className="mt-3 max-h-[60vh] divide-y divide-border overflow-y-auto border border-border bg-card">
        {applications.map((app, i) => (
          <button
            key={app.id}
            onClick={() => navigate("evaluator-review", { id: String(app.id) })}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/40"
          >
            {/* Row index — quiet, desktop only */}
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
                <span className="tabular-nums">{formatDate(app.dateApplied)}</span>
              </span>
            </span>
            {app.status && (
              <StatusIndicator status={app.status} size="sm" />
            )}
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/40" />
          </button>
        ))}
      </div>
    </section>
  );
}

// ============================================================================
// Loading skeleton
// ============================================================================
// ---- Local doc-status chip tone (mode-tuned; label still from DOC_STATUS_META)
function docStatusChipCls(status: string): string {
  const s = String(status || "").toUpperCase();
  if (s === "FAILED")
    return "border-destructive/40 bg-destructive/10 text-danger-ink";
  if (s === "EXTRACTED")
    return "border-success/40 bg-success/10 text-success-ink";
  if (s === "PROCESSING" || s === "PARTIALLY_EXTRACTED" || s === "NEEDS_REVIEW")
    return "border-warning/40 bg-warning/10 text-warning-ink";
  return "border-border bg-secondary text-muted-foreground";
}

function DetailSkeleton() {
  // Mirrors the quiet layout — compact header (back link + overline + title +
  // meta bar) → 4 flat bordered KPI tiles → tabs strip → ONE hairline ledger
  // sheet. Raw bg-muted pulse divs (guide-approved skeleton treatment).
  return (
    <div>
      {/* Back link skeleton */}
      <div className="h-3 w-24 animate-pulse bg-muted" />
      {/* Compact header skeleton */}
      <div className="mb-6 mt-3 border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="h-3 w-32 animate-pulse bg-muted" />
            <div className="h-5 w-64 animate-pulse bg-muted" />
            {/* Meta bar — responsive width so it never overflows on 390
                (w-72 fits in the 358px content area at mobile, w-96 fills
                the wider desktop meta line). */}
            <div className="h-4 w-72 animate-pulse bg-muted sm:w-96" />
          </div>
          <div className="h-8 w-24 shrink-0 animate-pulse bg-muted" />
        </div>
      </div>
      {/* KPI tile skeleton — 4 flat bordered tiles (label bar + figure bar +
          description bar each). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border border-border bg-card p-4">
            <div className="h-3 w-24 animate-pulse bg-muted" />
            <div className="mt-2 h-6 w-12 animate-pulse bg-muted" />
            <div className="mt-2 h-3 w-28 animate-pulse bg-muted" />
          </div>
        ))}
      </div>
      {/* Tabs strip skeleton */}
      <div className="mt-4 h-10 w-full max-w-2xl animate-pulse bg-muted" />
      {/* Ledger sheet skeleton */}
      <div className="mt-4 divide-y divide-border border border-border bg-card">
        {[1, 2, 3].map((i) => (
          <div key={i} className="px-4 py-4">
            <div className="h-2.5 w-16 animate-pulse bg-muted" />
            <div className="mt-3 h-3 w-3/4 animate-pulse bg-muted" />
            <div className="mt-2 h-3 w-1/2 animate-pulse bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
