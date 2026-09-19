// =============================================================================
// RMIS — Profile View: Training Section (Accenture language)
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
import { BookOpen, Plus, Loader2 } from "lucide-react";
import { TrainingItem, toISODate, isPendingId } from "./types";
import {
  SectionHeader,
  EntityCard,
  FormField,
  SelectField,
} from "./form-fields";

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

  function openCreate() {
    setEditing(null);
    setForm({
      titleOfTraining: "",
      typeOfTraining: "Technical",
      inclusiveDateFrom: "",
      inclusiveDateTo: "",
      numberHours: "",
    });
    setOpen(true);
  }

  function openEdit(item: TrainingItem) {
    setEditing(item);
    setForm({
      titleOfTraining: item.titleOfTraining ?? "",
      typeOfTraining: item.typeOfTraining ?? "Technical",
      inclusiveDateFrom: toISODate(item.inclusiveDateFrom) ?? "",
      inclusiveDateTo: toISODate(item.inclusiveDateTo) ?? "",
      numberHours: item.numberHours ? String(item.numberHours) : "",
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.titleOfTraining?.trim()) {
      toast.error("Training title is required");
      return;
    }
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
      <SectionHeader
        title="Training & Development"
        description="Seminars, workshops, and short courses attended"
        icon={BookOpen}
        action={
          <Button onClick={openCreate} variant="outline">
            <Plus className="h-4 w-4" /> Add Training
          </Button>
        }
      />

      <section className="rounded-none border border-border bg-card">
      {items.length === 0 ? (
        <div className="p-4 sm:p-6">
        <EmptyState
          title="No training entries yet"
          description="Add trainings you've attended, or upload training certificates to auto-extract."
          icon={<BookOpen className="h-7 w-7" />}
          action={
            <Button onClick={openCreate} variant="outline">
              <Plus className="h-4 w-4" /> Add Training
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
                  { label: "Title", value: item.titleOfTraining },
                  { label: "Type", value: item.typeOfTraining },
                  {
                    label: "Period",
                    value:
                      (item.inclusiveDateFrom
                        ? formatDate(item.inclusiveDateFrom)
                        : "—") +
                      " → " +
                      (item.inclusiveDateTo
                        ? formatDate(item.inclusiveDateTo)
                        : "—"),
                  },
                  {
                    label: "Hours",
                    value: item.numberHours ? String(item.numberHours) : null,
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
              {editing ? "Edit Training Entry" : "Add Training Entry"}
            </DialogTitle>
            <DialogDescription>
              Enter details about the training, seminar, or short course.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto py-2 pr-1 md:grid-cols-2">
            <div className="md:col-span-2">
              <FormField
                label="Title of Training / Seminar / Short Course"
                value={form.titleOfTraining}
                onChange={(v) => setForm((p) => ({ ...p, titleOfTraining: v }))}
                required
              />
            </div>
            <SelectField
              label="Type of Training"
              value={form.typeOfTraining}
              onChange={(v) => setForm((p) => ({ ...p, typeOfTraining: v }))}
              options={[
                { value: "Technical", label: "Technical" },
                { value: "Managerial/Supervisory", label: "Managerial / Supervisory" },
                { value: "Orientation", label: "Orientation" },
                { value: "Other", label: "Other" },
              ]}
            />
            <FormField
              label="Number of Hours"
              value={form.numberHours}
              onChange={(v) => setForm((p) => ({ ...p, numberHours: v }))}
              type="number"
            />
            <FormField
              label="Date From"
              value={form.inclusiveDateFrom}
              onChange={(v) => setForm((p) => ({ ...p, inclusiveDateFrom: v }))}
              type="date"
            />
            <FormField
              label="Date To"
              value={form.inclusiveDateTo}
              onChange={(v) => setForm((p) => ({ ...p, inclusiveDateTo: v }))}
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
