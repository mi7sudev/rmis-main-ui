// =============================================================================
// RMIS — Profile View: Eligibility Section (Accenture language)
// Flat sharp cards on the mode-aware canvas — no rounded corners, no shadows.
// ==============================================================================

"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/primitives/workspace";
import { formatDate } from "@/lib/client";
import { toast } from "sonner";
import { ShieldCheck, Plus, Loader2 } from "lucide-react";
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
  const [form, setForm] = useState<Record<string, string>>({});

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
    setForm({
      eligibilityTitle: "",
      eligibilityTitleCustom: "",
      rating: "",
      examDate: "",
      examPlace: "",
      licenseNumber: "",
      licenseValidity: "",
    });
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
    setForm({
      eligibilityTitle: isKnown ? normalizedTitle : OTHERS_VALUE,
      eligibilityTitleCustom: isKnown ? "" : item.eligibilityTitle ?? "",
      rating: item.rating ?? "",
      examDate: toISODate(item.examDate) ?? "",
      examPlace: item.examPlace ?? "",
      licenseNumber: item.licenseNumber ?? "",
      licenseValidity: toISODate(item.licenseValidity) ?? "",
    });
    setOpen(true);
  }

  async function submit() {
    // Resolve the final title: if the user picked "Others", use the custom
    // text they typed; otherwise use the selected predefined option.
    const finalTitle =
      form.eligibilityTitle === OTHERS_VALUE
        ? form.eligibilityTitleCustom
        : form.eligibilityTitle;
    if (!finalTitle?.trim()) {
      toast.error(
        form.eligibilityTitle === OTHERS_VALUE
          ? "Please type your eligibility title"
          : "Eligibility title is required"
      );
      return;
    }
    setSaving(true);
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
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Single-CTA rule: when empty, the EmptyState card below is the one
          obvious "Add" action (header button hidden to avoid duplication);
          once entries exist, the header button takes over. */}
      <SectionHeader
        title="Eligibility"
        description="Civil service eligibilities earned by examination or conferment"
        icon={ShieldCheck}
        action={
          items.length === 0 ? undefined : (
            <Button onClick={openCreate} variant="outline">
              <Plus className="h-4 w-4" /> Add Eligibility
            </Button>
          )
        }
      />

      <section className="rounded-none border border-border bg-card">
      {items.length === 0 ? (
        <div className="p-4 sm:p-6">
        <EmptyState
          title="No eligibility entries yet"
          description="Add civil service or professional eligibilities you've earned, or upload eligibility certificates to auto-extract."
          icon={<ShieldCheck className="h-7 w-7" />}
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Eligibility
            </Button>
          }
        />
        </div>
      ) : (
        <div className="sm:max-h-[480px] sm:overflow-y-auto sm:pr-1">
          <div className="space-y-3 p-4">
            {items.map((item) => (
              <EntityCard
                key={item.id}
                fromExtraction={item.__fromExtraction}
                onEdit={() => openEdit(item)}
                onDelete={() => onDelete(item.id)}
                rows={eligibilityCardRows(item)}
              />
            ))}
          </div>
        </div>
      )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-bold tracking-[-0.01em] text-foreground">
              {editing ? "Edit Eligibility Entry" : "Add Eligibility Entry"}
            </DialogTitle>
            <DialogDescription>
              Select a standard CSC eligibility — or choose "Others" to type your own — and the form will show only the fields that apply to it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto py-2 pr-1 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label className="font-semibold text-foreground">
                Eligibility Title <span className="text-danger-ink">*</span>
              </Label>
              <Select
                value={form.eligibilityTitle}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, eligibilityTitle: v }))
                }
              >
                <SelectTrigger className="mt-1.5 h-11 w-full">
                  <SelectValue placeholder="Select an eligibility" />
                </SelectTrigger>
                <SelectContent className="max-h-96">
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
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {getEligibilityDescription(form.eligibilityTitle)}
                  </p>
                )}
              {form.eligibilityTitle === OTHERS_VALUE && (
                <div className="mt-2">
                  <Textarea
                    value={form.eligibilityTitleCustom}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        eligibilityTitleCustom: e.target.value,
                      }))
                    }
                    className="min-h-[180px] resize-y"
                    placeholder={
                      'Type your eligibility in full — including any rating, date, place or license details — e.g. "Civil Service Eligibility under Special Laws, granted 15 March 2021, DOST-MIRDC Taguig"'
                    }
                    aria-label="Your eligibility (free text)"
                    autoFocus
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Free-text entry — it will appear on your profile and to evaluators exactly as typed.
                  </p>
                </div>
              )}
            </div>
            {selectedSpec?.rating && (
              <FormField
                label={selectedSpec.rating.label}
                value={form.rating}
                onChange={(v) => setForm((p) => ({ ...p, rating: v }))}
                placeholder={selectedSpec.rating.placeholder}
              />
            )}
            {selectedSpec?.examDate && (
              <FormField
                label={selectedSpec.examDate.label}
                value={form.examDate}
                onChange={(v) => setForm((p) => ({ ...p, examDate: v }))}
                type="date"
              />
            )}
            {selectedSpec?.examPlace && (
              <FormField
                label={selectedSpec.examPlace.label}
                value={form.examPlace}
                onChange={(v) => setForm((p) => ({ ...p, examPlace: v }))}
              />
            )}
            {selectedSpec?.licenseNumber && (
              <FormField
                label={selectedSpec.licenseNumber.label}
                value={form.licenseNumber}
                onChange={(v) => setForm((p) => ({ ...p, licenseNumber: v }))}
              />
            )}
            {selectedSpec?.licenseValidity && (
              <FormField
                label={selectedSpec.licenseValidity.label}
                value={form.licenseValidity}
                onChange={(v) => setForm((p) => ({ ...p, licenseValidity: v }))}
                type="date"
              />
            )}
          </div>
          <DialogFooter className="shrink-0">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={submit}
              disabled={saving}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              {editing ? "Save Changes" : "Add Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
