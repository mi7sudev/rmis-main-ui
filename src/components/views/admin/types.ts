"use client";

// ---------- Types ----------
export type PlaceOfAssignment = { id: string; name: string };

export type Position = {
  id: string;
  itemNumber: string | null;
  positionTitle: string | null;
  positionType: string | null;
  positionStatus: string | null;
  positionLevel: number | null;
  salaryGrade: string | null;
  salaryStep: string | null;
  salaryAmount: number | null;
  division: string | null;
  section: string | null;
  classification: string | null;
  cscEducation: string | null;
  cscEligibility: string | null;
  cscEligibilityGroup: string | null;
  cscWorkExperience: string | null;
  cscTrainingRequirements: string | null;
  preferredQualification: string | null;
  competencyRequirements: string | null;
  specialSkill: string | null;
  placeOfAssignmentId: string | null;
  placeOfAssignment: { name: string } | null;
  _count: { jobPostings: number };
};

// NOTE: the Job wire shape moved to @/lib/wire (THE wire-shape module) —
// admin views consume it via JobRow in @/lib/hooks/use-admin-data.

export const POSITION_TYPES = ["Permanent", "Contractual", "Job Order", "Temporary", "COS"];

// ---------- Helpers ----------
export function toDateInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
