// =============================================================================
// RMIS — Profile View: Training Section (premium scope)
// Entity cards on the premium canvas, following the education-section
// reference: ResponsiveFormDialog (bottom sheet on phones / dialog on
// desktop), inline field validation with an error digest, and the
// unsaved-changes guard.
// =============================================================================

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/primitives/workspace";
import { formatDate } from "@/lib/client";
import { BookOpen, Plus } from "lucide-react";
import { TrainingItem, toISODate, isPendingId } from "./types";
import {
  SectionHeader,
  EntityCard,
  FormField,
  SelectField,
  SuffixField,
} from "./form-fields";
import { ResponsiveFormDialog } from "./form-dialog";

export function TrainingSection({
  items,
  onCreate,
  onUpdate,
  onDelete,
}: {
  items: TrainingItem[];
  onCreate: (payload: Record<string, unknown>) => Promise<TrainingItem | null>;
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Snapshot captured when the dialog opens — drives the unsaved-changes guard.
  const [baseline, setBaseline] = useState("{}");
  const dirty = JSON.stringify(form) !== baseline;

  function openCreate() {
    setEditing(null);
    const next = {
      titleOfTraining: "",
      typeOfTraining: "Technical",
      inclusiveDateFrom: "",
      inclusiveDateTo: "",
      numberHours: "",
    };
    setForm(next);
    setBaseline(JSON.stringify(next));
    setErrors({});
    setOpen(true);
  }

  function openEdit(item: TrainingItem) {
    setEditing(item);
    const next = {
      titleOfTraining: item.titleOfTraining ?? "",
      typeOfTraining: item.typeOfTraining ?? "Technical",
      inclusiveDateFrom: toISODate(item.inclusiveDateFrom) ?? "",
      inclusiveDateTo: toISODate(item.inclusiveDateTo) ?? "",
      numberHours: item.numberHours ? String(item.numberHours) : "",
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
    if (!form.titleOfTraining?.trim())
      e.titleOfTraining = "Training title is required.";
    setErrors(e);
    return Object.values(e);
  }

  async function submit() {
    if (validate().length > 0) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      titleOfTraining: form.titleOfTraining || null,
      typeOfTraining: form.typeOfTraining || null,
      inclusiveDateFrom: form.inclusiveDateFrom || null,
      inclusiveDateTo: form.inclusiveDateTo || null,
      numberHours: form.numberHours ? Number(form.numberHours) : null,
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
        title="Training & Development"
        meta="Approx 2 min"
        description="Seminars, workshops, and short courses attended"
        icon={BookOpen}
        action={
          items.length === 0 ? undefined : (
            <Button onClick={openCreate} variant="outline">
              <Plus className="size-4" /> Add Training
            </Button>
          )
        }
      />

      {items.length === 0 ? (
        <div className="pui-card p-4 sm:p-6">
          <EmptyState
            title="No training entries yet"
            description="Add trainings you've attended, or upload training certificates to auto-extract."
            icon={<BookOpen className="size-7" />}
            className="border-0 bg-transparent"
            action={
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add Training
              </Button>
            }
          />
        </div>
      ) : (
        <div className="pui-scroll grid grid-cols-1 gap-3 sm:max-h-[560px] sm:overflow-y-auto sm:pr-1 md:grid-cols-2">
          {items.map((item) => {
            const period = `${item.inclusiveDateFrom ? formatDate(item.inclusiveDateFrom) : "—"} → ${
              item.inclusiveDateTo ? formatDate(item.inclusiveDateTo) : "—"
            }`;
            return (
              <EntityCard
                key={item.id}
                icon={BookOpen}
                title={item.titleOfTraining || "Untitled entry"}
                subtitle={
                  [item.typeOfTraining, period]
                    .filter((v) => v && !v.startsWith("—"))
                    .join(" · ") || null
                }
                fromExtraction={item.__fromExtraction}
                onEdit={() => openEdit(item)}
                onDelete={() => onDelete(item.id)}
                rows={[
                  {
                    label: "Hours",
                    value: item.numberHours ? String(item.numberHours) : null,
                  },
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
        title={editing ? "Edit Training Entry" : "Add Training Entry"}
        description="Enter details about the training, seminar, or short course."
        submitLabel={editing ? "Save Changes" : "Add Entry"}
        saving={saving}
        onSubmit={submit}
        errors={Object.values(errors)}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <FormField
              label="Title of Training / Seminar / Short Course"
              value={form.titleOfTraining}
              onChange={(v) => updateField("titleOfTraining", v)}
              required
              error={errors.titleOfTraining}
            />
          </div>
          <SelectField
            label="Type of Training"
            value={form.typeOfTraining}
            onChange={(v) => updateField("typeOfTraining", v)}
            options={[
              { value: "Technical", label: "Technical" },
              {
                value: "Managerial/Supervisory",
                label: "Managerial / Supervisory",
              },
              { value: "Orientation", label: "Orientation" },
              { value: "Other", label: "Other" },
            ]}
          />
          <SuffixField
            label="Number of Hours"
            suffix="hrs"
            value={form.numberHours}
            onChange={(v) => updateField("numberHours", v)}
            type="number"
            placeholder="e.g. 24"
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
          />
        </div>
      </ResponsiveFormDialog>
    </div>
  );
}
