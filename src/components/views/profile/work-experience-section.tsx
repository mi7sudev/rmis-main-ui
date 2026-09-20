// =============================================================================
// RMIS — Profile View: Work Experience Section (premium scope)
// Entity cards on the premium canvas, following the education-section
// reference: ResponsiveFormDialog (bottom sheet on phones / dialog on
// desktop), inline field validation with an error digest, and the
// unsaved-changes guard.
//
// EMPTY-SECTION FLOW: when a section has no entries, the entry form itself is
// rendered inline in the card (no empty-state blank page) — the applicant can
// type straight into it. Once entries exist they list here, and the header
// "Add Experience" button opens the dialog for additional entries.
// =============================================================================

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/client";
import { Briefcase, Plus, Lock, Loader2 } from "lucide-react";
import { WorkItem, toISODate, isPendingId } from "./types";
import {
  SectionHeader,
  EntityCard,
  FormField,
  SelectField,
  SuffixField,
  YesNoField,
  TextareaField,
} from "./form-fields";
import { ResponsiveFormDialog } from "./form-dialog";

// Empty draft for the always-visible inline create form (empty section) —
// identical to what openCreate() seeds for the dialog.
const EMPTY_DRAFT = {
  positionTitle: "",
  employerName: "",
  employerAddress: "",
  inclusiveDateFrom: "",
  inclusiveDateTo: "",
  isPresentWork: "No",
  statusOfEmployment: "",
  monthlySalary: "",
  isGovtService: "No",
  actualDuties: "",
};

