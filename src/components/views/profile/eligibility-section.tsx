// =============================================================================
// RMIS — Profile View: Eligibility Section (premium scope)
// Entity cards on the premium canvas, following the education-section
// reference: ResponsiveFormDialog (bottom sheet on phones / dialog on
// desktop), inline field validation with an error digest, and the
// unsaved-changes guard. The CSC eligibility registry logic (type-specific
// field specs, legacy-name healing, free-text "Others" mode) is unchanged.
//
// EMPTY-SECTION FLOW: when a section has no entries, the entry form itself is
// rendered inline in the card (no empty-state blank page) — the applicant can
// type straight into it. Once entries exist they list here, and the header
// "Add Eligibility" button opens the dialog for additional entries.
// =============================================================================

"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/client";
import { ShieldCheck, Plus, CircleAlert, Lock, Loader2 } from "lucide-react";
import { EligibilityItem, ReferenceData, toISODate, isPendingId } from "./types";
import {
  mergeEligibilityOptions,
  normalizeLegacyEligibilityName,
  getEligibilityFieldSpec,
  getEligibilityDescription,
  isCustomEligibilityTitle,
  EligibilityFieldSpec,
} from "@/lib/csc-requirements";
import {
  SectionHeader,
  EntityCard,
  FormField,
} from "./form-fields";
import { ResponsiveFormDialog } from "./form-dialog";

// Empty draft for the always-visible inline create form (empty section) —
// identical to what openCreate() seeds for the dialog.
const EMPTY_DRAFT = {
  eligibilityTitle: "",
  eligibilityTitleCustom: "",
  rating: "",
  examDate: "",
  examPlace: "",
  licenseNumber: "",
  licenseValidity: "",
};

// Sentinel value used in the eligibility title <Select> to indicate that the
// user wants to type a custom eligibility that isn't in the predefined list.
// When this is selected the form collapses to ONE huge free-text textarea —
// no typed detail fields — whose content is stored verbatim as the entry's
// eligibility title.
const OTHERS_VALUE = "__OTHERS__";

// Build the display rows for one saved eligibility card. Only the fields
// relevant to that eligibility's TYPE are shown (exam-based types show
// Rating/Exam Date/Exam Place, Bar/Board adds license fields, conferment
// types show Date/Place of Conferment) — see getEligibilityFieldSpec.
// Free-text "Others" entries (custom titles) show ONLY the title plus any
// legacy detail data that actually has a value — never a wall of "—" rows.
function eligibilityCardRows(item: EligibilityItem) {
  const custom = isCustomEligibilityTitle(item.eligibilityTitle);
  const spec = getEligibilityFieldSpec(item.eligibilityTitle);
  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Title", value: item.eligibilityTitle },
  ];
  const keep = (v: string | null) => (custom ? !!v : true);
  if (spec.rating && keep(item.rating))
    rows.push({ label: spec.rating.label, value: item.rating });
  if (spec.examDate && keep(item.examDate ? item.examDate : null))
    rows.push({
      label: spec.examDate.label,
      value: item.examDate ? formatDate(item.examDate) : null,
    });
  if (spec.examPlace && keep(item.examPlace))
    rows.push({ label: spec.examPlace.label, value: item.examPlace });
  if (spec.licenseNumber && keep(item.licenseNumber))
    rows.push({ label: spec.licenseNumber.label, value: item.licenseNumber });
  if (spec.licenseValidity && keep(item.licenseValidity ? item.licenseValidity : null))
    rows.push({
      label: spec.licenseValidity.label,
      value: item.licenseValidity ? formatDate(item.licenseValidity) : null,
    });
  return rows;
}

