// ============================================================================
// requirements.ts — Job Requirements Match engine (reviewer-side)
//
// Computes, for ONE application, whether the applicant's snapshotted
// credentials (education / work experience / training / eligibility) satisfy
// the specific job's CSC qualification standards stored on the Position row
// (csc_education, csc_work_experience, csc_training_requirements,
// csc_eligibility_group).
//
// WHY RECOMPUTE (not persist): production has no mqr_results column and the
// applicant's profile can change after applying — the review must be judged
// against the application's SNAPSHOT (the credentials the reviewer sees),
// against the live Position standards. Pure functions, zero DB access.
//
// STATUS VOCABULARY — deliberately honest about uncertainty:
//   MET          evidence in the snapshot satisfies the standard
//   NOT_MET      evidence present but insufficient (shortfall quantified)
//   NOT_REQUIRED the standard is blank / "None Required" / "N/A"
//   REVIEW       standard (or evidence) too ambiguous to auto-judge —
//                HR verifies manually (never silently fails the applicant)
//
// Input snapshots must already be camelCase (run through
// transformSnapshotKeys at the API boundary).
// ============================================================================

export type CheckStatus = "MET" | "NOT_MET" | "NOT_REQUIRED" | "REVIEW";

export type RequirementCheck = {
  key: "education" | "experience" | "training" | "eligibility";
  label: string;
  /** The CSC standard text as written on the position (null = none). */
  requirement: string | null;
  status: CheckStatus;
  /** False only when status === "NOT_REQUIRED". */
  required: boolean;
  /** One-line summary of the applicant's standing on this dimension. */
  applicantSummary: string;
  /** Short evidence lines pulled from the snapshot (max 3). */
  evidence: string[];
  /** Quantified gap when NOT_MET (e.g. "0.5 more year of experience"). */
  shortfall: string | null;
};

export type RequirementsReport = {
  verdict:
    | "ALL_MET" // every required check MET
    | "PARTIAL" // some MET, some NOT_MET
    | "NONE_MET" // every required check NOT_MET
    | "NEEDS_REVIEW" // no NOT_MET, but at least one REVIEW (manual look)
    | "NO_REQUIREMENTS"; // position declares no standards at all
  metCount: number;
  requiredCount: number; // checks that are NOT_REQUIRED excluded
  checks: RequirementCheck[];
};

export type RequirementPosition = {
  cscEducation: string | null;
  cscWorkExperience: string | null;
  cscTrainingRequirements: string | null;
  cscEligibilityGroup: string | null;
};

export type RequirementSnapshots = {
  educations: Record<string, unknown>[];
  experiences: Record<string, unknown>[];
  trainings: Record<string, unknown>[];
  eligibilities: Record<string, unknown>[];
};

// ============================================================================
// Small helpers
// ============================================================================

/** Read a possibly-null-ish field as a trimmed string. */
function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

/** Case-insensitive "no requirement" detector for standard text. */
function isNoneRequired(text: string): boolean {
  if (!text) return true;
  const t = text.toLowerCase().replace(/[.\s]/g, "");
  return (
    t === "" ||
    t === "n/a" ||
    t === "na" ||
    t === "none" ||
    t.includes("nonerequired") ||
    t.includes("notrequired")
  );
}

/** A standard consisting of ONLY a bare number (legacy FK / ambiguous data). */
function isBareNumber(text: string): boolean {
  return /^\d+(\.\d+)?$/.test(text.trim());
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, twenty: 20, twentyfour: 24, forty: 40,
  eighty: 80, hundred: 100,
};

/** Extract the required quantity (years / hours) from a standard sentence.
 *  Priority: "(4)" paren form → "4 hours" digit+unit → word number → 0. */
function extractQuantity(text: string, unitWord: string): number {
  if (!text) return 0;
  const paren = text.match(/\((\d+)\)/);
  if (paren) return parseInt(paren[1], 10);
  const digitUnit = text.match(new RegExp(`(\\d+)\\s*(?:${unitWord})`, "i"));
  if (digitUnit) return parseInt(digitUnit[1], 10);
  const lower = text.toLowerCase();
  for (const [word, n] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) return n;
  }
  return 0;
}

