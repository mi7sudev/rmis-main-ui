// =============================================================================
// RMIS — Profile View: shared types, constants, and helper functions
// Extracted from profile-view.tsx (pure mechanical refactor — no behavior change)
// =============================================================================

import {
  User,
  GraduationCap,
  Briefcase,
  BookOpen,
  Award as AwardIcon,
  FileStack,
  ShieldCheck,
} from "lucide-react";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type Confidence = "high" | "medium" | "low" | "none";

export type ExtractedField = {
  value: string | null;
  confidence: Confidence;
  source: string;
};

export type ExtractionResult = {
  personalInfo?: Record<string, ExtractedField>;
  educations?: Array<Record<string, ExtractedField>>;
  workExperiences?: Array<Record<string, ExtractedField>>;
  trainings?: Array<Record<string, ExtractedField>>;
  eligibilities?: Array<Record<string, ExtractedField>>;
  awards?: Array<Record<string, ExtractedField>>;
  documentType?: string;
  warnings?: string[];
};

export type DocumentItem = {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  filePath: string;
  category: string;
  status: string;
  extractedJson: string | null;
  extractionError: string | null;
  extractedAt: string | null;
  createdAt: string;
};

export type CharacterReference = {
  name: string;
  title: string;
  company: string;
  companyAddress: string;
  email: string;
  contact: string;
};

export type Profile = {
  id: string;
  isProfileComplete: boolean;
  submittedDate: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  extensionName: string | null;
  emailAddress: string | null;
  mobileNumber: string | null;
  contactNumber: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  gender: string | null;
  civilStatus: string | null;
  citizenship: string | null;
  religion: string | null;
  isPwd: boolean;
  ethnicity: string | null;
  presentAddress: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zipCode: string | null;
  adminCase: boolean;
  adminCaseDetails: string | null;
  crimeCharge: boolean;
  crimeDate: string | null;
  crimeCaseStatus: string | null;
  characterReferences: string | null;
  educations: EducationItem[];
  workExperiences: WorkItem[];
  trainings: TrainingItem[];
  eligibilities: EligibilityItem[];
  awards: AwardItem[];
  documents: DocumentItem[];
};

export type EducationItem = {
  id: string;
  educationLevel: string | null;
  course: string | null;
  schoolName: string | null;
  yearGraduated: string | null;
  unitsEarned: string | null;
  awards: string | null;
  degree: string | null;
  __fromExtraction?: boolean;
};

export type WorkItem = {
  id: string;
  positionTitle: string | null;
  employerName: string | null;
  employerAddress: string | null;
  inclusiveDateFrom: string | null;
  inclusiveDateTo: string | null;
  isPresentWork: boolean;
  statusOfEmployment: string | null;
  monthlySalary: number | null;
  isGovtService: boolean;
  actualDuties: string | null;
  __fromExtraction?: boolean;
};

export type TrainingItem = {
  id: string;
  titleOfTraining: string | null;
  typeOfTraining: string | null;
  inclusiveDateFrom: string | null;
  inclusiveDateTo: string | null;
  numberHours: number | null;
  __fromExtraction?: boolean;
};

export type EligibilityItem = {
  id: string;
  eligibilityTitle: string | null;
  rating: string | null;
  examDate: string | null;
  examPlace: string | null;
  licenseNumber: string | null;
  licenseValidity: string | null;
  __fromExtraction?: boolean;
};

export type AwardItem = {
  id: string;
  recognitionType: string | null;
  recognitionDetails: string | null;
  recognitionScope: string | null;
  recognitionCategory: string | null;
  recognitionProvider: string | null;
  dateGranted: string | null;
  __fromExtraction?: boolean;
};

export type ReferenceData = {
  eligibilities: Array<{ id: string; name: string }>;
  courses: Array<{ id: string; name: string }>;
  placesOfAssignment: Array<{ id: string; name: string }>;
};

// -----------------------------------------------------------------------------
// Constants & helpers
// -----------------------------------------------------------------------------

export const SECTIONS = [
  { id: "personal", label: "Personal Information", icon: User, minutes: 8 },
  { id: "education", label: "Education", icon: GraduationCap, minutes: 3 },
  { id: "work", label: "Work Experience", icon: Briefcase, minutes: 5 },
  { id: "training", label: "Training", icon: BookOpen, minutes: 2 },
  { id: "eligibility", label: "Eligibility", icon: ShieldCheck, minutes: 3 },
  { id: "awards", label: "Awards", icon: AwardIcon, minutes: 2 },
  { id: "documents", label: "Supporting Documents", icon: FileStack, minutes: 3 },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

export const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "PDS", label: "PDS (Personal Data Sheet)" },
  { value: "PROFILE_PICTURE", label: "Profile Picture (1×1)" },
  { value: "RESUME", label: "Resume / CV" },
  { value: "EDUCATION", label: "Education Certificate" },
  { value: "WORK_EXPERIENCE", label: "Work Experience Cert" },
  { value: "TRAINING", label: "Training Certificate" },
  { value: "ELIGIBILITY", label: "Eligibility Certificate" },
  { value: "AWARD", label: "Award / Recognition" },
  { value: "COE", label: "Certificate of Employment" },
  { value: "PERFORMANCE_EVALUATION", label: "Performance Evaluation" },
  { value: "SUPPORTING", label: "Other Supporting Doc" },
];

