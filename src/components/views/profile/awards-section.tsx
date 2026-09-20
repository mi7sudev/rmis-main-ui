// =============================================================================
// RMIS — Profile View: Awards Section (Accenture language)
// Flat sharp cards on the black canvas — no rounded corners, no shadows.
// ==============================================================================

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/primitives/workspace";
import { formatDate } from "@/lib/client";
import { toast } from "sonner";
import { Award as AwardIcon, Plus, Loader2 } from "lucide-react";
import { AwardItem, toISODate, isPendingId } from "./types";
import {
  SectionHeader,
  EntityCard,
  FormField,
  SelectField,
} from "./form-fields";

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

  function openCreate() {
    setEditing(null);
    setForm({
      recognitionType: "Award",
      recognitionDetails: "",
      recognitionScope: "",
      recognitionCategory: "",
      recognitionProvider: "",
      dateGranted: "",
    });
    setOpen(true);
  }

  function openEdit(item: AwardItem) {
    setEditing(item);
    setForm({
      recognitionType: item.recognitionType ?? "Award",
      recognitionDetails: item.recognitionDetails ?? "",
      recognitionScope: item.recognitionScope ?? "",
      recognitionCategory: item.recognitionCategory ?? "",
      recognitionProvider: item.recognitionProvider ?? "",
      dateGranted: toISODate(item.dateGranted) ?? "",
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.recognitionDetails?.trim()) {
      toast.error("Recognition details are required");
      return;
    }
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
        description="Awards, accomplishments, and recognitions received"
        icon={AwardIcon}
        action={
          items.length === 0 ? undefined : (
            <Button onClick={openCreate} variant="outline">
              <Plus className="h-4 w-4" /> Add Award
            </Button>
          )
        }
      />

      <section className="rounded-none border border-border bg-card">
      {items.length === 0 ? (
        <div className="p-4 sm:p-6">
        <EmptyState
          title="No awards yet"
          description="Add awards and recognitions you've received, or upload award certificates to auto-extract."
          icon={<AwardIcon className="h-7 w-7" />}
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Award
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
                rows={[
                  { label: "Type", value: item.recognitionType },
                  { label: "Details", value: item.recognitionDetails },
                  { label: "Scope", value: item.recognitionScope },
                  { label: "Category", value: item.recognitionCategory },
                  { label: "Provider", value: item.recognitionProvider },
                  {
                    label: "Date Granted",
                    value: item.dateGranted
                      ? formatDate(item.dateGranted)
                      : null,
                  },
                ]}
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
              {editing ? "Edit Award / Recognition" : "Add Award / Recognition"}
            </DialogTitle>
            <DialogDescription>
              Enter details about the award or accomplishment.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto py-2 pr-1 md:grid-cols-2">
            <SelectField
              label="Recognition Type"
              value={form.recognitionType}
              onChange={(v) => setForm((p) => ({ ...p, recognitionType: v, recognitionScope: "" }))}
              options={[
                { value: "Award", label: "Award" },
                { value: "Accomplishment", label: "Accomplishment" },
              ]}
            />
            <SelectField
              label="Scope"
              value={form.recognitionScope}
              onChange={(v) => setForm((p) => ({ ...p, recognitionScope: v }))}
              options={scopeOptions}
              placeholder="Select scope"
            />
            <div className="md:col-span-2">
              <FormField
                label="Recognition Details"
                value={form.recognitionDetails}
                onChange={(v) => setForm((p) => ({ ...p, recognitionDetails: v }))}
                required
              />
            </div>
            <FormField
              label="Category"
              value={form.recognitionCategory}
              onChange={(v) => setForm((p) => ({ ...p, recognitionCategory: v }))}
            />
            <FormField
              label="Awarding Body / Provider"
              value={form.recognitionProvider}
              onChange={(v) => setForm((p) => ({ ...p, recognitionProvider: v }))}
            />
            <FormField
              label="Date Granted"
              value={form.dateGranted}
              onChange={(v) => setForm((p) => ({ ...p, dateGranted: v }))}
              type="date"
            />
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