// ============================================================================
// EDUCATION
// ============================================================================

// 1 elementary · 2 high school · 3 vocational/trade · 4 college/bachelor
// 5 master/graduate · 6 doctor/post-graduate
const EDU_LEVEL_LABEL: Record<number, string> = {
  1: "Elementary",
  2: "High School",
  3: "Vocational / Trade",
  4: "College",
  5: "Master's",
  6: "Post-Graduate",
};

function entryEduLevel(e: Record<string, unknown>): number {
  const hay = [
    str(e.educationLevel), str(e.degree), str(e.course),
    str(e.specifyOthers), str(e.highestLevel),
  ]
    .join(" ")
    .toLowerCase();
  if (/post[-\s]?graduate|doctor|ph\.?\s?d|d\.?m\.?d|s\.?j\.?d/.test(hay)) return 6;
  if (/master|graduate\s+(studies|degree|diploma|program)|\bms\b|\bm\.?s\.?c?\b(?!\w)/.test(hay)) return 5;
  if (/bachelor|\bbs\b|\bba\b|\bab\b|college|undergraduate|b\.?s\.?c\b/.test(hay)) return 4;
  if (/vocational|trade|technical/.test(hay)) return 3;
  if (/high\s?school|secondary|shs|senior\s?high|\bgrade\s?\d+/.test(hay)) return 2;
  if (/elementary|primary|grade\s?school/.test(hay)) return 1;
  return 0;
}

function entryCompleted(e: Record<string, unknown>): boolean {
  if (e.ongoing === true) return false;
  const grad = str(e.yearGraduated);
  const units = str(e.unitsEarned).toLowerCase();
  if (grad && grad !== "0" && !/present|ongoing|n\/a/i.test(grad)) return true;
  if (/graduat/.test(units)) return true;
  // No explicit graduation marker and no "ongoing" flag → assume completed
  // (the PDS form records graduation year for finished levels).
  return true;
}

function entryEduTitle(e: Record<string, unknown>): string {
  return (
    str(e.course) ||
    str(e.degree) ||
    str(e.specifyOthers) ||
    str(e.schoolName) ||
    EDU_LEVEL_LABEL[entryEduLevel(e)] ||
    "Education record"
  );
}

function entryEduEvidence(e: Record<string, unknown>): string {
  const parts: string[] = [];
  const level = entryEduLevel(e);
  if (level) parts.push(EDU_LEVEL_LABEL[level]);
  const title = str(e.course) || str(e.degree) || str(e.specifyOthers);
  if (title && title.toLowerCase() !== parts[0]?.toLowerCase()) parts.push(title);
  const school = str(e.schoolName);
  if (school) parts.push(school);
  const year = str(e.yearGraduated);
  if (year) parts.push(year);
  else if (e.ongoing === true) parts.push("ongoing");
  return parts.join(" · ");
}

// Generic words that never carry course-relevance meaning.
const GENERIC_EDU_TOKENS = new Set([
  "bachelor", "bachelors", "bs", "ba", "ab", "degree", "of", "in", "arts",
  "science", "major", "minor", "course", "program", "career", "service",
  "graduate", "graduated", "completion", "completed", "two",
  "years", "year", "relevant", "the", "a", "an", "to", "or", "and", "with",
  "high", "school", "vocational", "trade", "college", "education", "at",
  "least", "units", "level", "from", "recognized", "accredited", "other",
  "related", "field", "studies", "study", "diploma", "certificate",
  // level indicators, not course fields ("Grade 12/SHS graduate")
  "grade", "shs", "hs", "senior", "junior", "elementary", "primary",
  "secondary", "ged", "job", "jobs", "its", "position",
]);

/** Tokens of a requirement clause that identify a specific course/field. */
function courseTokens(clause: string): string[] {
  // A clause that says "relevant" defers to HR judgment — no course gate.
  if (/\brelevant\b/i.test(clause)) return [];
  return clause
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(
      (t) =>
        t.length > 2 &&
        !GENERIC_EDU_TOKENS.has(t) &&
        !/^\d+$/.test(t),
    );
}