export const CATEGORY_LABEL: Record<string, string> = CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.value]: c.label }),
  {}
);

export const DOC_STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; ring?: boolean }
> = {
  UPLOADED: { label: "Uploaded", color: "text-muted-foreground", bg: "bg-muted" },
  PROCESSING: {
    label: "Processing",
    color: "text-warning-ink",
    bg: "bg-warning/10",
    ring: true,
  },
  EXTRACTED: {
    label: "Extracted",
    color: "text-success-ink",
    bg: "bg-success/10",
  },
  PARTIALLY_EXTRACTED: {
    label: "Partially Extracted",
    color: "text-warning-ink",
    bg: "bg-warning/10",
  },
  FAILED: { label: "Failed", color: "text-danger-ink", bg: "bg-destructive/10" },
  NEEDS_REVIEW: {
    label: "Needs Review",
    color: "text-warning-ink",
    bg: "bg-warning/10",
  },
};

export const CONFIDENCE_META: Record<
  Confidence,
  { label: string; color: string; bg: string; dot: string }
> = {
  high: {
    label: "High confidence",
    color: "text-success-ink",
    bg: "bg-success/20",
    dot: "bg-success",
  },
  medium: {
    label: "Medium confidence",
    color: "text-warning-ink",
    bg: "bg-warning/20",
    dot: "bg-warning",
  },
  low: {
    label: "Low confidence",
    color: "text-danger-ink",
    bg: "bg-danger-ink/10",
    dot: "bg-danger",
  },
  none: {
    label: "Not found",
    color: "text-muted-foreground",
    bg: "bg-accent",
    dot: "bg-input",
  },
};

export function toISODate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseCharRefs(raw: string | null): CharacterReference[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as CharacterReference[];
  } catch {
    /* ignore */
  }
  return [];
}

export function serializeCharRefs(refs: CharacterReference[]): string {
  // NOTE: Do NOT filter out empty refs here. This function serializes the
  // in-memory form state on every keystroke — if we dropped empty refs, the
  // "Add Reference" button would be a no-op (a freshly-added ref has an empty
  // name, so it would be filtered out before the state update lands, and the
  // UI would never show the new card). Empty-ref filtering happens at SAVE
  // time only (see savePersonal in use-profile-data.ts).
  return JSON.stringify(refs);
}

// Filter out character references that have no name (i.e. the user added a
// card but never filled it in). Used at save time to avoid persisting empty
// refs to the database.
export function cleanCharRefs(refs: CharacterReference[]): CharacterReference[] {
  return refs.filter((r) => r.name?.trim());
}

export function emptyCharacterReference(): CharacterReference {
  return { name: "", title: "", company: "", companyAddress: "", email: "", contact: "" };
}

// Whether a sub-entity id is a client-side "pending-" id (created from
// extraction but not yet saved to the DB) vs. a real DB id.
//
// IMPORTANT: sub-entity `id` fields are a MIXED TYPE at runtime:
//   - pending (from extraction): string like "pending-1691234567890-abc1234"
//   - saved (from DB via Prisma): number like 42 (Int primary key)
// The TypeScript types declare `id: string` for convenience, but the DB rows
// arrive with numeric ids. Calling `id.startsWith("pending-")` directly
// crashes with "startsWith is not a function" when id is a number. This
// helper coerces to string first so the check is always safe.
export function isPendingId(id: string | number): boolean {
  return String(id).startsWith("pending-");
}

// Fields the extractor can populate (matches ExtractionResult.personalInfo keys)
export const EXTRACTABLE_PERSONAL: Record<string, keyof Profile> = {
  firstName: "firstName",
  middleName: "middleName",
  lastName: "lastName",
  extensionName: "extensionName",
  emailAddress: "emailAddress",
  mobileNumber: "mobileNumber",
  contactNumber: "contactNumber",
  birthDate: "birthDate",
  birthPlace: "birthPlace",
  gender: "gender",
  civilStatus: "civilStatus",
  citizenship: "citizenship",
  religion: "religion",
  presentAddress: "presentAddress",
  city: "city",
  province: "province",
  country: "country",
  zipCode: "zipCode",
};

export function formatFieldName(key: string): string {
  // camelCase → Title Case with spaces
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
