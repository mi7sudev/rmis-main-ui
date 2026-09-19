// MQR Engine — Minimum Qualification Requirements verification
// Preserves the token-based matching logic from the original RMIS backend.
// Verdict strings are the MOM-mandated vocabulary (see verifyMqr below).

import type { Applicant, Position } from "@prisma/client";

type MqrResult = {
  education: string;
  eligibility: string;
  workExperience: string;
  training: string;
};

const GENERIC_EDUCATION_WORDS = new Set([
  "bachelor", "bachelors", "degree", "of", "in", "arts", "major", "minor",
  "course", "program", "career", "service", "to", "the", "science",
]);

const GENERIC_ELIGIBILITY_WORDS = new Set([
  "career", "service", "eligibility", "second", "level", "professional",
]);

function tokenize(text: string | null | undefined, drop?: Set<string>): string[] {
  if (!text) return [];
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const tokens = lower.split(/\s+/).filter(Boolean);
  if (drop) return tokens.filter((t) => !drop.has(t));
  return tokens;
}

function extractNumber(text: string | null | undefined): number {
  if (!text) return 0;
  const parenMatch = text.match(/\((\d+)\)/);
  if (parenMatch) return parseInt(parenMatch[1], 10);
  const numMatch = text.match(/(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return 0;
}

export function verifyMqr(
  applicant: Applicant & {
    educations: { course: string | null; specifyOthers: string | null }[];
    workExperiences: { yearDecimal: number | null }[];
    trainings: { hourDecimal: number | null; numberHours: number | null }[];
    eligibilities: { eligibilityTitle: string | null }[];
  },
  position: Position
): MqrResult {
  // 1) Education match (token-based)
  const requiredEduTokens = tokenize(position.cscEducation, GENERIC_EDUCATION_WORDS);
  const applicantEduTokens = new Set<string>();
  for (const edu of applicant.educations) {
    const combined = `${edu.course || ""} ${edu.specifyOthers || ""}`;
    for (const t of tokenize(combined, GENERIC_EDUCATION_WORDS)) applicantEduTokens.add(t);
  }

  let educationMeets = false;
  if (requiredEduTokens.length === 0 || position.cscEducation?.toLowerCase().includes("relevant")) {
    educationMeets = applicantEduTokens.size > 0 || requiredEduTokens.length === 0;
  } else {
    const matched = requiredEduTokens.filter((t) => applicantEduTokens.has(t));
    educationMeets = matched.length >= Math.min(2, requiredEduTokens.length);
    if (!educationMeets && applicantEduTokens.has("bachelor")) {
      educationMeets = matched.length >= 1;
    }
  }

  // 2) Eligibility match (subset)
  const rawEligRequirement = (position.cscEligibilityGroup ?? "").trim();
  const requiredEligTokens = tokenize(position.cscEligibilityGroup, GENERIC_ELIGIBILITY_WORDS);
  const applicantEligTokens = new Set<string>();
  for (const el of applicant.eligibilities) {
    for (const t of tokenize(el.eligibilityTitle || "")) applicantEligTokens.add(t);
  }

  const eligReq = rawEligRequirement.toLowerCase();
  let eligibilityMeets: boolean;
  if (!rawEligRequirement || eligReq === "n/a" || eligReq === "na" || eligReq === "none") {
    // The position does not require an eligibility.
    eligibilityMeets = true;
  } else if (requiredEligTokens.length === 0) {
    // The requirement consists ENTIRELY of generic CSC boilerplate after
    // stripping filler words — e.g. "Career Service Professional" and
    // "Second Level Eligibility" (the two most common groups; every word in
    // both phrases is in GENERIC_ELIGIBILITY_WORDS). Previously this branch
    // auto-PASSED everyone, including applicants with ZERO eligibility
    // entries. Government intent: the applicant must HOLD an eligibility;
    // exact title equivalence is screened by HR during selection.
    eligibilityMeets = applicant.eligibilities.length > 0;
  } else {
    eligibilityMeets = requiredEligTokens.every((t) => applicantEligTokens.has(t));
  }

  // 3) Work experience (sum of years)
  const requiredYears = extractNumber(position.cscWorkExperience || "");
  const totalYears = applicant.workExperiences.reduce(
    (sum, w) => sum + (w.yearDecimal || 0),
    0
  );
  const workMeets = totalYears >= requiredYears;

  // 4) Training (sum of hours)
  const requiredHours = extractNumber(position.cscTrainingRequirements || "");
  const totalHours = applicant.trainings.reduce(
    (sum, t) => sum + (t.hourDecimal || t.numberHours || 0),
    0
  );
  const trainingMeets = totalHours >= requiredHours;

  // MOM (2026-09-03) — exact qualification messages mandated by HR:
  //   "Meets the minimum requirements" / "Does not meet the minimum requirements"
  const meets = "Meets the minimum requirements";
  const fails = "Does not meet the minimum requirements";

  return {
    education: educationMeets ? meets : `${fails} — ${requiredEduTokens.length ? requiredEduTokens.join(", ") : "no match"}`,
    eligibility: eligibilityMeets ? meets : fails,
    workExperience: workMeets
      ? meets
      : `${fails} — ${totalYears.toFixed(1)} / ${requiredYears} years`,
    training: trainingMeets
      ? meets
      : `${fails} — ${totalHours} / ${requiredHours} hours`,
  };
}

export function allMet(result: MqrResult): boolean {
  return Object.values(result).every((v) => v === "Meets the minimum requirements");
}