export function WorkExperienceSection({
  items,
  onCreate,
  onUpdate,
  onDelete,
}: {
  items: WorkItem[];
  onCreate: (payload: Record<string, unknown>) => Promise<WorkItem | null>;
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkItem | null>(null);
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

  function openCreate() {
    setEditing(null);
    const next = { ...EMPTY_DRAFT };
    setForm(next);
    setBaseline(JSON.stringify(next));
    setErrors({});
    setOpen(true);
  }

  function openEdit(item: WorkItem) {
    setEditing(item);
    const next = {
      positionTitle: item.positionTitle ?? "",
      employerName: item.employerName ?? "",
      employerAddress: item.employerAddress ?? "",
      inclusiveDateFrom: toISODate(item.inclusiveDateFrom) ?? "",
      inclusiveDateTo: toISODate(item.inclusiveDateTo) ?? "",
      isPresentWork: item.isPresentWork ? "Yes" : "No",
      statusOfEmployment: item.statusOfEmployment ?? "",
      monthlySalary: item.monthlySalary ? String(item.monthlySalary) : "",
      isGovtService: item.isGovtService ? "Yes" : "No",
      actualDuties: item.actualDuties ?? "",
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
    if (!form.positionTitle?.trim())
      e.positionTitle = "Position title is required.";
    if (!form.employerName?.trim())
      e.employerName = "Employer name is required.";
    setErrors(e);
    return Object.values(e);
  }

  async function submit() {
    if (validate().length > 0) return;
    setSaving(true);
    const isPresent = form.isPresentWork === "Yes";
    const payload: Record<string, unknown> = {
      positionTitle: form.positionTitle || null,
      employerName: form.employerName || null,
      employerAddress: form.employerAddress || null,
      inclusiveDateFrom: form.inclusiveDateFrom || null,
      inclusiveDateTo: isPresent ? null : form.inclusiveDateTo || null,
      isPresentWork: isPresent,
      statusOfEmployment: form.statusOfEmployment || null,
      monthlySalary: form.monthlySalary ? Number(form.monthlySalary) : null,
      isGovtService: form.isGovtService === "Yes",
      actualDuties: form.actualDuties || null,
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
      <div className="md:col-span-2">
        <FormField
          label="Position Title"
          value={form.positionTitle}
          onChange={(v) => updateField("positionTitle", v)}
          required
          error={errors.positionTitle}
        />
      </div>
      <FormField
        label="Employer Name"
        value={form.employerName}
        onChange={(v) => updateField("employerName", v)}
        required
        error={errors.employerName}
      />
      <SelectField
        label="Status of Employment"
        value={form.statusOfEmployment}
        onChange={(v) => updateField("statusOfEmployment", v)}
        options={[
          { value: "Regular", label: "Regular" },
          { value: "Temporary", label: "Temporary" },
          { value: "Contract of Service", label: "Contract of Service" },
          { value: "Contractual", label: "Contractual" },
          { value: "Job Order", label: "Job Order" },
          {
            value: "Government Internship Program",
            label: "Government Internship Program",
          },
        ]}
        placeholder="Select status"
      />
      <FormField
        label="Employer Address"
        value={form.employerAddress}
        onChange={(v) => updateField("employerAddress", v)}
        className="md:col-span-2"
      />
      <FormField
        label="Date From"
        value={form.inclusiveDateFrom}
        onChange={(v) => updateField("inclusiveDateFrom", v)}
        type="date"
      />
      <FormField
        label="Date To"
        value={form.inclusiveDateTo}
        onChange={(v) => updateField("inclusiveDateTo", v)}
        type="date"
        disabled={form.isPresentWork === "Yes"}
      />
      <YesNoField
        label="Currently employed here?"
        value={form.isPresentWork}
        onChange={(v) => updateField("isPresentWork", v)}
      />
      <SuffixField
        label="Monthly Salary"
        suffix="PHP"
        value={form.monthlySalary}
        onChange={(v) => updateField("monthlySalary", v)}
        type="number"
        helper="Gross monthly, before deductions"
      />
      <YesNoField
        label="Government Service?"
        value={form.isGovtService}
        onChange={(v) => updateField("isGovtService", v)}
      />
      <TextareaField
        label="Actual Duties"
        value={form.actualDuties}
        onChange={(v) => updateField("actualDuties", v)}
        placeholder="Describe your main responsibilities and accomplishments..."
        className="md:col-span-2"
      />
    </div>
  );

  const inlineErrorCount = Object.keys(errors).length;

  return (
    <div className="space-y-4">
      {/* Single-CTA rule: when empty, the inline create form below is the one
          obvious "Add" action (header button hidden to avoid duplication);
          once entries exist, the header button takes over. */}
      <SectionHeader
        title="Work Experience"
        meta="Approx 5 min"
        description="Your employment history — most recent first"
        icon={Briefcase}
        action={
          items.length === 0 ? undefined : (
            <Button onClick={openCreate} variant="outline">
              <Plus className="size-4" /> Add Experience
            </Button>
          )
        }
      />

      {items.length === 0 ? (
        // INLINE CREATE — the entry form itself is the empty state (no blank
        // page). After the first save, entries list below and the header
        // "Add Experience" button opens the dialog for additional entries.
        <div className="pui-card overflow-hidden">
          <div className="relative border-b border-border/70 px-4 py-3.5 sm:px-6">
            <span
              aria-hidden
              className="absolute bottom-[-1px] left-4 h-[3px] w-16 rounded-full bg-primary sm:left-6"
            />
            <h3 className="text-sm font-bold tracking-[-0.01em] text-foreground">
              Add Work Experience Entry
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Fill in your most recent role. After saving, use the Add Work
              Experience button above to add more entries.
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
          {items.map((item) => {
            const period = `${item.inclusiveDateFrom ? formatDate(item.inclusiveDateFrom) : "—"} → ${
              item.isPresentWork
                ? "Present"
                : item.inclusiveDateTo
                ? formatDate(item.inclusiveDateTo)
                : "—"
            }`;
            return (
              <EntityCard
                key={item.id}
                icon={Briefcase}
                title={item.positionTitle || item.employerName || "Untitled entry"}
                subtitle={[item.employerName, period].filter(Boolean).join(" · ") || null}
                fromExtraction={item.__fromExtraction}
                onEdit={() => openEdit(item)}
                onDelete={() => onDelete(item.id)}
                rows={[
                  { label: "Status", value: item.statusOfEmployment },
                  {
                    label: "Monthly Salary",
                    value: item.monthlySalary
                      ? `₱${item.monthlySalary.toLocaleString()}`
                      : null,
                  },
                  {
                    label: "Government Service",
                    value: item.isGovtService ? "Yes" : "No",
                  },
                  { label: "Address", value: item.employerAddress },
                  { label: "Duties", value: item.actualDuties },
                ]}
              />
            );
          })}
        </div>
      )}

      <ResponsiveFormDialog
        open={open}
        onOpenChange={setOpen}
        dirty={dirty}
        title={editing ? "Edit Work Experience" : "Add Work Experience"}
        description="Enter your employment details for this position."
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