export function EligibilitySection({
  items,
  reference,
  onCreate,
  onUpdate,
  onDelete,
}: {
  items: EligibilityItem[];
  reference: ReferenceData | null;
  onCreate: (payload: Record<string, unknown>) => Promise<EligibilityItem | null>;
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EligibilityItem | null>(null);
  const [saving, setSaving] = useState(false);
  // Draft seeded AT FIRST RENDER — the inline create form (empty section)
  // mounts with its values already set, so selects never flip undefined →
  // defined after mount (that flip leaves Radix's closed trigger showing
  // the placeholder even when a value is selected).
  const [form, setForm] = useState<Record<string, string>>(() => ({ ...EMPTY_DRAFT }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Snapshot captured when the dialog opens — drives the unsaved-changes guard.
  const [baseline, setBaseline] = useState(() => JSON.stringify(EMPTY_DRAFT));
  const dirty = JSON.stringify(form) !== baseline;

  // Dropdown choices = the SAME standard CSC eligibility registry the job
  // posting form uses for its eligibility requirement (see
  // src/lib/csc-requirements.ts), merged with any DB reference rows so legacy
  // entries (e.g. "Career Service Professional") and HR-added custom rows
  // remain selectable. Keeping both sides on one list means an applicant's
  // saved title matches the job's required eligibility verbatim for the MQR
  // engine (src/lib/mqr.ts).
  const eligibilityOptions = useMemo(
    () => mergeEligibilityOptions(reference?.eligibilities?.map((e) => e.name) ?? []),
    [reference]
  );

  // Field spec for the CURRENTLY SELECTED eligibility type — each type has
  // its own set of detail fields (see csc-requirements.ts):
  //   * Career Service exam eligibilities → Rating, Exam Date, Exam Place
  //   * Bar/Board (RA 1080) → Board Rating/Exam fields + License No./Validity
  //   * Conferment types (Honor Graduate, Barangay Official, Veteran,
  //     Solo Parent, S&T Specialist) → Date/Place of Conferment (no exam)
  //   * "Others" → NO detail fields at all — one huge free-text textarea
  //     replaces them (see the OTHERS_VALUE render block below).
  // No type selected yet → null (render no detail fields).
  const selectedSpec: EligibilityFieldSpec | null =
    !form.eligibilityTitle || form.eligibilityTitle === OTHERS_VALUE
      ? null
      : getEligibilityFieldSpec(form.eligibilityTitle);

  function openCreate() {
    setEditing(null);
    const next = { ...EMPTY_DRAFT };
    setForm(next);
    setBaseline(JSON.stringify(next));
    setErrors({});
    setOpen(true);
  }

  function openEdit(item: EligibilityItem) {
    setEditing(item);
    // Normalize legacy short titles ("Career Service Professional") to their
    // official registry strings so a legacy-titled entry pre-selects the
    // standard option — and re-saves under the official name (self-healing).
    // If the (normalized) title still isn't a dropdown option, fall back to
    // "Others" and populate the custom title field so the user can edit
    // their custom value.
    const normalizedTitle = normalizeLegacyEligibilityName(item.eligibilityTitle);
    const isKnown =
      !!normalizedTitle && eligibilityOptions.includes(normalizedTitle);
    const next = {
      eligibilityTitle: isKnown ? normalizedTitle : OTHERS_VALUE,
      eligibilityTitleCustom: isKnown ? "" : item.eligibilityTitle ?? "",
      rating: item.rating ?? "",
      examDate: toISODate(item.examDate) ?? "",
      examPlace: item.examPlace ?? "",
      licenseNumber: item.licenseNumber ?? "",
      licenseValidity: toISODate(item.licenseValidity) ?? "",
    };
    setForm(next);
    setBaseline(JSON.stringify(next));
    setErrors({});
    setOpen(true);
  }

  function updateField(key: string, value: string) {
    setForm((p) => ({ ...p, [key]: value }));
    // Inline validation clears the moment the applicant starts fixing it.
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function validate(): string[] {
    const e: Record<string, string> = {};
    if (form.eligibilityTitle === OTHERS_VALUE && !form.eligibilityTitleCustom?.trim())
      e.eligibilityTitleCustom = "Please type your eligibility title.";
    if (!form.eligibilityTitle)
      e.eligibilityTitle = "Eligibility title is required.";
    setErrors(e);
    return Object.values(e);
  }

  async function submit() {
    if (validate().length > 0) return;
    setSaving(true);
    // Resolve the final title: if the user picked "Others", use the custom
    // text they typed; otherwise use the selected predefined option.
    const finalTitle =
      form.eligibilityTitle === OTHERS_VALUE
        ? form.eligibilityTitleCustom
        : form.eligibilityTitle;
    // Only persist fields relevant to the selected type — switching a type
    // clears the fields that don't apply instead of leaking stale values
    // (e.g. a license number left over from a previously selected Bar/Board).
    // "Others" entries are pure free text: ALL detail fields are nulled so
    // only the typed eligibility text is saved.
    const isOthers = form.eligibilityTitle === OTHERS_VALUE;
    const spec = isOthers ? null : getEligibilityFieldSpec(form.eligibilityTitle);
    const payload: Record<string, unknown> = {
      eligibilityTitle: finalTitle || null,
      rating: (spec?.rating && form.rating) || null,
      examDate: (spec?.examDate && form.examDate) || null,
      examPlace: (spec?.examPlace && form.examPlace) || null,
      licenseNumber: (spec?.licenseNumber && form.licenseNumber) || null,
      licenseValidity: (spec?.licenseValidity && form.licenseValidity) || null,
    };
    try {
      if (editing) {
        if (isPendingId(editing.id)) {
          await onCreate(payload);
          await onDelete(editing.id);
        } else {
          await onUpdate(editing.id, payload);
        }
      } else {
        await onCreate(payload);
      }
      setOpen(false);
      // Reset the draft so the inline create form (if this section renders
      // empty again later) starts clean instead of showing saved values.
      setForm({ ...EMPTY_DRAFT });
      setBaseline(JSON.stringify(EMPTY_DRAFT));
      setErrors({});
    } finally {
      setSaving(false);
    }
  }

  // Shared field set — rendered inside the dialog AND inline in the
  // empty-section create card (one source of truth for the form grammar).
  const fields = (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="md:col-span-2 space-y-1.5">
        <Label className="text-[13px] font-medium leading-tight text-foreground">
          Eligibility Title <span className="ml-0.5 text-danger-ink">*</span>
        </Label>
        <Select
          value={form.eligibilityTitle}
          onValueChange={(v) => updateField("eligibilityTitle", v)}
        >
          <SelectTrigger
            aria-invalid={errors.eligibilityTitle ? true : undefined}
            className="h-11 w-full"
          >
            <SelectValue placeholder="Select an eligibility" />
          </SelectTrigger>
          <SelectContent className="premium max-h-80">
            {eligibilityOptions.map((name) => (
              <SelectItem
                key={name}
                value={name}
                description={getEligibilityDescription(name)}
              >
                {name}
              </SelectItem>
            ))}
            <SelectItem
              value={OTHERS_VALUE}
              description="Your eligibility isn't listed above — type it in full below."
            >
              Others (type manually)
            </SelectItem>
          </SelectContent>
        </Select>
        {form.eligibilityTitle &&
          form.eligibilityTitle !== OTHERS_VALUE && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {getEligibilityDescription(form.eligibilityTitle)}
            </p>
          )}
        {errors.eligibilityTitle && (
          <p className="flex items-start gap-1 text-xs font-medium text-danger-ink">
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            <span>{errors.eligibilityTitle}</span>
          </p>
        )}
        {form.eligibilityTitle === OTHERS_VALUE && (
          <div className="space-y-1.5">
            <Textarea
              value={form.eligibilityTitleCustom}
              onChange={(e) =>
                updateField("eligibilityTitleCustom", e.target.value)
              }
              className="min-h-[180px] resize-y"
              placeholder={
                'Type your eligibility in full — including any rating, date, place or license details — e.g. "Civil Service Eligibility under Special Laws, granted 15 March 2021, DOST-MIRDC Taguig"'
              }
              aria-label="Your eligibility (free text)"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Free-text entry — it will appear on your profile and to evaluators exactly as typed.
            </p>
          </div>
        )}
        {errors.eligibilityTitleCustom && (
          <p className="flex items-start gap-1 text-xs font-medium text-danger-ink">
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            <span>{errors.eligibilityTitleCustom}</span>
          </p>
        )}
      </div>
      {selectedSpec?.rating && (
        <FormField
          label={selectedSpec.rating.label}
          value={form.rating}
          onChange={(v) => updateField("rating", v)}
          placeholder={selectedSpec.rating.placeholder}
        />
      )}
      {selectedSpec?.examDate && (
        <FormField
          label={selectedSpec.examDate.label}
          value={form.examDate}
          onChange={(v) => updateField("examDate", v)}
          type="date"
        />
      )}
      {selectedSpec?.examPlace && (
        <FormField
          label={selectedSpec.examPlace.label}
          value={form.examPlace}
          onChange={(v) => updateField("examPlace", v)}
        />
      )}
      {selectedSpec?.licenseNumber && (
        <FormField
          label={selectedSpec.licenseNumber.label}
          value={form.licenseNumber}
          onChange={(v) => updateField("licenseNumber", v)}
        />
      )}
      {selectedSpec?.licenseValidity && (
        <FormField
          label={selectedSpec.licenseValidity.label}
          value={form.licenseValidity}
          onChange={(v) => updateField("licenseValidity", v)}
          type="date"
        />
      )}
    </div>
  );

  const inlineErrorCount = Object.keys(errors).length;

  return (
    <div className="space-y-4">
      {/* Single-CTA rule: when empty, the inline create form below is the one
          obvious "Add" action (header button hidden to avoid duplication);
          once entries exist, the header button takes over. */}
      <SectionHeader
        title="Eligibility"
        description="Civil service eligibilities earned by examination or conferment"
        icon={ShieldCheck}
        action={
          items.length === 0 ? undefined : (
            <Button onClick={openCreate} variant="outline">
              <Plus className="size-4" /> Add Eligibility
            </Button>
          )
        }
      />

      {items.length === 0 ? (
        // INLINE CREATE — the entry form itself is the empty state (no blank
        // page). After the first save, entries list below and the header
        // "Add Eligibility" button opens the dialog for additional entries.
        <div className="pui-card overflow-hidden">
          <div className="relative border-b border-border/70 px-4 py-3.5 sm:px-6">
            <span
              aria-hidden
              className="absolute bottom-[-1px] left-4 h-[3px] w-16 rounded-full bg-primary sm:left-6"
            />
            <h3 className="text-sm font-bold tracking-[-0.01em] text-foreground">
              Add Eligibility Entry
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Fill in your most recent eligibility. After saving, use the Add
              Eligibility button above to add more entries.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="px-4 py-5 sm:px-6"
          >
            {inlineErrorCount > 0 && (
              <div
                role="alert"
                className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5"
              >
                <p className="text-xs font-semibold text-danger-ink">
                  {inlineErrorCount === 1
                    ? Object.values(errors)[0]
                    : `Please fix ${inlineErrorCount} items before saving:`}
                </p>
                {inlineErrorCount > 1 && (
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {Object.values(errors).map((e) => (
                      <li key={e} className="text-xs leading-relaxed text-danger-ink">
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {fields}
            <div className="mt-5 flex flex-col gap-2.5 border-t border-border/70 pt-4 sm:flex-row sm:items-center">
              <p className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-[11px] font-medium leading-snug text-muted-foreground">
                <Lock className="size-3 shrink-0" strokeWidth={1.8} aria-hidden />
                Your details stay private and secure.
              </p>
              <Button type="submit" disabled={saving} className="shrink-0">
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Add Entry
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="pui-scroll grid grid-cols-1 gap-3 sm:max-h-[560px] sm:overflow-y-auto sm:pr-1 md:grid-cols-2">
          {items.map((item) => (
            <EntityCard
              key={item.id}
              icon={ShieldCheck}
              title={item.eligibilityTitle || "Untitled entry"}
              subtitle={null}
              fromExtraction={item.__fromExtraction}
              onEdit={() => openEdit(item)}
              onDelete={() => onDelete(item.id)}
              rows={eligibilityCardRows(item)}
            />
          ))}
        </div>
      )}

      <ResponsiveFormDialog
        open={open}
        onOpenChange={setOpen}
        dirty={dirty}
        title={editing ? "Edit Eligibility Entry" : "Add Eligibility Entry"}
        description='Select a standard CSC eligibility — or choose "Others" to type your own — and the form will show only the fields that apply to it.'
        submitLabel={editing ? "Save Changes" : "Add Entry"}
        saving={saving}
        onSubmit={submit}
        errors={Object.values(errors)}
      >
        {fields}
      </ResponsiveFormDialog>
    </div>
  );
}
