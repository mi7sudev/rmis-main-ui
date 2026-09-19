// =============================================================================
// RMIS — Profile View: Education Section (Accenture language)
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
import { toast } from "sonner";
import { GraduationCap, Plus, Loader2 } from "lucide-react";
import { EducationItem, isPendingId } from "./types";
import {
  SectionHeader,
  EntityCard,
  FormField,
  SelectField,
} from "./form-fields";

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

  function openCreate() {
    setEditing(null);
    setForm({
      educationLevel: "College",
      course: "",
      schoolName: "",
      yearGraduated: "",
      unitsEarned: "",
      awards: "",
    });
    setOpen(true);
  }

  function openEdit(item: EducationItem) {
    setEditing(item);
    setForm({
      educationLevel: item.educationLevel ?? "College",
      course: item.course ?? "",
      schoolName: item.schoolName ?? "",
      yearGraduated: item.yearGraduated ?? "",
      unitsEarned: item.unitsEarned ?? "",
      awards: item.awards ?? "",
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.schoolName?.trim()) {
      toast.error("School name is required");
      return;
    }
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
      <SectionHeader
        title="Education"
        description="Your educational background — elementary to post-graduate"
        icon={GraduationCap}
        action={
          <Button onClick={openCreate} variant="outline">
            <Plus className="h-4 w-4" /> Add Education
          </Button>
        }
      />

      <section className="rounded-none border border-border bg-card">
      {items.length === 0 ? (
        <div className="p-4 sm:p-6">
        <EmptyState
          title="No education entries yet"
          description="Add your educational background, or upload a transcript/PDS in the Supporting Documents section to auto-extract."
          icon={<GraduationCap className="h-7 w-7" />}
          action={
            <Button onClick={openCreate} variant="outline">
              <Plus className="h-4 w-4" /> Add Education
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
                  { label: "Level", value: item.educationLevel },
                  { label: "Course / Degree", value: item.course },
                  { label: "School", value: item.schoolName },
                  { label: "Year Graduated", value: item.yearGraduated },
                  { label: "Units Earned", value: item.unitsEarned },
                  { label: "Awards", value: item.awards },
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
              {editing ? "Edit Education Entry" : "Add Education Entry"}
            </DialogTitle>
            <DialogDescription>
              Enter your educational background details.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto py-2 pr-1 md:grid-cols-2">
            <SelectField
              label="Education Level"
              value={form.educationLevel}
              onChange={(v) => setForm((p) => ({ ...p, educationLevel: v }))}
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
              onChange={(v) => setForm((p) => ({ ...p, course: v }))}
            />
            <div className="md:col-span-2">
              <FormField
                label="School Name"
                value={form.schoolName}
                onChange={(v) => setForm((p) => ({ ...p, schoolName: v }))}
                required
              />
            </div>
            <FormField
              label="Year Graduated"
              value={form.yearGraduated}
              onChange={(v) => setForm((p) => ({ ...p, yearGraduated: v }))}
              placeholder="2023"
            />
            <FormField
              label="Units Earned"
              value={form.unitsEarned}
              onChange={(v) => setForm((p) => ({ ...p, unitsEarned: v }))}
              placeholder="e.g. 145"
            />
            <div className="md:col-span-2">
              <FormField
                label="Awards / Honors"
                value={form.awards}
                onChange={(v) => setForm((p) => ({ ...p, awards: v }))}
              />
            </div>
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