type EduClause = {
  minLevel: number;
  /** "two years in college" style — ongoing/incomplete college qualifies. */
  partialCollege: boolean;
  tokens: string[];
};

/** Parse ONE education alternative clause → its requirement shape (null = unparseable). */
function parseEduClause(clause: string): EduClause | null {
  const t = clause.toLowerCase();
  if (!t.trim()) return null;

  // "Two years in college" / "completed 2 years of college" / "2nd year college"
  if (
    /(?:two|\d+)\s*(?:\(\d+\)\s*)?years?\s*(?:of|in)\s+college/.test(t) ||
    /years?\s+in\s+college/.test(t) ||
    /college\s+(?:level|undergraduate|units)/.test(t)
  ) {
    return { minLevel: 4, partialCollege: true, tokens: [] };
  }
  if (/doctor|ph\.?\s?d|post[-\s]?graduate/.test(t)) return { minLevel: 6, partialCollege: false, tokens: courseTokens(clause) };
  if (/master|graduate\s+(studies|degree|diploma|program)|\bms\b/.test(t)) return { minLevel: 5, partialCollege: false, tokens: courseTokens(clause) };
  // vocational mentioned together with high school → the stricter vocational bar
  if (/vocational|trade|technical/.test(t)) return { minLevel: 3, partialCollege: false, tokens: courseTokens(clause) };
  if (/bachelor|\bbs\b|\bba\b|\bab\b|college|degree|undergraduate/.test(t)) return { minLevel: 4, partialCollege: false, tokens: courseTokens(clause) };
  if (/high\s?school|secondary|shs|senior\s?high|grade\s?12/.test(t)) return { minLevel: 2, partialCollege: false, tokens: courseTokens(clause) };
  if (/elementary|primary|grade\s?school/.test(t)) return { minLevel: 1, partialCollege: false, tokens: courseTokens(clause) };
  return null;
}

function checkEducation(
  position: RequirementPosition,
  snapshots: RequirementSnapshots,
): RequirementCheck {
  const requirement = str(position.cscEducation) || null;
  const entries = snapshots.educations;
  const best = entries
    .map((e) => ({ e, level: entryEduLevel(e) }))
    .sort((a, b) => b.level - a.level)[0];
  const applicantSummary = best
    ? entryEduEvidence(best.e)
    : "No education records on file";

  const base = {
    key: "education" as const,
    label: "Education",
    requirement,
  };

  if (isNoneRequired(requirement ?? "")) {
    return { ...base, requirement: null, status: "NOT_REQUIRED", required: false, applicantSummary, evidence: [], shortfall: null };
  }
  if (isBareNumber(requirement ?? "")) {
    return { ...base, status: "REVIEW", required: true, applicantSummary, evidence: [], shortfall: null };
  }

  // Split into alternatives: "A OR B" — the standard HR phrasing.
  const alternatives = (requirement ?? "")
    .split(/\s+or\s+|;/i)
    .map((c) => c.trim())
    .filter(Boolean);

  const parsed = alternatives.map(parseEduClause);
  if (parsed.every((p) => p == null)) {
    return { ...base, status: "REVIEW", required: true, applicantSummary, evidence: [], shortfall: null };
  }

  const evidence: string[] = [];
  let met = false;
  const seen = new Set<string>();
  for (const clause of parsed) {
    if (!clause) continue;
    const match = entries.find((e) => {
      const level = entryEduLevel(e);
      if (level < clause.minLevel) return false;
      if (clause.partialCollege) return true; // units / ongoing college counts
      if (!entryCompleted(e)) return false;   // degree clauses need completion
      if (clause.tokens.length > 0) {
        const hay = [str(e.course), str(e.degree), str(e.specifyOthers)]
          .join(" ")
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ");
        return clause.tokens.some((tok) => hay.includes(tok));
      }
      return true;
    });
    if (match) {
      met = true;
      const line = entryEduEvidence(match);
      if (!seen.has(line)) {
        seen.add(line);
        evidence.push(line);
      }
    }
  }

  if (met) {
    return {
      ...base,
      status: "MET",
      required: true,
      applicantSummary,
      evidence: evidence.slice(0, 3),
      shortfall: null,
    };
  }
  const minRequired = Math.min(
    ...parsed.filter((p): p is EduClause => p != null).map((p) => p.minLevel),
  );
  const hasAnyEducation = entries.length > 0;
  return {
    ...base,
    status: "NOT_MET",
    required: true,
    applicantSummary,
    evidence: [],
    shortfall: hasAnyEducation
      ? `Requires ${EDU_LEVEL_LABEL[minRequired]} level or equivalent`
      : "No education records on file",
  };
}

