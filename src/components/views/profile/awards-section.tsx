// =============================================================================
// RMIS — Profile View: Awards Section (premium scope)
// Entity cards on the premium canvas, following the education-section
// reference: ResponsiveFormDialog (bottom sheet on phones / dialog on
// desktop), inline field validation with an error digest, and the
// unsaved-changes guard.
//
// EMPTY-SECTION FLOW: when a section has no entries, the entry form itself is
// rendered inline in the card (no empty-state blank page) — the applicant can
// type straight into it. Once entries exist they list here, and the header
// "Add Award" button opens the dialog for additional entries.
// =============================================================================

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/client";
import { Award as AwardIcon, Plus, Lock, Loader2 } from "lucide-react";
import { AwardItem, toISODate, isPendingId } from "./types";
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
  recognitionType: "Award",
  recognitionDetails: "",
  recognitionScope: "",
  recognitionCategory: "",
  recognitionProvider: "",
  dateGranted: "",
};

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
      // Reset the draft so the inline create form (if this section renders
      // empty again later) starts clean instead of showing saved values.
      setForm({ ...EMPTY_DRAFT });
      setBaseline(JSON.stringify(EMPTY_DRAFT));
      setErrors({});
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

  // Shared field set — rendered inside the dialog AND inline in the
  // empty-section create card (one source of truth for the form grammar).
  const fields = (
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
  );

  const inlineErrorCount = Object.keys(errors).length;

  return (
    <div className="space-y-4">
      {/* Single-CTA rule: when empty, the inline create form below is the one
          obvious "Add" action (header button hidden to avoid duplication);
          once entries exist, the header button takes over. */}
      <SectionHeader
        title="Awards & Recognition"
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
        // INLINE CREATE — the entry form itself is the empty state (no blank
        // page). After the first save, entries list below and the header
        // "Add Award" button opens the dialog for additional entries.
        <div className="pui-card overflow-hidden">
          <div className="relative border-b border-border/70 px-4 py-3.5 sm:px-6">
            <span
              aria-hidden
              className="absolute bottom-[-1px] left-4 h-[3px] w-16 rounded-full bg-primary sm:left-6"
            />
            <h3 className="text-sm font-bold tracking-[-0.01em] text-foreground">
              Add Award Entry
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Fill in your most recent recognition. After saving, use the Add
              Award button above to add more entries.
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
        {fields}
      </ResponsiveFormDialog>
    </div>
  );
}
