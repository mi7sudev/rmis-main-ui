// =============================================================================
// RMIS — Profile View: Awards Section (premium scope)
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
import { Award as AwardIcon, Plus } from "lucide-react";
import { AwardItem, toISODate, isPendingId } from "./types";
import {
  SectionHeader,
  EntityCard,
  FormField,
  SelectField,
} from "./form-fields";
import { ResponsiveFormDialog } from "./form-dialog";

export function AwardsSection({
  items,
  onCreate,
  onUpdate,
  onDelete,
}: {
  items: AwardItem[];
  onCreate: (payload: Record<string, unknown>) => Promise<AwardItem | null>;
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AwardItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Snapshot captured when the dialog opens — drives the unsaved-changes guard.
  const [baseline, setBaseline] = useState("{}");
  const dirty = JSON.stringify(form) !== baseline;

  function openCreate() {
    setEditing(null);
    const next = {
      recognitionType: "Award",
      recognitionDetails: "",
      recognitionScope: "",
      recognitionCategory: "",
      recognitionProvider: "",
      dateGranted: "",
    };
    setForm(next);
    setBaseline(JSON.stringify(next));
    setErrors({});
    setOpen(true);
  }

  function openEdit(item: AwardItem) {
    setEditing(item);
    const next = {
      recognitionType: item.recognitionType ?? "Award",
      recognitionDetails: item.recognitionDetails ?? "",
      recognitionScope: item.recognitionScope ?? "",
      recognitionCategory: item.recognitionCategory ?? "",
      recognitionProvider: item.recognitionProvider ?? "",
      dateGranted: toISODate(item.dateGranted) ?? "",
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
    if (!form.recognitionDetails?.trim())
      e.recognitionDetails = "Recognition details are required.";
    setErrors(e);
    return Object.values(e);
  }

  async function submit() {
    if (validate().length > 0) return;
    setSaving(true);
    const payload: Record<string, unknown> = {
      recognitionType: form.recognitionType || "Award",
      recognitionDetails: form.recognitionDetails || null,
      recognitionScope: form.recognitionScope || null,
      recognitionCategory: form.recognitionCategory || null,
      recognitionProvider: form.recognitionProvider || null,
      dateGranted: form.dateGranted || null,
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

  const scopeOptions =
    form.recognitionType === "Award"
      ? [
          { value: "Individual", label: "Individual" },
          { value: "Group", label: "Group" },
        ]
      : [
          { value: "Local", label: "Local" },
          { value: "Foreign", label: "Foreign" },
          { value: "International", label: "International" },
        ];

  return (
    <div className="space-y-4">
      {/* Single-CTA rule: when empty, the EmptyState card below is the one
          obvious "Add" action (header button hidden to avoid duplication);
          once entries exist, the header button takes over. */}
      <SectionHeader
        title="Awards & Recognition"
        meta="Approx 2 min"
        description="Awards, accomplishments, and recognitions received"
        icon={AwardIcon}
        action={
          items.length === 0 ? undefined : (
            <Button onClick={openCreate} variant="outline">
              <Plus className="size-4" /> Add Award
            </Button>
          )
        }
      />

      {items.length === 0 ? (
        <div className="pui-card p-4 sm:p-6">
          <EmptyState
            title="No awards yet"
            description="Add awards and recognitions you've received, or upload award certificates to auto-extract."
            icon={<AwardIcon className="size-7" />}
            className="border-0 bg-transparent"
            action={
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add Award
              </Button>
            }
          />
        </div>
      ) : (
        <div className="pui-scroll space-y-3 sm:max-h-[560px] sm:overflow-y-auto sm:pr-1">
          {items.map((item) => (
            <EntityCard
              key={item.id}
              icon={AwardIcon}
              title={item.recognitionDetails || "Untitled entry"}
              subtitle={
                [
                  item.recognitionType,
                  item.recognitionScope,
                  item.dateGranted ? formatDate(item.dateGranted) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || null
              }
              fromExtraction={item.__fromExtraction}
              onEdit={() => openEdit(item)}
              onDelete={() => onDelete(item.id)}
              rows={[
                { label: "Category", value: item.recognitionCategory },
                { label: "Awarding Body", value: item.recognitionProvider },
              ]}
            />
          ))}
        </div>
      )}

      <ResponsiveFormDialog
        open={open}
        onOpenChange={setOpen}
        dirty={dirty}
        title={editing ? "Edit Award / Recognition" : "Add Award / Recognition"}
        description="Enter details about the award or accomplishment."
        submitLabel={editing ? "Save Changes" : "Add Entry"}
        saving={saving}
        onSubmit={submit}
        errors={Object.values(errors)}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <SelectField
            label="Recognition Type"
            value={form.recognitionType}
            onChange={(v) => {
              updateField("recognitionType", v);
              updateField("recognitionScope", "");
            }}
            options={[
              { value: "Award", label: "Award" },
              { value: "Accomplishment", label: "Accomplishment" },
            ]}
          />
          <SelectField
            label="Scope"
            value={form.recognitionScope}
            onChange={(v) => updateField("recognitionScope", v)}
            options={scopeOptions}
            placeholder="Select scope"
          />
          <div className="md:col-span-2">
            <FormField
              label="Recognition Details"
              value={form.recognitionDetails}
              onChange={(v) => updateField("recognitionDetails", v)}
              required
              error={errors.recognitionDetails}
            />
          </div>
          <FormField
            label="Category"
            value={form.recognitionCategory}
            onChange={(v) => updateField("recognitionCategory", v)}
          />
          <FormField
            label="Awarding Body / Provider"
            value={form.recognitionProvider}
            onChange={(v) => updateField("recognitionProvider", v)}
          />
          <FormField
            label="Date Granted"
            value={form.dateGranted}
            onChange={(v) => updateField("dateGranted", v)}
            type="date"
          />
        </div>
      </ResponsiveFormDialog>
    </div>
  );
}