// ============================================================================
// WORK EXPERIENCE / TRAINING (quantity dimensions)
// ============================================================================

function expYears(e: Record<string, unknown>): number {
  const y = Number(e.yearDecimal ?? e.year_decimal);
  if (Number.isFinite(y) && y > 0) return y;
  // Fallback: derive from inclusive dates when the decimal is missing.
  const from = new Date(String(e.inclusiveDateFrom ?? e.inclusive_date_from ?? ""));
  const toRaw = String(e.inclusiveDateTo ?? e.inclusive_date_to ?? "");
  const to = e.isPresentWork === true || e.is_present_work === true ? new Date() : toRaw ? new Date(toRaw) : null;
  if (!isNaN(from.getTime()) && to && !isNaN(to.getTime()) && to > from) {
    return Math.max(0, (to.getTime() - from.getTime()) / (365.25 * 24 * 3600 * 1000));
  }
  return 0;
}

function trnHours(t: Record<string, unknown>): number {
  const h = Number(t.hourDecimal ?? t.hour_decimal);
  if (Number.isFinite(h) && h > 0) return h;
  const n = Number(t.numberHours ?? t.number_hours);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function checkExperience(
  position: RequirementPosition,
  snapshots: RequirementSnapshots,
): RequirementCheck {
  const requirement = str(position.cscWorkExperience) || null;
  const entries = snapshots.experiences;
  const totalYears = entries.reduce((s, e) => s + expYears(e), 0);
  const applicantSummary = entries.length
    ? `${totalYears.toFixed(1)} yrs total · ${entries.length} ${entries.length === 1 ? "role" : "roles"}`
    : "No work experience on file";

  const evidence = entries
    .map((e) => {
      const role = str(e.positionTitle) || str(e.office) || str(e.employerName) || "Role";
      const employer = str(e.employerName) || str(e.office);
      const yrs = expYears(e);
      const bits = [role];
      if (employer && employer.toLowerCase() !== role.toLowerCase()) bits.push(employer);
      bits.push(`${yrs > 0 ? yrs.toFixed(1) : "0"} yr${yrs === 1 ? "" : "s"}`);
      return bits.join(" · ");
    })
    .slice(0, 3);

  const base = {
    key: "experience" as const,
    label: "Work Experience",
    requirement,
    applicantSummary,
    evidence,
  };

  if (isNoneRequired(requirement ?? "")) {
    return { ...base, requirement: null, status: "NOT_REQUIRED", required: false, shortfall: null };
  }
  if (isBareNumber(requirement ?? "")) {
    return { ...base, status: "REVIEW", required: true, shortfall: null };
  }

  const required = extractQuantity(requirement ?? "", "years?");
  if (!/\byear|\byrs\b/i.test(requirement ?? "") || required === 0) {
    // Mentions no recognizable duration at all → manual review.
    return { ...base, status: "REVIEW", required: true, shortfall: null };
  }

  if (totalYears >= required) {
    return { ...base, status: "MET", required: true, shortfall: null };
  }
  const gap = required - totalYears;
  return {
    ...base,
    status: "NOT_MET",
    required: true,
    shortfall: `${gap.toFixed(1)} more ${gap === 1 ? "year" : "years"} of relevant experience needed`,
  };
}

function checkTraining(
  position: RequirementPosition,
  snapshots: RequirementSnapshots,
): RequirementCheck {
  const requirement = str(position.cscTrainingRequirements) || null;
  const entries = snapshots.trainings;
  const totalHours = entries.reduce((s, t) => s + trnHours(t), 0);
  const applicantSummary = entries.length
    ? `${Math.round(totalHours).toLocaleString("en-US")} hrs total · ${entries.length} ${entries.length === 1 ? "training" : "trainings"}`
    : "No trainings on file";

  const evidence = entries
    .map((t) => {
      const title = str(t.titleOfTraining) || str(t.title_of_training) || str(t.specifyTraining) || "Training";
      const h = trnHours(t);
      return `${title}${h > 0 ? ` · ${Math.round(h)} hrs` : ""}`;
    })
    .slice(0, 3);

  const base = {
    key: "training" as const,
    label: "Training",
    requirement,
    applicantSummary,
    evidence,
  };

  if (isNoneRequired(requirement ?? "")) {
    return { ...base, requirement: null, status: "NOT_REQUIRED", required: false, shortfall: null };
  }
  if (isBareNumber(requirement ?? "")) {
    return { ...base, status: "REVIEW", required: true, shortfall: null };
  }

  const required = extractQuantity(requirement ?? "", "hours?");
  if (!/\bhour|\bhrs\b/i.test(requirement ?? "") || required === 0) {
    return { ...base, status: "REVIEW", required: true, shortfall: null };
  }

  if (totalHours >= required) {
    return { ...base, status: "MET", required: true, shortfall: null };
  }
  const gap = required - totalHours;
  return {
    ...base,
    status: "NOT_MET",
    required: true,
    shortfall: `${Math.round(gap)} more ${gap === 1 ? "hour" : "hours"} of relevant training needed`,
  };
}

// ============================================================================
// ELIGIBILITY (Civil Service)
// ============================================================================

// Generic words in eligibility names that carry no matching signal.
const GENERIC_ELIG_TOKENS = new Set([
  "csc", "mc", "s", "cat", "category", "as", "amended", "of", "the", "and",
  "a", "an", "service", "eligibility", "eligibilities", "ra", "pd", "re",
  "no", "ii", "iii", "level", "professional", "sub", "career", "civil",
  "second", "first", "required", "none", "board", "resolution", "res",
]);

function eligibilityNames(e: Record<string, unknown>): { name: string; level: number | null }[] {
  const out: { name: string; level: number | null }[] = [];
  const title = str(e.eligibilityTitle ?? e.eligibility_title);
  if (title && !isNoneRequired(title)) out.push({ name: title, level: null });
  const specificsRaw =
    (Array.isArray(e.specificEligibilities) && e.specificEligibilities) ||
    (Array.isArray(e.specific_eligibilities) && e.specific_eligibilities) ||
    [];
  if (Array.isArray(specificsRaw)) {
    for (const s of specificsRaw) {
      if (!s || typeof s !== "object") continue;
      const rec = s as Record<string, unknown>;
      const name = str(rec.name);
      if (!name || isNoneRequired(name)) continue;
      const level = Number(rec.level);
      out.push({ name, level: Number.isFinite(level) ? level : null });
    }
  }
  return out;
}

type EligClass =
  | { kind: "professional" }
  | { kind: "sub" }
  | { kind: "ra1080" }
  | { kind: "named"; tokens: string[] }
  | { kind: "unparseable" };

function classifyEligAlternative(alternative: string): EligClass {
  const t = alternative.toLowerCase();
  const hasSub = /sub[-\s]?professional|first[-\s]level/.test(t);
  const hasPro = (!hasSub && /professional|second[-\s]?level/.test(t)) || /career\s+service\s*\(professional\)/.test(t);
  if (/ra\.?\s*1080|ra\s*1080|republic\s+act\s+1080/.test(t)) return { kind: "ra1080" };
  if (hasPro) return { kind: "professional" };
  if (hasSub) return { kind: "sub" };
  const tokens = t
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !GENERIC_ELIG_TOKENS.has(w) && !/^\d+$/.test(w));
  if (tokens.length > 0) return { kind: "named", tokens };
  return { kind: "unparseable" };
}

