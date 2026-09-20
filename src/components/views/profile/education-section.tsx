// =============================================================================
// RMIS — Profile View: Education Section (premium scope)
// Soft cards on the premium canvas. Reference implementation for the entity
// sections: ResponsiveFormDialog (bottom sheet on phones / dialog on desktop),
// inline field validation with an error digest, and the unsaved-changes guard.
//
// EMPTY-SECTION FLOW: when a section has no entries, the entry form itself is
// rendered inline in the card (no empty-state blank page) — the applicant can
// type straight into it. Once entries exist they list here, and the header
// "Add Education" button opens the dialog for additional entries.
// =============================================================================

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { GraduationCap, Plus, Lock, Loader2 } from "lucide-react";
import { EducationItem, isPendingId } from "./types";
import {
  SectionHeader,
  EntityCard,
  FormField,
  SelectField,
} from "./form-fields";
import { ResponsiveFormDialog } from "./form-dialog";

// Empty draft for the always-visible inline create form (empty section) —
// identical to what openCreate() seeds for the dialog.
const EMPTY_DRAFT = {
  educationLevel: "College",
  course: "",
  schoolName: "",
  yearGraduated: "",
  unitsEarned: "",
  awards: "",
};

export function EducationSection({
  items,
  onCreate,
  onUpdate,
  onDelete,
}: {
  items: EducationItem[];
  onCreate: (payload: Record<string, unknown>) => Promise<EducationItem | null>;
  onUpdate: (
    id: string,
    payload: Record<string, unknown>
  ) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EducationItem | null>(null);
  const [saving, setSaving] = useState(false);
  // Draft seeded AT FIRST RENDER — the inline create form (empty section)
  // mounts with its values already set, so selects never flip undefined →
  // defined after mount (that flip leaves Radix's closed trigger showing the
  // placeholder even when a value is selected).
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

  function openEdit(item: EducationItem) {
    setEditing(item);
    const next = {
      educationLevel: item.educationLevel ?? "College",
      course: item.course ?? "",
      schoolName: item.schoolName ?? "",
      yearGraduated: item.yearGraduated ?? "",
      unitsEarned: item.unitsEarned ?? "",
      awards: item.awards ?? "",
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
    if (!form.schoolName?.trim()) e.schoolName = "School name is required.";
    setErrors(e);
    return Object.values(e);
  }

  async function submit() {
    if (validate().length > 0) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      educationLevel: form.educationLevel || null,
      course: form.course || null,
      schoolName: form.schoolName || null,
      yearGraduated: form.yearGraduated || null,
      unitsEarned: form.unitsEarned || null,
      awards: form.awards || null,
    };
    try {
      if (editing) {
        // Editing a pending (from-extraction) item: persist via onCreate, then drop the pending copy
        if (isPendingId(editing.id)) {
          const created = await onCreate(payload);
          if (created) {
            await onDelete(editing.id);
          }
        } else {
          // Edit existing saved item: backend has no PUT, so delete + create
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
      <SelectField
        label="Education Level"
        value={form.educationLevel}
        onChange={(v) => updateField("educationLevel", v)}
        options={[
          { value: "Elementary", label: "Elementary" },
          { value: "High School", label: "High School (Junior)" },
          { value: "Senior High School", label: "Senior High School" },
          { value: "College", label: "College" },
          { value: "Post-Graduate", label: "Post-Graduate" },
          { value: "Vocational/Trade Course", label: "Vocational / Trade Course" },
        ]}
      />
      <FormField
        label="Course / Degree"
        value={form.course}
        onChange={(v) => updateField("course", v)}
      />
      <div className="md:col-span-2">
        <FormField
          label="School Name"
          value={form.schoolName}
          onChange={(v) => updateField("schoolName", v)}
          required
          error={errors.schoolName}
          placeholder="e.g. University of the Philippines"
        />
      </div>
      <FormField
        label="Year Graduated"
        value={form.yearGraduated}
        onChange={(v) => updateField("yearGraduated", v)}
        placeholder="2023"
        helper="Format: YYYY"
      />
      <FormField
        label="Units Earned"
        value={form.unitsEarned}
        onChange={(v) => updateField("unitsEarned", v)}
        placeholder="e.g. 145"
      />
      <div className="md:col-span-2">
        <FormField
          label="Awards / Honors"
          value={form.awards}
          onChange={(v) => updateField("awards", v)}
        />
      </div>
    </div>
  );

  const inlineErrorCount = Object.keys(errors).length;

  return (
    <div className="space-y-4">
      {/* Single-CTA rule: when empty, the inline create form below is the one
          obvious "Add" action (header button hidden to avoid duplication);
          once entries exist, the header button takes over. */}
      <SectionHeader
        title="Education"
        description="Your educational background — elementary to post-graduate"
        icon={GraduationCap}
        action={
          items.length === 0 ? undefined : (
            <Button onClick={openCreate} variant="outline">
              <Plus className="size-4" /> Add Education
            </Button>
          )
        }
      />

      {items.length === 0 ? (
        // INLINE CREATE — the entry form itself is the empty state (no blank
        // page). After the first save, entries list below and the header
        // "Add Education" button opens the dialog for additional entries.
        <div className="pui-card overflow-hidden">
          <div className="border-b border-border/70 px-4 py-3.5 sm:px-6">
            <h3 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
              Add Education Entry
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Fill in your most recent qualification. After saving, use the Add
              Education button above to add more entries.
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
              icon={GraduationCap}
              title={item.schoolName || item.course || "Untitled entry"}
              subtitle={
                [item.educationLevel, item.yearGraduated]
                  .filter((v) => v && v.trim())
                  .join(" · ") || null
              }
              fromExtraction={item.__fromExtraction}
              onEdit={() => openEdit(item)}
              onDelete={() => onDelete(item.id)}
              rows={[
                { label: "Course / Degree", value: item.course },
                { label: "Year Graduated", value: item.yearGraduated },
                { label: "Units Earned", value: item.unitsEarned },
                { label: "Awards", value: item.awards },
              ]}
            />
          ))}
        </div>
      )}

      <ResponsiveFormDialog
        open={open}
        onOpenChange={setOpen}
        dirty={dirty}
        title={editing ? "Edit Education Entry" : "Add Education Entry"}
        description="Enter your educational background details."
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
