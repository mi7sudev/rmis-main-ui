"use client";

import { formatDate } from "@/lib/client";
import {
  getEligibilityFieldSpec,
  isCustomEligibilityTitle,
} from "@/lib/csc-requirements";
import { type JobPosition, type Job as WireJob } from "@/lib/wire";
import { FieldRow } from "@/components/views/shared";
import type { RequirementsReport } from "@/lib/requirements";
export type { RequirementCheck, RequirementsReport } from "@/lib/requirements";

// ============================================================
// Types
// ============================================================

export type Applicant = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  contactNumber: string | null;
  gender: string | null;
  civilStatus: string | null;
  citizenship: string | null;
  isProfileComplete: boolean;
};

// Job block of GET /api/evaluator/applications/:id, derived from the wire
// module — fixes the historical id drift (DB ids are numeric, never strings).
export type Position = Pick<
  JobPosition,
  | "id"
  | "positionTitle"
  | "itemNumber"
  | "salaryGrade"
  | "salaryAmount"
  | "cscEducation"
  | "cscWorkExperience"
  | "cscTrainingRequirements"
  | "cscEligibilityGroup"
> & {
  placeOfAssignment: { id: number; name: string | null } | null;
};

type ApplicationJob = Pick<WireJob, "id" | "title"> & {
  position: Position | null;
};

export type StatusChange = {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  createdAt: string;
  changedBy: { firstName: string | null; lastName: string | null } | null;
};

export type Document = {
  id: string;
  originalName: string;
  fileName: string;
  filePath: string;
  category: string;
  status: string;
  mimeType: string;
  size: number;
};

export type ApplicationDetail = {
  id: number;
  status: string;
  dateApplied: string;
  applicant: Applicant;
  job: ApplicationJob;
  statusChanges: StatusChange[];
  /** Requirements match — applicant's snapshot vs the job's CSC standards. */
  requirements: RequirementsReport | null;
  snapshots: {
    profile: Record<string, unknown> | null;
    educations: Record<string, unknown>[];
    experiences: Record<string, unknown>[];
    trainings: Record<string, unknown>[];
    eligibilities: Record<string, unknown>[];
    awards: Record<string, unknown>[];
    documents: { id: string; originalName: string; category: string; status: string }[];
  };
  documents: Document[];
};

// ============================================================
// REVISED WORKFLOW — no evaluation form
// ============================================================
//
// The evaluator reviews the applicant's CREDENTIALS, BACKGROUND and
// DOCUMENTS (the snapshots + documents rendered below and in the review
// workspace), then records a single decision:
//
//   · Shortlisted → the applicant automatically receives an EMAIL notice
//     (face-to-face hand-off: HR contacts them; succeeding steps happen
//     in person). A best-effort SMS is sent alongside.
//   · Rejected → a simple email/SMS notice informs the applicant.
//
// There is deliberately NO scoring form, no draft state and no overall
// rating — legacy assessment rows in the DB are no longer surfaced.

// ============================================================
// Snapshot render helpers
// ============================================================

export function renderEducation(e: Record<string, unknown>) {
  const rows: [string, unknown][] = [
    ["Level", e.educationLevel],
    ["Degree", e.degree],
    ["Course", e.course],
    ["Specify Others", e.specifyOthers],
    ["School", e.schoolName],
    ["Year Graduated", e.yearGraduated],
    ["Units Earned", e.unitsEarned],
    ["Ongoing", e.ongoing ? "Yes" : null],
    ["Highest", e.isHighestEducation ? "Yes" : null],
  ];
  return rows.map(([l, v]) => <FieldRow key={l} label={l} value={v as string} />);
}

export function renderExperience(e: Record<string, unknown>) {
  const rows: [string, unknown][] = [
    ["Position", e.positionTitle],
    ["Employer", e.employerName],
    ["Employer Address", e.employerAddress],
    ["Status", e.statusOfEmployment],
    ["From", e.inclusiveDateFrom ? formatDate(e.inclusiveDateFrom as string) : null],
    ["To", e.inclusiveDateTo ? formatDate(e.inclusiveDateTo as string) : null],
    ["Present Work", e.isPresentWork ? "Yes" : null],
    ["Govt Service", e.isGovtService ? "Yes" : "No"],
    ["Monthly Salary", e.monthlySalary ? `₱${Number(e.monthlySalary).toLocaleString()}` : null],
    ["Years", e.yearDecimal ? `${e.yearDecimal} yrs` : null],
    ["Reason for Leaving", e.reasonForLeaving],
  ];
  return rows.map(([l, v]) => <FieldRow key={l} label={l} value={v as string} />);
}

export function renderTraining(t: Record<string, unknown>) {
  const rows: [string, unknown][] = [
    ["Title", t.titleOfTraining],
    ["Type", t.typeOfTraining],
    ["Specify", t.specifyTraining],
    ["From", t.inclusiveDateFrom ? formatDate(t.inclusiveDateFrom as string) : null],
    ["To", t.inclusiveDateTo ? formatDate(t.inclusiveDateTo as string) : null],
    ["Hours", t.numberHours ? `${t.numberHours} hrs` : null],
    ["Decimal Hours", t.hourDecimal ? `${t.hourDecimal} hrs` : null],
  ];
  return rows.map(([l, v]) => <FieldRow key={l} label={l} value={v as string} />);
}

export function renderEligibility(el: Record<string, unknown>) {
  // Per-type field labels — same spec the applicant form uses (exam-based
  // types show Rating/Exam Date/Exam Place, Bar/Board adds license fields,
  // conferment types show Date/Place of Conferment). Non-applicable fields
  // are hidden entirely instead of rendering as "—". Free-text "Others"
  // entries (custom titles) show only the title plus detail fields that
  // actually carry a value (legacy data) — never empty placeholder rows.
  const custom = isCustomEligibilityTitle(el.eligibilityTitle as string);
  const spec = getEligibilityFieldSpec(el.eligibilityTitle as string);
  const keep = (v: unknown) => (custom ? v != null && v !== "" : true);
  const rows: [string, unknown][] = [["Title", el.eligibilityTitle]];
  if (spec.rating && keep(el.rating))
    rows.push([spec.rating.label, el.rating]);
  if (spec.examDate && keep(el.examDate))
    rows.push([
      spec.examDate.label,
      el.examDate ? formatDate(el.examDate as string) : null,
    ]);
  if (spec.examPlace && keep(el.examPlace))
    rows.push([spec.examPlace.label, el.examPlace]);
  if (spec.licenseNumber && keep(el.licenseNumber))
    rows.push([spec.licenseNumber.label, el.licenseNumber]);
  if (spec.licenseValidity && keep(el.licenseValidity))
    rows.push([
      spec.licenseValidity.label,
      el.licenseValidity ? formatDate(el.licenseValidity as string) : null,
    ]);
  return rows.map(([l, v]) => <FieldRow key={l} label={l} value={v as string} />);
}

export function renderAward(a: Record<string, unknown>) {
  const rows: [string, unknown][] = [
    ["Type", a.recognitionType],
    ["Award Type", a.awardType],
    ["Scope", a.recognitionScope],
    ["Category", a.recognitionCategory],
    ["Subcategory", a.recognitionSubcategory],
    ["Details", a.recognitionDetails],
    ["Provider", a.recognitionProvider],
    ["Date Granted", a.dateGranted ? formatDate(a.dateGranted as string) : null],
    ["Points", a.points],
  ];
  return rows.map(([l, v]) => <FieldRow key={l} label={l} value={v as string} />);
}