/** Does ONE applicant eligibility satisfy the alternative? */
function eligMatchesAlt(
  alt: EligClass,
  elig: { name: string; level: number | null },
): boolean {
  const n = elig.name.toLowerCase();
  // Compact form — "R.A. 1080" → "ra1080" — so license spellings with
  // periods/spaces still match an RA1080 standard.
  const compact = n.replace(/[^a-z0-9]/g, "");
  switch (alt.kind) {
    case "professional":
      return (
        (elig.level != null && elig.level >= 5) ||
        (/professional/.test(n) && !/sub[-\s]?professional/.test(n)) ||
        compact.includes("ra1080") // board license counts as professional-class
      );
    case "sub":
      return (
        (elig.level != null && elig.level >= 2) ||
        /sub[-\s]?professional|first[-\s]level|professional/.test(n)
      );
    case "ra1080":
      return compact.includes("ra1080");
    case "named": {
      const hay = n.replace(/[^a-z0-9\s]/g, " ");
      return alt.tokens.some((tok) => hay.includes(tok));
    }
    default:
      return false;
  }
}

function checkEligibility(
  position: RequirementPosition,
  snapshots: RequirementSnapshots,
): RequirementCheck {
  const requirement = str(position.cscEligibilityGroup) || null;
  const entries = snapshots.eligibilities.flatMap(eligibilityNames);
  const applicantSummary = entries.length
    ? entries.map((e) => e.name).slice(0, 2).join(" · ")
    : "No eligibility records on file";

  const evidence = entries
    .map((e) => {
      const rec = snapshots.eligibilities.find((raw) =>
        eligibilityNames(raw).some((n) => n.name === e.name),
      );
      const rating = rec ? str(rec.rating) : "";
      return `${e.name}${rating ? ` · rating ${rating}` : ""}`;
    })
    .slice(0, 3);

  const base = {
    key: "eligibility" as const,
    label: "Eligibility",
    requirement,
    applicantSummary,
    evidence,
  };

  if (isNoneRequired(requirement ?? "")) {
    return { ...base, requirement: null, status: "NOT_REQUIRED", required: false, shortfall: null };
  }

  // Split on "/", "or", "," → alternatives ("Career Service Professional / Second-Level / RA1080").
  const alternatives = (requirement ?? "")
    .replace(/\([^)]*\)/g, " ") // commas inside parens are not separators
    .split(/\s*[/,;]\s*|\s+or\s+/i)
    .map((a) => a.trim())
    .filter(Boolean)
    .map(classifyEligAlternative);

  if (alternatives.every((a) => a.kind === "unparseable")) {
    return { ...base, status: "REVIEW", required: true, shortfall: null };
  }

  const satisfied = entries.some((e) => alternatives.some((a) => eligMatchesAlt(a, e)));
  if (satisfied) {
    return { ...base, status: "MET", required: true, shortfall: null };
  }
  return {
    ...base,
    status: "NOT_MET",
    required: true,
    shortfall: "No matching Civil Service eligibility on file",
  };
}

