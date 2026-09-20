// =============================================================================
// RMIS — Profile View: Education Section (premium scope)
// Soft cards on the premium canvas. Reference implementation for the entity
// sections: ResponsiveFormDialog (bottom sheet on phones / dialog on desktop),
// inline field validation with an error digest, and the unsaved-changes guard.
// =============================================================================

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/primitives/workspace";
import { GraduationCap, Plus } from "lucide-react";
import { EducationItem, isPendingId } from "./types";
import {
  SectionHeader,
  EntityCard,
  FormField,
  SelectField,
} from "./form-fields";
import { ResponsiveFormDialog } from "./form-dialog";

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
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Snapshot captured when the dialog opens — drives the unsaved-changes guard.
  const [baseline, setBaseline] = useState("{}");
  const dirty = JSON.stringify(form) !== baseline;

  function openCreate() {
    setEditing(null);
    const next = {
      educationLevel: "College",
      course: "",
      schoolName: "",
      yearGraduated: "",
      unitsEarned: "",
      awards: "",
    };
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
        title="Education"
        meta="Approx 3 min"
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
        <div className="pui-card p-4 sm:p-6">
          <EmptyState
            title="No education entries yet"
            description="Add your educational background, or upload a transcript/PDS in the Supporting Documents section to auto-extract."
            icon={<GraduationCap className="size-7" />}
            className="border-0 bg-transparent"
            action={
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add Education
              </Button>
            }
          />
        </div>
      ) : (
        <div className="pui-scroll space-y-3 sm:max-h-[560px] sm:overflow-y-auto sm:pr-1">
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
            hint="Format: YYYY"
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
      </ResponsiveFormDialog>
    </div>
  );
}