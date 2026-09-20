// =============================================================================
// RMIS — Profile View: Personal Information Section (Accenture language)
// Flat sharp cards on the mode-aware canvas — no rounded corners, no shadows.
//
// Mobile ergonomics: the section used to render all four sub-groups (Identity,
// Address, Legal, Character References ≈ 25 fields) expanded — a wall of
// inputs several screens tall. Sub-groups are now disclosures with fill-state
// summaries (core groups open, supplementary ones collapsed on phones) and
// short sibling fields are paired two-per-row, so the section fits in roughly
// one screen. While the form is dirty a fixed bottom bar keeps "Save" in
// thumb reach (the in-header button hides on mobile to avoid duplication).
// =============================================================================

"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

import { toast } from "sonner";
import {
  User,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  Sparkles,
  AlertCircle,
  ChevronDown,
  Users,
  MapPin,
  Scale,
} from "lucide-react";
import {
  CharacterReference,
  parseCharRefs,
  serializeCharRefs,
  emptyCharacterReference,
} from "./types";
import {
  SectionHeader,
  FieldWithExtraction,
  SelectField,
  RefInput,
  YesNoField,
} from "./form-fields";

// Extraction is owned exclusively by the PDS Upload · Auto-Extraction strip
// (which auto-applies server-side and reloads saved data). This legacy
// highlight set is kept optional and defaults to empty — no field is ever
// marked "from extraction" in the current flow.
const EMPTY_EXTRACTION_FIELDS = new Set<string>();

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

// Field keys behind each disclosure's "X of N completed" summary. isPwd is
// excluded from Identity's count — it is a Yes/No toggle with a default, so
// counting it would flatter empty forms.
const IDENTITY_KEYS = [
  "firstName", "middleName", "lastName", "extensionName",
  "emailAddress", "mobileNumber", "contactNumber",
  "birthDate", "birthPlace", "gender", "civilStatus",
  "citizenship", "religion", "ethnicity",
] as const;
const ADDRESS_KEYS = ["presentAddress", "city", "province", "country", "zipCode"] as const;

function countFilled(form: Record<string, string | boolean | null>, keys: readonly string[]) {
  return keys.filter((k) => String(form[k] ?? "").trim().length > 0).length;
}

// Client-side media query — this view only mounts after login (pure client
// SPA), so a lazy matchMedia initializer is hydration-safe.
function matchPhone() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches
  );
}

// Breakpoint defaults for the four disclosure groups: on phones only the core
// groups (Identity/Address) start open — Legal and Character References
// collapse to one-line headers. Desktop starts all-open. Re-applied when the
// breakpoint is crossed so narrow→wide resizes don't inherit phone defaults.
function groupDefaults(phone: boolean): Record<string, boolean> {
  return { identity: true, address: true, legal: !phone, refs: !phone };
}