// ============================================================================
// Report assembly
// ============================================================================

export function buildRequirementsReport(
  position: RequirementPosition | null,
  snapshots: RequirementSnapshots,
): RequirementsReport | null {
  // No position (or nothing to compare against) → no report at all.
  if (!position) return null;

  const checks: RequirementCheck[] = [
    checkEducation(position, snapshots),
    checkExperience(position, snapshots),
    checkTraining(position, snapshots),
    checkEligibility(position, snapshots),
  ];

  const requiredChecks = checks.filter((c) => c.required);
  if (requiredChecks.length === 0) {
    return { verdict: "NO_REQUIREMENTS", metCount: 0, requiredCount: 0, checks };
  }
  const metCount = requiredChecks.filter((c) => c.status === "MET").length;
  const notMetCount = requiredChecks.filter((c) => c.status === "NOT_MET").length;
  const reviewCount = requiredChecks.filter((c) => c.status === "REVIEW").length;

  let verdict: RequirementsReport["verdict"];
  if (notMetCount === 0 && reviewCount === 0 && metCount === requiredChecks.length) {
    verdict = "ALL_MET";
  } else if (notMetCount === 0 && reviewCount > 0) {
    verdict = "NEEDS_REVIEW";
  } else if (notMetCount === requiredChecks.length) {
    verdict = "NONE_MET";
  } else {
    verdict = "PARTIAL";
  }

  return { verdict, metCount, requiredCount: requiredChecks.length, checks };
}
