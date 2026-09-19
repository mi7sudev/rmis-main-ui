// ============================================================================
// CSC requirement registries — standardized choices shared by the job posting
// form (HR side) and the applicant profile eligibility form, so both sides of
// the qualification pipeline pick from the same option lists.
// ----------------------------------------------------------------------------
// EDUCATION — the option list implements CSC Memorandum Circular No. 07,
// s. 2025 (pursuant to CSC Resolution No. 2500229, promulgated 06 March 2025):
// "Amendment to the Education Requirements of First Level Positions in the
// Government", effective prospectively on 13 June 2025. The circular replaces
// the old "High School Graduate" requirements with K-12-aware alternatives —
// each entry below is ONE amended requirement line from the MC 07 table:
//
//   Existing requirement                          →  Amended requirement
//   ----------------------------                     ---------------------
//   High School Graduate                            →  HS Graduate (prior to 2016) OR
//                                                      Grade 10/JHS (starting 2016)
//   HS Graduate or relevant vocational/trade course →  HS Graduate (prior to 2016) OR
//                                                      Grade 10/JHS (starting 2016) OR
//                                                      relevant vocational/trade course
//   2 years of studies in college                   →  2 years college (prior to 2018) OR
//                                                      Grade 12/SHS (starting 2016)*
//   2 years college or HS Grad w/ relevant
//   vocational/trade course                         →  2 years college (prior to 2018) OR
//                                                      HS Grad w/ relevant vocational/
//                                                      trade course (prior to 2018) OR
//                                                      Grade 12/SHS under TVL Track OR
//                                                      Grade 10/JHS w/ relevant
//                                                      vocational/trade course
//                                                      (TESDA NC II) (starting 2018)
//
//   * In light of the SHS Modeling Program implemented as early as SY 2014-2015.
//
// Per the circular, the amendment does NOT apply to first level positions with
// agency-specific/higher education requirements previously approved by the CSC,
// nor to positions involving practice of a profession regulated by board laws.
//
// Each option is stored VERBATIM in the linked position record's
// `cscEducation` column, so the MQR engine's token matcher keeps working
// (see src/lib/mqr.ts). HR can still type a custom requirement — the job
// form uses creatable comboboxes, never a hard-locked select.
//
// ELIGIBILITY — the standard Civil Service Commission eligibility categories
// (second/sub-level eligibilities, special eligibilities, and RA 1080
// board/bar eligibility). Stored verbatim in the position's
// `cscEligibilityGroup` column.
// ============================================================================

/**
 * Education requirement options for the job posting form.
 * The first group implements MC 07, s. 2025 (first level positions); the
 * second group covers second level and higher positions.
 */
export const CSC_EDUCATION_REQUIREMENTS = {
  /** MC 07, s. 2025 — amended education requirements (first level positions). */
  firstLevel: [
    "High School Graduate (prior to 2016)",
    "Completion of Grade 10/Junior High School (starting 2016)",
    "Completion of relevant vocational/trade course",
    "Completion of 2 years of studies in college (prior to 2018)",
    "High School Graduate with relevant vocational/trade course (prior to 2018)",
    "Completion of Grade 12/Senior High School (starting 2016)",
    "Completion of Grade 12/Senior High School under Technical-Vocational-Livelihood Track",
    "Completion of Grade 10/Junior High School with relevant vocational/trade course (TESDA NC II) (starting 2018)",
  ],
  /** Standard requirements for second level and higher positions. */
  higherLevel: [
    "Completion of 2 years of studies in college",
    "Bachelor's degree",
    "Bachelor's degree relevant to the job",
    "Master's degree",
    "Doctorate degree",
  ],
} as const;

/** Hint tag rendered under each MC 07 education option in the combobox. */
export const MC07_HINT = "MC 07, s. 2025";

/** Standard CSC eligibility options for the job posting form. */
export const CSC_ELIGIBILITY_OPTIONS = [
  "Career Service Sub-Professional (First Level) Eligibility",
  "Career Service Professional (Second Level) Eligibility",
  "Honor Graduate Eligibility (PD 907)",
  "Bar/Board Eligibility (RA 1080)",
  "Barangay Official Eligibility (RA 7160)",
  "Veteran Preference Rating (EO 790)",
  "Solo Parent Eligibility (CSC MC 08, s. 2021)",
  "Science and Technology Specialist Eligibility (RA 10672)",
] as const;

/**
 * One-line description per standard eligibility, rendered as the secondary
 * line UNDER each option in the eligibility dropdowns (applicant profile
 * form AND the job posting form) — mirroring the MC 07 hint-tag treatment
 * the education requirement options get. Grounded in each issuance's grant
 * rule (exam-passed, honor-based, conferred under special laws, etc.).
 */
