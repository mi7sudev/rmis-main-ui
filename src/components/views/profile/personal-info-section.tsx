// =============================================================================
// RMIS — Profile View: Personal Information Section (Accenture language)
// Flat sharp cards on the mode-aware canvas — no rounded corners, no shadows.
// ==============================================================================

"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { toast } from "sonner";
import {
  User,
  ShieldAlert,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import {
  CharacterReference,
  parseCharRefs,
  serializeCharRefs,
  emptyCharacterReference,
} from "./types";
import {
  SectionHeader,
  FieldWithExtraction,
  SelectField,
  RefInput,
} from "./form-fields";

// Extraction is owned exclusively by the PDS Upload · Auto-Extraction strip
// (which auto-applies server-side and reloads saved data). This legacy
// highlight set is kept optional and defaults to empty — no field is ever
// marked "from extraction" in the current flow.
const EMPTY_EXTRACTION_FIELDS = new Set<string>();

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export function PersonalInfoSection({
  form,
  fromExtraction = EMPTY_EXTRACTION_FIELDS,
  dirty,
  saving,
  autosave = "idle",
  onChange,
  onSave,
}: {
  form: Record<string, string | boolean | null>;
  fromExtraction?: Set<string>;
  dirty: boolean;
  saving: boolean;
  /** Google-Forms-style autosave state — rendered as a quiet indicator next to Save. */
  autosave?: AutosaveStatus;
  onChange: (key: string, value: string | boolean | null) => void;
  onSave: () => void;
}) {
  const charRefs = useMemo(
    () => parseCharRefs((form.characterReferences as string) || null),
    [form.characterReferences]
  );

  function updateCharRef(idx: number, field: keyof CharacterReference, value: string) {
    const next = [...charRefs];
    next[idx] = { ...next[idx], [field]: value };
    onChange("characterReferences", serializeCharRefs(next));
  }

  function addCharRef() {
    if (charRefs.length >= 5) {
      toast.info("Maximum 5 character references allowed");
      return;
    }
    const next = [...charRefs, emptyCharacterReference()];
    onChange("characterReferences", serializeCharRefs(next));
  }

  function removeCharRef(idx: number) {
    if (charRefs.length <= 1) {
      toast.info("At least one character reference is recommended");
      return;
    }
    const next = charRefs.filter((_, i) => i !== idx);
    onChange("characterReferences", serializeCharRefs(next));
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Personal Information"
        description="Your identity, contact details, and legal declarations"
        icon={User}
        action={
          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
            {/* Autosave indicator — everything typed here persists on its own
                (debounced ~1s after the last keystroke); Save stays as the
                explicit flush / retry path. */}
            <span aria-live="polite" className="inline-flex items-center gap-1.5 text-xs font-semibold">
              {autosave === "saving" && (
                <>
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  <span className="text-muted-foreground">Autosaving…</span>
                </>
              )}
              {autosave === "saved" && (
                <>
                  <CheckCircle2 className="size-3.5 text-success" />
                  <span className="text-success-ink">Autosaved</span>
                </>
              )}
              {autosave === "error" && (
                <>
                  <AlertCircle className="size-3.5 text-danger-ink" />
                  <span className="text-danger-ink">Autosave failed — click Save</span>
                </>
              )}
            </span>
            <Button
              onClick={onSave}
              disabled={!dirty || saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
              )}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        }
      />

      {fromExtraction.size > 0 && (
        <div className="flex items-start gap-2.5 rounded-none border border-primary/40 bg-primary/10 px-3.5 py-2.5 text-xs leading-relaxed text-info-ink">
          <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-info-ink" />
          <span>
            <strong>{fromExtraction.size} fields</strong> were pre-filled from your
            uploaded documents. Please verify each highlighted field before saving.
          </span>
        </div>
      )}

      {/* IDENTITY */}
      <section className="overflow-hidden rounded-none border border-border bg-card">
        <div className="border-b border-border px-5 py-3.5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Identity</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          <FieldWithExtraction
            label="First Name"
            value={form.firstName as string}
            fromExtraction={fromExtraction.has("firstName")}
            onChange={(v) => onChange("firstName", v)}
            required
          />
          <FieldWithExtraction
            label="Middle Name"
            value={form.middleName as string}
            fromExtraction={fromExtraction.has("middleName")}
            onChange={(v) => onChange("middleName", v)}
          />
          <FieldWithExtraction
            label="Last Name"
            value={form.lastName as string}
            fromExtraction={fromExtraction.has("lastName")}
            onChange={(v) => onChange("lastName", v)}
            required
          />
          <FieldWithExtraction
            label="Extension Name"
            value={form.extensionName as string}
            fromExtraction={fromExtraction.has("extensionName")}
            onChange={(v) => onChange("extensionName", v)}
            placeholder="Jr., Sr., III"
          />
          <FieldWithExtraction
            label="Email Address"
            value={form.emailAddress as string}
            fromExtraction={fromExtraction.has("emailAddress")}
            onChange={(v) => onChange("emailAddress", v)}
            type="email"
            required
          />
          <FieldWithExtraction
            label="Mobile Number"
            value={form.mobileNumber as string}
            fromExtraction={fromExtraction.has("mobileNumber")}
            onChange={(v) => onChange("mobileNumber", v)}
            placeholder="09XXXXXXXXX"
          />
          <FieldWithExtraction
            label="Contact Number"
            value={form.contactNumber as string}
            fromExtraction={fromExtraction.has("contactNumber")}
            onChange={(v) => onChange("contactNumber", v)}
          />
          <FieldWithExtraction
            label="Date of Birth"
            value={form.birthDate as string}
            fromExtraction={fromExtraction.has("birthDate")}
            onChange={(v) => onChange("birthDate", v)}
            type="date"
          />
          <FieldWithExtraction
            label="Place of Birth"
            value={form.birthPlace as string}
            fromExtraction={fromExtraction.has("birthPlace")}
            onChange={(v) => onChange("birthPlace", v)}
          />
          <SelectField
            label="Gender"
            value={form.gender as string}
            fromExtraction={fromExtraction.has("gender")}
            onChange={(v) => onChange("gender", v)}
            options={[
              { value: "Male", label: "Male" },
              { value: "Female", label: "Female" },
            ]}
            placeholder="Select gender"
          />
          <SelectField
            label="Civil Status"
            value={form.civilStatus as string}
            fromExtraction={fromExtraction.has("civilStatus")}
            onChange={(v) => onChange("civilStatus", v)}
            options={[
              { value: "Single", label: "Single" },
              { value: "Married", label: "Married" },
              { value: "Widowed", label: "Widowed" },
              { value: "Separated", label: "Separated" },
              { value: "Divorced", label: "Divorced" },
            ]}
            placeholder="Select civil status"
          />
          <FieldWithExtraction
            label="Citizenship"
            value={form.citizenship as string}
            fromExtraction={fromExtraction.has("citizenship")}
            onChange={(v) => onChange("citizenship", v)}
          />
          <FieldWithExtraction
            label="Religion"
            value={form.religion as string}
            fromExtraction={fromExtraction.has("religion")}
            onChange={(v) => onChange("religion", v)}
          />
          <SelectField
            label="PWD (Person with Disability)"
            value={form.isPwd ? "Yes" : "No"}
            fromExtraction={false}
            onChange={(v) => onChange("isPwd", v === "Yes")}
            options={[
              { value: "No", label: "No" },
              { value: "Yes", label: "Yes" },
            ]}
          />
          <FieldWithExtraction
            label="Ethnicity / Indigenous Group"
            value={form.ethnicity as string}
            fromExtraction={fromExtraction.has("ethnicity")}
            onChange={(v) => onChange("ethnicity", v)}
          />
        </div>
      </section>

      {/* ADDRESS */}
      <section className="overflow-hidden rounded-none border border-border bg-card">
        <div className="border-b border-border px-5 py-3.5">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Address</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <FieldWithExtraction
              label="Present Address"
              value={form.presentAddress as string}
              fromExtraction={fromExtraction.has("presentAddress")}
              onChange={(v) => onChange("presentAddress", v)}
            />
          </div>
          <FieldWithExtraction
            label="City"
            value={form.city as string}
            fromExtraction={fromExtraction.has("city")}
            onChange={(v) => onChange("city", v)}
          />
          <FieldWithExtraction
            label="Province"
            value={form.province as string}
            fromExtraction={fromExtraction.has("province")}
            onChange={(v) => onChange("province", v)}
          />
          <FieldWithExtraction
            label="Country"
            value={form.country as string}
            fromExtraction={fromExtraction.has("country")}
            onChange={(v) => onChange("country", v)}
          />
          <FieldWithExtraction
            label="Zip Code"
            value={form.zipCode as string}
            fromExtraction={fromExtraction.has("zipCode")}
            onChange={(v) => onChange("zipCode", v)}
          />
        </div>
      </section>

      {/* LEGAL */}
      <section className="overflow-hidden rounded-none border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Legal Information
          </h3>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectField
              label="Have you ever been found guilty of any administrative offense?"
              value={form.adminCase ? "Yes" : "No"}
              onChange={(v) => onChange("adminCase", v === "Yes")}
              options={[
                { value: "No", label: "No" },
                { value: "Yes", label: "Yes" },
              ]}
            />
            {form.adminCase && (
              <FieldWithExtraction
                label="Administrative Offense Details"
                value={form.adminCaseDetails as string}
                fromExtraction={false}
                onChange={(v) => onChange("adminCaseDetails", v)}
              />
            )}
            <SelectField
              label="Have you been criminally charged before any court?"
              value={form.crimeCharge ? "Yes" : "No"}
              onChange={(v) => onChange("crimeCharge", v === "Yes")}
              options={[
                { value: "No", label: "No" },
                { value: "Yes", label: "Yes" },
              ]}
            />
            {form.crimeCharge && (
              <>
                <FieldWithExtraction
                  label="Criminal Charge Date"
                  value={form.crimeDate as string}
                  fromExtraction={false}
                  onChange={(v) => onChange("crimeDate", v)}
                  type="date"
                />
                <FieldWithExtraction
                  label="Case Status"
                  value={form.crimeCaseStatus as string}
                  fromExtraction={false}
                  onChange={(v) => onChange("crimeCaseStatus", v)}
                  placeholder="Pending, Dismissed, etc."
                />
              </>
            )}
          </div>
        </div>
      </section>

      {/* CHARACTER REFERENCES */}
      <section className="overflow-hidden rounded-none border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Character References
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              At least 1 reference recommended (max 5)
            </p>
          </div>
          <Button
            onClick={addCharRef}
            variant="outline"
            size="sm"
          >
            <Plus className="h-3.5 w-3.5" /> Add Reference
          </Button>
        </div>
        <div className="space-y-3 p-5">
          {charRefs.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No character references yet. Click &quot;Add Reference&quot; to add one.
            </div>
          ) : (
            <div className="sm:max-h-[480px] sm:overflow-y-auto sm:pr-2">
              <div className="space-y-3 pr-1">
                {charRefs.map((ref, idx) => (
                  <div
                    key={idx}
                    className="rounded-none border border-border bg-secondary/60 p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="kicker text-muted-foreground">
                        Reference {idx + 1}
                      </span>
                      {charRefs.length > 1 && (
                        <Button
                          onClick={() => removeCharRef(idx)}
                          variant="ghost"
                          size="icon"
                          className="size-11 sm:size-8 rounded-none text-muted-foreground hover:bg-destructive/10 hover:text-danger-ink"
                          aria-label="Remove reference"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <RefInput
                        label="Full Name"
                        value={ref.name}
                        onChange={(v) => updateCharRef(idx, "name", v)}
                      />
                      <RefInput
                        label="Job Title"
                        value={ref.title}
                        onChange={(v) => updateCharRef(idx, "title", v)}
                      />
                      <RefInput
                        label="Company Name"
                        value={ref.company}
                        onChange={(v) => updateCharRef(idx, "company", v)}
                      />
                      <RefInput
                        label="Company Address"
                        value={ref.companyAddress}
                        onChange={(v) => updateCharRef(idx, "companyAddress", v)}
                        className="md:col-span-2"
                      />
                      <RefInput
                        label="Email"
                        value={ref.email}
                        onChange={(v) => updateCharRef(idx, "email", v)}
                        type="email"
                      />
                      <RefInput
                        label="Contact Number"
                        value={ref.contact}
                        onChange={(v) => updateCharRef(idx, "contact", v)}
                        placeholder="09XXXXXXXXX"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
