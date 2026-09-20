// =============================================================================
// RMIS — Profile View: Work Experience Section (Accenture language)
// Flat sharp cards on the black canvas — no rounded corners, no shadows.
// ==============================================================================

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Briefcase, Plus, Loader2 } from "lucide-react";
import { WorkItem, toISODate, isPendingId } from "./types";
import {
  SectionHeader,
  EntityCard,
  FormField,
  SelectField,
} from "./form-fields";

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
  const [form, setForm] = useState<Record<string, string>>({});

  function openCreate() {
    setEditing(null);
    setForm({
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
    });
    setOpen(true);
  }

  function openEdit(item: WorkItem) {
    setEditing(item);
    setForm({
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
    });
    setOpen(true);
  }

  async function submit() {
    if (!form.positionTitle?.trim() || !form.employerName?.trim()) {
      toast.error("Position title and employer name are required");
      return;
    }
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
        title="Work Experience"
        description="Your employment history — most recent first"
        icon={Briefcase}
        action={
          items.length === 0 ? undefined : (
            <Button onClick={openCreate} variant="outline">
              <Plus className="h-4 w-4" /> Add Experience
            </Button>
          )
        }
      />

      <section className="rounded-none border border-border bg-card">
      {items.length === 0 ? (
        <div className="p-4 sm:p-6">
        <EmptyState
          title="No work experience yet"
          description="Add your employment history, or upload a Certificate of Employment / PDS to auto-extract."
          icon={<Briefcase className="h-7 w-7" />}
          className="border-0 bg-transparent"
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Experience
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
                  { label: "Position", value: item.positionTitle },
                  { label: "Employer", value: item.employerName },
                  { label: "Address", value: item.employerAddress },
                  {
                    label: "Period",
                    value:
                      (item.inclusiveDateFrom
                        ? formatDate(item.inclusiveDateFrom)
                        : "—") +
                      " → " +
                      (item.isPresentWork
                        ? "Present"
                        : item.inclusiveDateTo
                        ? formatDate(item.inclusiveDateTo)
                        : "—"),
                  },
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
                  { label: "Duties", value: item.actualDuties },
                ]}
              />
            ))}
          </div>
        </div>
      )}
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-bold tracking-[-0.01em] text-foreground">
              {editing ? "Edit Work Experience" : "Add Work Experience"}
            </DialogTitle>
            <DialogDescription>
              Enter your employment details for this position.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto py-2 pr-1 md:grid-cols-2">
            <div className="md:col-span-2">
              <FormField
                label="Position Title"
                value={form.positionTitle}
                onChange={(v) => setForm((p) => ({ ...p, positionTitle: v }))}
                required
              />
            </div>
            <FormField
              label="Employer Name"
              value={form.employerName}
              onChange={(v) => setForm((p) => ({ ...p, employerName: v }))}
              required
            />
            <SelectField
              label="Status of Employment"
              value={form.statusOfEmployment}
              onChange={(v) => setForm((p) => ({ ...p, statusOfEmployment: v }))}
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
              onChange={(v) => setForm((p) => ({ ...p, employerAddress: v }))}
              className="md:col-span-2"
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
              disabled={form.isPresentWork === "Yes"}
            />
            <SelectField
              label="Currently employed here?"
              value={form.isPresentWork}
              onChange={(v) => setForm((p) => ({ ...p, isPresentWork: v }))}
              options={[
                { value: "No", label: "No" },
                { value: "Yes", label: "Yes (Present)" },
              ]}
            />
            <FormField
              label="Monthly Salary (₱)"
              value={form.monthlySalary}
              onChange={(v) => setForm((p) => ({ ...p, monthlySalary: v }))}
              type="number"
            />
            <SelectField
              label="Government Service?"
              value={form.isGovtService}
              onChange={(v) => setForm((p) => ({ ...p, isGovtService: v }))}
              options={[
                { value: "No", label: "No (Private)" },
                { value: "Yes", label: "Yes (Government)" },
              ]}
            />
            <div className="md:col-span-2">
              <Label className="font-semibold text-foreground">
                Actual Duties
              </Label>
              <Textarea
                value={form.actualDuties}
                onChange={(e) =>
                  setForm((p) => ({ ...p, actualDuties: e.target.value }))
                }
                className="mt-1.5 min-h-[80px]"
                placeholder="Describe your main responsibilities and accomplishments..."
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