export const ELIGIBILITY_DESCRIPTIONS: Record<string, string> = {
  "Career Service Sub-Professional (First Level) Eligibility":
    "Earned by passing the Career Service Exam — Sub-Professional level; qualifies you for first level positions.",
  "Career Service Professional (Second Level) Eligibility":
    "Earned by passing the Career Service Exam — Professional level; qualifies you for second level positions.",
  "Honor Graduate Eligibility (PD 907)":
    "Automatic eligibility for college graduates who finished with honors (cum laude or higher).",
  "Bar/Board Eligibility (RA 1080)":
    "Earned by passing the Bar examination or a government professional board examination.",
  "Barangay Official Eligibility (RA 7160)":
    "For duly elected barangay officials who have completed their term of office.",
  "Veteran Preference Rating (EO 790)":
    "Preference rating in civil service examinations granted to veterans and/or their dependents.",
  "Solo Parent Eligibility (CSC MC 08, s. 2021)":
    "For qualified solo parents under RA 8972, as implemented by CSC MC 08, s. 2021.",
  "Science and Technology Specialist Eligibility (RA 10672)":
    "For graduates of science, mathematics, statistics, or engineering courses under RA 10672.",
};

/**
 * Look up the description for an eligibility title (case-insensitive, with
 * legacy alias normalization). Returns "" when no standard description
 * exists (custom "Others" titles).
 */
export function getEligibilityDescription(
  title: string | null | undefined
): string {
  const normalized = normalizeLegacyEligibilityName(title);
  if (!normalized) return "";
  if (ELIGIBILITY_DESCRIPTIONS[normalized])
    return ELIGIBILITY_DESCRIPTIONS[normalized];
  const key = normalized.toLowerCase();
  for (const [name, description] of Object.entries(ELIGIBILITY_DESCRIPTIONS)) {
    if (name.toLowerCase() === key) return description;
  }
  return "";
}

/**
 * Merge the standard CSC eligibility registry with DB reference rows
 * (custom titles HR or applicants actually used) into ONE deduplicated
 * dropdown list.
 *
 * Used by BOTH sides of the qualification pipeline so applicants pick from
 * the exact same strings HR picks from when writing a job's eligibility
 * requirement — which also maximizes the MQR engine's token-based match
 * (see src/lib/mqr.ts): an applicant who selects
 * "Career Service Professional (Second Level) Eligibility" satisfies a
 * posting requiring that same string verbatim.
 *
 * Dedupe is case-insensitive; CSC registry entries come first. DB rows are
 * normalized before dedupe: legacy short titles ("Career Service
 * Professional") collapse into their official registry strings instead of
 * showing as near-duplicates, and non-holdable vocabulary ("None Required")
 * is dropped — the CSC registry is the only source of standard options.
 */
export function mergeEligibilityOptions(
  dbNames: readonly (string | null | undefined)[] = []
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(name.trim());
  };
  for (const option of CSC_ELIGIBILITY_OPTIONS) push(option);
  for (const raw of dbNames) {
    if (!raw) continue;
    const name = normalizeLegacyEligibilityName(raw);
    if (NON_HOLDABLE_ELIGIBILITY_TITLES.has(name.toLowerCase())) continue;
    push(name);
  }
  return merged;
}

// ============================================================================
// ELIGIBILITY FORM FIELD SPECS — each eligibility type collects its own set
// of detail fields, following the CSC Personal Data Sheet (CS Form No. 212)
// and the granting rules of each eligibility:
//
//   * EXAM-BASED (the two Career Service levels + Bar/Board): the eligibility
//     is earned by passing an examination, so the form collects a RATING
//     (percentage), the exam date and the exam place. Bar/Board eligibility
//     (RA 1080) additionally regulated professions carry a PRC license, so
//     License Number + License Validity are collected too.
//
//   * CONFERMENT-BASED (Honor Graduate, Barangay Official, Veteran
//     Preference, Solo Parent, S&T Specialist): there is NO examination —
//     the CSC CONFERS the eligibility, so the form collects the conferment
//     date and place instead. These map onto the same storage columns
//     (examDate/examPlace), which in the PDS are labeled
//     "Date/Place of Examination/CONFERMENT" — only the displayed labels
//     change, so extraction, the MQR engine and the API are untouched.
//
//   * UNKNOWN titles ("None Required", "Others (type manually)", custom
//     titles from extraction): fall back to the full PDS field set.
// ============================================================================

/** Which detail fields apply for an eligibility type, with display labels. */
export type EligibilityFieldSpec = {
  rating?: { label: string; placeholder?: string };
  examDate?: { label: string };
  examPlace?: { label: string };
  licenseNumber?: { label: string };
  licenseValidity?: { label: string };
};

const CS_EXAM_FIELDS: EligibilityFieldSpec = {
  rating: { label: "Rating", placeholder: "e.g. 85.50%" },
  examDate: { label: "Exam Date" },
  examPlace: { label: "Exam Place" },
};

