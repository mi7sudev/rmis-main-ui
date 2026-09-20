// =============================================================================
// RMIS — Profile View: Work Experience Section (premium scope)
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
import { Briefcase, Plus } from "lucide-react";
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Snapshot captured when the dialog opens — drives the unsaved-changes guard.
  const [baseline, setBaseline] = useState("{}");
  const dirty = JSON.stringify(form) !== baseline;

  function openCreate() {
    setEditing(null);
    const next = {
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
        <div className="pui-card p-4 sm:p-6">
          <EmptyState
            title="No work experience yet"
            description="Add your employment history, or upload a Certificate of Employment / PDS to auto-extract."
            icon={<Briefcase className="size-7" />}
            className="border-0 bg-transparent"
            action={
              <Button onClick={openCreate}>
                <Plus className="size-4" /> Add Experience
              </Button>
            }
          />
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
            hint="Gross monthly, before deductions"
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
      </ResponsiveFormDialog>
    </div>
  );
}