function useDisclosureGroups() {
  const [isPhone, setIsPhone] = useState(matchPhone);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(
    () => groupDefaults(matchPhone())
  );
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = () => {
      setIsPhone(mql.matches);
      setOpenGroups(groupDefaults(mql.matches));
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const toggle = (id: string) =>
    setOpenGroups((g) => ({ ...g, [id]: !(g[id] ?? true) }));
  return { isPhone, openGroups, toggle };
}

// -----------------------------------------------------------------------------
// SubSection — collapsible group INSIDE the section's single white surface.
// A hairline divides groups; the head row is compact enterprise metadata
// (icon + title, muted fill-state summary, subtle chevron). Controlled by the
// parent's openGroups map (breakpoint-aware defaults — see groupDefaults).
// -----------------------------------------------------------------------------
function SubSection({
  title,
  icon: Icon,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left transition-colors hover:bg-secondary/40 sm:px-6"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </h3>
        {summary && (
          <span className="ml-auto hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
            {summary}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className={`ml-auto size-4 shrink-0 text-muted-foreground/70 transition-transform duration-200 sm:ml-3 ${open ? "" : "-rotate-90"}`}
          strokeWidth={1.5}
        />
      </button>
      {open && <div className="border-t border-border/70">{children}</div>}
    </section>
  );
}

export function PersonalInfoSection({
  form,
  fromExtraction = EMPTY_EXTRACTION_FIELDS,
  dirty,
  saving,
  autosave = "idle",
  onChange,
  onSave,
}: {
  form: Record<string, string | boolean | null>;
  fromExtraction?: Set<string>;
  dirty: boolean;
  saving: boolean;
  /** Google-Forms-style autosave state — rendered as a quiet indicator next to Save. */
  autosave?: AutosaveStatus;
  onChange: (key: string, value: string | boolean | null) => void;
  onSave: () => void;
}) {
  const charRefs = useMemo(
    () => parseCharRefs((form.characterReferences as string) || null),
    [form.characterReferences]
  );

  const { openGroups, toggle } = useDisclosureGroups();

  function updateCharRef(idx: number, field: keyof CharacterReference, value: string) {
    const next = [...charRefs];
    next[idx] = { ...next[idx], [field]: value };
    onChange("characterReferences", serializeCharRefs(next));
  }

  function addCharRef() {
    if (charRefs.length >= 5) {
      toast.info("Maximum 5 character references allowed");
      return;
    }
    const next = [...charRefs, emptyCharacterReference()];
    onChange("characterReferences", serializeCharRefs(next));
  }

  function removeCharRef(idx: number) {
    if (charRefs.length <= 1) {
      toast.info("At least one character reference is recommended");
      return;
    }
    const next = charRefs.filter((_, i) => i !== idx);
    onChange("characterReferences", serializeCharRefs(next));
  }

  // Autosave indicator — shared by the header action slot (desktop) and the
  // fixed mobile save bar. Reads as quiet "last saved" metadata.
  const autosaveIndicator = (
    <span aria-live="polite" className="inline-flex items-center gap-1.5 text-xs font-medium">
      {autosave === "saving" && (
        <>
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Saving…</span>
        </>
      )}
      {autosave === "saved" && (
        <>
          <CheckCircle2 className="size-3.5 text-success" />
          <span className="text-muted-foreground">Changes saved</span>
        </>
      )}
      {autosave === "error" && (
        <>
          <AlertCircle className="size-3.5 text-danger-ink" />
          <span className="text-danger-ink">Save failed — click Save Changes</span>
        </>
      )}
    </span>
  );

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Personal Information"
        description="Your identity, contact details, and legal declarations."
        icon={User}
        action={
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
            {autosaveIndicator}
            {/* Explicit Save lives in the header on ≥ md; on phones it moves
                to the fixed bottom bar below so it stays in thumb reach while
                scrolled deep into the form. */}
            <Button
              onClick={onSave}
              disabled={!dirty || saving}
              size="sm"
              className="hidden h-9 px-4 text-[13px] md:inline-flex"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" strokeWidth={1.5} />
              )}
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        }
      />

      {fromExtraction.size > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-primary/35 bg-primary/10 px-3.5 py-2.5 text-xs leading-relaxed text-info-ink">
          <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-info-ink" />
          <span>
            <strong>{fromExtraction.size} fields</strong> were pre-filled from your
            uploaded documents. Please verify each highlighted field before saving.
          </span>
        </div>
      )}

      {/* FORM SURFACE — ONE clean bordered container; groups are separated
          by hairlines instead of floating as independent cards. */}
      <div className="pui-card overflow-hidden">
      {/* IDENTITY */}
      <SubSection
        title="Identity"
        icon={User}
        summary={`${countFilled(form, IDENTITY_KEYS)} of ${IDENTITY_KEYS.length} completed`}
        open={openGroups.identity ?? true}
        onToggle={() => toggle("identity")}
      >
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 p-4 sm:p-6 md:grid-cols-2 lg:grid-cols-3">
          <FieldWithExtraction
            label="First Name"
            value={form.firstName as string}
            fromExtraction={fromExtraction.has("firstName")}
            onChange={(v) => onChange("firstName", v)}
            placeholder="Juan"
            required
          />
          <FieldWithExtraction
            label="Middle Name"
            value={form.middleName as string}
            fromExtraction={fromExtraction.has("middleName")}
            onChange={(v) => onChange("middleName", v)}
            placeholder="Santos"
          />
          <FieldWithExtraction
            label="Last Name"
            value={form.lastName as string}
            fromExtraction={fromExtraction.has("lastName")}
            onChange={(v) => onChange("lastName", v)}
            placeholder="Dela Cruz"
            required
          />
          <FieldWithExtraction
            label="Extension Name"
            value={form.extensionName as string}
            fromExtraction={fromExtraction.has("extensionName")}
            onChange={(v) => onChange("extensionName", v)}
            placeholder="Jr., Sr., III"
          />
          <FieldWithExtraction
            label="Email Address"
            value={form.emailAddress as string}
            fromExtraction={fromExtraction.has("emailAddress")}
            onChange={(v) => onChange("emailAddress", v)}
            type="email"
            placeholder="Enter your email address"
            required
            helper="Interview invites and job offers are sent here."
          />
          <FieldWithExtraction
            label="Mobile Number"
            value={form.mobileNumber as string}
            fromExtraction={fromExtraction.has("mobileNumber")}
            onChange={(v) => onChange("mobileNumber", v)}
            placeholder="09XXXXXXXXX"
            helper="Format: 09XXXXXXXXX · 11 digits"
          />
          <FieldWithExtraction
            label="Contact Number"
            value={form.contactNumber as string}
            fromExtraction={fromExtraction.has("contactNumber")}
            onChange={(v) => onChange("contactNumber", v)}
            placeholder="(02) 8XXX-XXXX"
          />
          <FieldWithExtraction
            label="Date of Birth"
            value={form.birthDate as string}
            fromExtraction={fromExtraction.has("birthDate")}
            onChange={(v) => onChange("birthDate", v)}
            type="date"
          />
          <FieldWithExtraction
            label="Place of Birth"
            value={form.birthPlace as string}
            fromExtraction={fromExtraction.has("birthPlace")}
            onChange={(v) => onChange("birthPlace", v)}
            placeholder="e.g. Quezon City"
          />
          {/* Short siblings pair two-per-row even on phones — halves the wall
              without cramping longer fields. The pair wrapper occupies one
              cell of the parent grid at md+. */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <SelectField
              label="Gender"
              value={form.gender as string}
              fromExtraction={fromExtraction.has("gender")}
              onChange={(v) => onChange("gender", v)}
              options={[
                { value: "Male", label: "Male" },
                { value: "Female", label: "Female" },
              ]}
              placeholder="Select"
            />
            <SelectField
              label="Civil Status"
              value={form.civilStatus as string}
              fromExtraction={fromExtraction.has("civilStatus")}
              onChange={(v) => onChange("civilStatus", v)}
              options={[
                { value: "Single", label: "Single" },
                { value: "Married", label: "Married" },
                { value: "Widowed", label: "Widowed" },
                { value: "Separated", label: "Separated" },
                { value: "Divorced", label: "Divorced" },
              ]}
              placeholder="Select"
            />
          </div>
          <FieldWithExtraction
            label="Citizenship"
            value={form.citizenship as string}
            fromExtraction={fromExtraction.has("citizenship")}
            onChange={(v) => onChange("citizenship", v)}
            placeholder="e.g. Filipino"
          />
          <FieldWithExtraction
            label="Religion"
            value={form.religion as string}
            fromExtraction={fromExtraction.has("religion")}
            onChange={(v) => onChange("religion", v)}
          />
          <YesNoField
            label="PWD (Person with Disability)"
            value={form.isPwd ? "Yes" : "No"}
            onChange={(v) => onChange("isPwd", v === "Yes")}
            helper="Declared for accommodation and quota compliance."
          />
          <FieldWithExtraction
            label="Ethnicity / Indigenous Group"
            value={form.ethnicity as string}
            fromExtraction={fromExtraction.has("ethnicity")}
            onChange={(v) => onChange("ethnicity", v)}
          />
        </div>
      </SubSection>

      {/* ADDRESS */}
      <SubSection
        title="Address"
        icon={MapPin}
        summary={`${countFilled(form, ADDRESS_KEYS)} of ${ADDRESS_KEYS.length} completed`}
        open={openGroups.address ?? true}
        onToggle={() => toggle("address")}
      >
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 p-4 sm:p-6 md:grid-cols-2 lg:grid-cols-3">
          <div className="md:col-span-2 lg:col-span-3">
            <FieldWithExtraction
              label="Present Address"
              value={form.presentAddress as string}
              fromExtraction={fromExtraction.has("presentAddress")}
              onChange={(v) => onChange("presentAddress", v)}
              placeholder="House no., street, barangay"
            />
          </div>
          <FieldWithExtraction
            label="City"
            value={form.city as string}
            fromExtraction={fromExtraction.has("city")}
            onChange={(v) => onChange("city", v)}
            placeholder="e.g. Quezon City"
          />
          <FieldWithExtraction
            label="Province"
            value={form.province as string}
            fromExtraction={fromExtraction.has("province")}
            onChange={(v) => onChange("province", v)}
            placeholder="e.g. Metro Manila"
          />
          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <FieldWithExtraction
              label="Country"
              value={form.country as string}
              fromExtraction={fromExtraction.has("country")}
              onChange={(v) => onChange("country", v)}
              placeholder="Philippines"
            />
            <FieldWithExtraction
              label="Zip Code"
              value={form.zipCode as string}
              fromExtraction={fromExtraction.has("zipCode")}
              onChange={(v) => onChange("zipCode", v)}
              placeholder="e.g. 1101"
            />
          </div>
        </div>
      </SubSection>

      {/* LEGAL — collapsed by default on phones (most applicants answer No/No;
          the summary communicates scope without the two selects in view). */}
      <SubSection
        title="Legal Information"
        icon={Scale}
        summary="2 yes/no declarations"
        open={openGroups.legal ?? true}
        onToggle={() => toggle("legal")}
      >
        <div className="space-y-4 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
            <YesNoField
              label="Have you ever been found guilty of any administrative offense?"
              value={form.adminCase ? "Yes" : "No"}
              onChange={(v) => onChange("adminCase", v === "Yes")}
            />
            {form.adminCase && (
              <FieldWithExtraction
                label="Administrative Offense Details"
                value={form.adminCaseDetails as string}
                fromExtraction={false}
                onChange={(v) => onChange("adminCaseDetails", v)}
              />
            )}
            <YesNoField
              label="Have you been criminally charged before any court?"
              value={form.crimeCharge ? "Yes" : "No"}
              onChange={(v) => onChange("crimeCharge", v === "Yes")}
            />
            {form.crimeCharge && (
              <>
                <FieldWithExtraction
                  label="Criminal Charge Date"
                  value={form.crimeDate as string}
                  fromExtraction={false}
                  onChange={(v) => onChange("crimeDate", v)}
                  type="date"
                />
                <FieldWithExtraction
                  label="Case Status"
                  value={form.crimeCaseStatus as string}
                  fromExtraction={false}
                  onChange={(v) => onChange("crimeCaseStatus", v)}
                  placeholder="Pending, Dismissed, etc."
                />
              </>
            )}
          </div>
        </div>
      </SubSection>

      {/* CHARACTER REFERENCES — collapsed by default on phones */}
      <SubSection
        title="Character References"
        icon={Users}
        summary={`${Math.min(charRefs.length, 5)} of 5 added`}
        open={openGroups.refs ?? true}
        onToggle={() => toggle("refs")}
      >
        <div className="space-y-3 p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              At least 1 reference recommended (max 5)
            </p>
            <Button
              onClick={addCharRef}
              variant="outline"
              size="sm"
            >
              <Plus className="h-3.5 w-3.5" /> Add Reference
            </Button>
          </div>
          {charRefs.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No character references yet. Click &quot;Add Reference&quot; to add one.
            </div>
          ) : (
            <div className="sm:max-h-[480px] sm:overflow-y-auto sm:pr-2">
              <div className="space-y-3 pr-1">
                {charRefs.map((ref, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-border/70 bg-secondary/50 p-4 transition-colors hover:border-primary/30"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="kicker text-muted-foreground">
                        Reference {idx + 1}
                        {ref.name?.trim() ? ` · ${ref.name.trim()}` : ""}
                      </span>
                      {charRefs.length > 1 && (
                        <Button
                          onClick={() => removeCharRef(idx)}
                          variant="ghost"
                          size="icon"
                          className="size-11 sm:size-8 rounded-none text-muted-foreground hover:bg-destructive/10 hover:text-danger-ink"
                          aria-label="Remove reference"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <RefInput
                        label="Full Name"
                        value={ref.name}
                        onChange={(v) => updateCharRef(idx, "name", v)}
                      />
                      <RefInput
                        label="Job Title"
                        value={ref.title}
                        onChange={(v) => updateCharRef(idx, "title", v)}
                      />
                      <RefInput
                        label="Company Name"
                        value={ref.company}
                        onChange={(v) => updateCharRef(idx, "company", v)}
                      />
                      <RefInput
                        label="Company Address"
                        value={ref.companyAddress}
                        onChange={(v) => updateCharRef(idx, "companyAddress", v)}
                        className="md:col-span-2"
                      />
                      <RefInput
                        label="Email"
                        value={ref.email}
                        onChange={(v) => updateCharRef(idx, "email", v)}
                        type="email"
                      />
                      <RefInput
                        label="Contact Number"
                        value={ref.contact}
                        onChange={(v) => updateCharRef(idx, "contact", v)}
                        placeholder="09XXXXXXXXX"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SubSection>
      </div>

      {/* FIXED MOBILE SAVE BAR — appears only while the form is dirty; keeps
          the explicit flush in thumb reach no matter how far the applicant has
          scrolled. Desktop keeps the in-header button (no duplication). */}
      {dirty && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-6px_20px_-8px_rgb(9_14_24/0.25)] backdrop-blur md:hidden"
          role="toolbar"
          aria-label="Save changes"
        >
          <div className="mx-auto flex max-w-xl items-center gap-3">
            {autosaveIndicator}
            <Button
              onClick={onSave}
              disabled={saving}
              className="ml-auto"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