const CONFERMENT_FIELDS: EligibilityFieldSpec = {
  examDate: { label: "Date of Conferment" },
  examPlace: { label: "Place of Conferment" },
};

/** Per-type specs keyed by the registry strings in CSC_ELIGIBILITY_OPTIONS. */
export const ELIGIBILITY_FIELD_SPECS: Record<string, EligibilityFieldSpec> = {
  "Career Service Sub-Professional (First Level) Eligibility": CS_EXAM_FIELDS,
  "Career Service Professional (Second Level) Eligibility": CS_EXAM_FIELDS,
  "Honor Graduate Eligibility (PD 907)": CONFERMENT_FIELDS,
  "Bar/Board Eligibility (RA 1080)": {
    rating: { label: "Board Rating", placeholder: "e.g. 85.50%" },
    examDate: { label: "Board Exam Date" },
    examPlace: { label: "Board Exam Place" },
    licenseNumber: { label: "License Number" },
    licenseValidity: { label: "License Validity" },
  },
  "Barangay Official Eligibility (RA 7160)": CONFERMENT_FIELDS,
  "Veteran Preference Rating (EO 790)": {
    rating: { label: "Preference Rating", placeholder: "e.g. 10%" },
    examDate: { label: "Date of Conferment" },
    examPlace: { label: "Place of Conferment" },
  },
  "Solo Parent Eligibility (CSC MC 08, s. 2021)": CONFERMENT_FIELDS,
  "Science and Technology Specialist Eligibility (RA 10672)":
    CONFERMENT_FIELDS,
};

/** Legacy DB reference titles (pre-registry) → their equivalent spec. */
const LEGACY_ELIGIBILITY_FIELD_ALIASES: Record<string, string> = {
  "career service professional":
    "Career Service Professional (Second Level) Eligibility",
  "career service sub-professional":
    "Career Service Sub-Professional (First Level) Eligibility",
};

/**
 * Map a legacy/short eligibility title to its official registry string
 * ("Career Service Professional" → "Career Service Professional (Second
 * Level) Eligibility"). Non-legacy titles pass through unchanged. Used by
 * the dropdown merge AND by edit pre-selection so legacy-saved entries
 * display and re-save under the official name (self-healing data).
 */
export function normalizeLegacyEligibilityName(
  name: string | null | undefined
): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return "";
  return (
    LEGACY_ELIGIBILITY_FIELD_ALIASES[trimmed.toLowerCase()] ?? trimmed
  );
}

/** Titles that are requirement vocabulary, not eligibilities an applicant can HOLD. */
const NON_HOLDABLE_ELIGIBILITY_TITLES = new Set(["none required"]);

/** Full PDS field set — fallback for "Others" and unknown/custom titles. */
export const DEFAULT_ELIGIBILITY_FIELD_SPEC: EligibilityFieldSpec = {
  rating: { label: "Rating", placeholder: "e.g. 85.50%" },
  examDate: { label: "Exam Date" },
  examPlace: { label: "Exam Place" },
  licenseNumber: { label: "License No." },
  licenseValidity: { label: "License Validity" },
};

/**
 * True when a title is NOT one of the standard registry types — i.e. a
 * free-text "Others" entry (or an extraction-sourced custom title). Such
 * entries carry no typed detail fields, so profile cards and evaluator
 * views render only the title itself (plus any legacy detail data that
 * happens to exist, instead of a wall of "—" rows).
 */
export function isCustomEligibilityTitle(
  title: string | null | undefined
): boolean {
  const trimmed = title?.trim() ?? "";
  if (!trimmed) return false;
  if (ELIGIBILITY_FIELD_SPECS[trimmed]) return false;
  const key = trimmed.toLowerCase();
  for (const name of Object.keys(ELIGIBILITY_FIELD_SPECS)) {
    if (name.toLowerCase() === key) return false;
  }
  return !LEGACY_ELIGIBILITY_FIELD_ALIASES[key];
}

/**
 * Resolve the field spec for an eligibility title. Exact registry match,
 * then case-insensitive scan, then legacy alias, then the full PDS default.
 */
export function getEligibilityFieldSpec(
  title: string | null | undefined
): EligibilityFieldSpec {
  if (!title?.trim()) return DEFAULT_ELIGIBILITY_FIELD_SPEC;
  const trimmed = title.trim();
  const direct = ELIGIBILITY_FIELD_SPECS[trimmed];
  if (direct) return direct;
  const key = trimmed.toLowerCase();
  for (const [name, spec] of Object.entries(ELIGIBILITY_FIELD_SPECS)) {
    if (name.toLowerCase() === key) return spec;
  }
  const legacy = LEGACY_ELIGIBILITY_FIELD_ALIASES[key];
  if (legacy) return ELIGIBILITY_FIELD_SPECS[legacy];
  return DEFAULT_ELIGIBILITY_FIELD_SPEC;
}
