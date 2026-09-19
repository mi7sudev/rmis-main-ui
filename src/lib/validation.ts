import { z } from "zod";
import { SETTABLE_STATUSES } from "@/lib/status";

// Shared Zod schemas for request validation.
// Used by both API routes (server) and form components (client) so the
// validation rules stay in sync.

// Accepts both "YYYY-MM-DD" (from HTML <input type="date">) and full ISO
// datetime strings. The production DB stores dates as TEXT, so we keep them as
// strings throughout. Zod's built-in datetime validator only accepts full
// ISO-8601 with timezone and rejects plain HTML date inputs — using it caused
// every Work / Training / Eligibility / Awards form submission to fail with
// HTTP 400.
export const dateString = z
  .string()
  .refine(
    (v) => {
      if (!v) return true;
      // plain date: YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;
      // full datetime with optional timezone
      const d = new Date(v);
      return !isNaN(d.getTime());
    },
    { message: "Invalid date format" }
  )
  .optional()
  .nullable();

// ---- Auth ----
export const loginSchema = z.object({
  identifier: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  email: z.string().email("Invalid email"),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
});

// ---- Applicant sub-entities ----
export const educationSchema = z.object({
  educationLevel: z.string().max(50).optional().nullable(),
  degree: z.string().max(120).optional().nullable(),
  course: z.string().max(200).optional().nullable(),
  specifyOthers: z.string().max(200).optional().nullable(),
  schoolName: z.string().max(200).optional().nullable(),
  ongoing: z.boolean().optional(),
  isHighestEducation: z.boolean().optional(),
  highestLevel: z.string().max(50).optional().nullable(),
  unitsEarned: z.string().max(50).optional().nullable(),
  yearGraduated: z.string().max(20).optional().nullable(),
  awards: z.string().max(500).optional().nullable(),
  hrRemarks: z.string().max(500).optional().nullable(),
  yearFrom: dateString,
  yearTo: dateString,
});

export const workExperienceSchema = z.object({
  positionTitle: z.string().max(200).optional().nullable(),
  isPresentWork: z.boolean().optional(),
  isGovtService: z.boolean().optional(),
  statusOfEmployment: z.string().max(50).optional().nullable(),
  monthlySalary: z.number().min(0).max(10_000_000).optional().nullable(),
  employerName: z.string().max(200).optional().nullable(),
  employerAddress: z.string().max(500).optional().nullable(),
  supervisorName: z.string().max(120).optional().nullable(),
  supervisorPosition: z.string().max(120).optional().nullable(),
  office: z.string().max(120).optional().nullable(),
  reasonForLeaving: z.string().max(500).optional().nullable(),
  accomplishment: z.string().max(2000).optional().nullable(),
  actualDuties: z.string().max(2000).optional().nullable(),
  hrRemarks: z.string().max(500).optional().nullable(),
  inclusiveDateFrom: dateString,
  inclusiveDateTo: dateString,
});

export const trainingSchema = z.object({
  titleOfTraining: z.string().max(200).optional().nullable(),
  isPresentWork: z.boolean().optional(),
  isGovtService: z.boolean().optional(),
  typeOfTraining: z.string().max(50).optional().nullable(),
  specifyTraining: z.string().max(200).optional().nullable(),
  numberHours: z.number().int().min(0).max(10000).optional().nullable(),
  hourDecimal: z.number().min(0).max(10000).optional().nullable(),
  hrRemarks: z.string().max(500).optional().nullable(),
  inclusiveDateFrom: dateString,
  inclusiveDateTo: dateString,
});

export const eligibilitySchema = z.object({
  eligibilityTitle: z.string().max(200).optional().nullable(),
  rating: z.string().max(20).optional().nullable(),
  examPlace: z.string().max(200).optional().nullable(),
  licenseNumber: z.string().max(80).optional().nullable(),
  hrRemarks: z.string().max(500).optional().nullable(),
  examDate: dateString,
  licenseValidity: dateString,
});

export const awardSchema = z.object({
  recognitionType: z.string().max(30).optional().nullable(),
  awardType: z.string().max(30).optional().nullable(),
  recognitionScope: z.string().max(30).optional().nullable(),
  recognitionCategory: z.string().max(100).optional().nullable(),
  recognitionSubcategory: z.string().max(100).optional().nullable(),
  recognitionDetails: z.string().max(500).optional().nullable(),
  recognitionProvider: z.string().max(200).optional().nullable(),
  points: z.number().int().min(0).max(1000).optional(),
  hrRemarks: z.string().max(500).optional().nullable(),
  dateGranted: dateString,
});

// ---- Jobs ----
export const jobCreateSchema = z.object({
  positionId: z.string().min(1).optional().nullable(),
  title: z.string().min(1, "Title is required").max(200),
  positionType: z.string().max(50).optional().nullable(),
  briefDescription: z.string().max(2000).optional().nullable(),
  briefDescriptionHtml: z.string().max(10000).optional().nullable(),
  dutiesResponsibilities: z.string().max(5000).optional().nullable(),
  dutiesResponsibilitiesHtml: z.string().max(20000).optional().nullable(),
  compensationPackage: z.string().max(2000).optional().nullable(),
  compensationPackageHtml: z.string().max(10000).optional().nullable(),
  otherQualifications: z.string().max(2000).optional().nullable(),
  otherQualificationsHtml: z.string().max(10000).optional().nullable(),
  numberOfVacancy: z.number().int().min(1).max(99).nullable().default(1),
  publishDate: dateString,
  deadlineDate: dateString,
  processingDate: dateString,
  // ---- Poster qualification vitals ----
  // These live on the linked POSITION master row (division + the CSC MQR
  // columns the public posting renders as "Minimum Qualification
  // Requirements", + specialSkill for license/certification). The routes
  // write them through to the position — and create + link a position when
  // none was selected, so nothing the HR user fills in is dropped.
  division: z.string().max(120).optional().nullable(),
  education: z.string().max(1000).optional().nullable(),
  experience: z.string().max(500).optional().nullable(),
  training: z.string().max(500).optional().nullable(),
  eligibility: z.string().max(200).optional().nullable(),
  license: z.string().max(500).optional().nullable(),
});

export const positionCreateSchema = z.object({
  itemNumber: z.string().max(50).optional().nullable(),
  positionTitle: z.string().max(200).optional().nullable(),
  positionType: z.string().max(50).optional().nullable(),
  positionStatus: z.string().max(50).optional().nullable(),
  positionLevel: z.number().int().min(0).max(20).optional().nullable(),
  salaryGrade: z.string().max(20).optional().nullable(),
  salaryStep: z.string().max(20).optional().nullable(),
  salaryAmount: z.number().min(0).max(1_000_000).optional().nullable(),
  division: z.string().max(120).optional().nullable(),
  section: z.string().max(120).optional().nullable(),
  classification: z.string().max(50).optional().nullable(),
  cscEducation: z.string().max(1000).optional().nullable(),
  cscEligibility: z.string().max(500).optional().nullable(),
  cscEligibilityGroup: z.string().max(200).optional().nullable(),
  cscWorkExperience: z.string().max(500).optional().nullable(),
  cscTrainingRequirements: z.string().max(500).optional().nullable(),
  preferredQualification: z.string().max(1000).optional().nullable(),
  competencyRequirements: z.string().max(1000).optional().nullable(),
  specialSkill: z.string().max(500).optional().nullable(),
  placeOfAssignmentId: z.string().min(1).optional().nullable(),
});

export type PositionInput = z.infer<typeof positionCreateSchema>;

// ---- Admin: users ----
export const userCreateSchema = z.object({
  email: z.string().email("Invalid email"),
  username: z.string().min(3, "Username must be at least 3 characters").max(60),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
  role: z.enum(["APPLICANT", "EVALUATOR", "ADMIN"]),
  firstName: z.string().max(80).optional().nullable(),
  lastName: z.string().max(80).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const userUpdateSchema = z.object({
  role: z.enum(["APPLICANT", "EVALUATOR", "ADMIN"]).optional(),
  firstName: z.string().max(80).optional().nullable(),
  lastName: z.string().max(80).optional().nullable(),
  email: z.string().email("Invalid email").optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).max(128).optional(),
});

// Revised workflow: the recruitment pipeline now ends at "Shortlisted" —
// see lib/status.ts for the full vocabulary and the workflow rationale.
export const statusUpdateSchema = z.object({
  status: z.enum(SETTABLE_STATUSES),
  reason: z.string().max(500).optional().nullable(),
});

// ---- Pagination ----
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type Paginated<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

// ---- Evaluator: interview assessment (applicant_interview_assessments) ----
// Scorecard vocabulary — production stores these as free-text varchar in
// Title Case (e.g. "Outstanding"). The API accepts BOTH Title Case and
// UPPER_CASE forms (mirroring the route's auto-shortlist check, which
// recognizes "Unsatisfactory" and "UNSATISFACTORY") and passes the submitted
// value through unchanged.
export const OVERALL_RATING_VALUES = [
  "Outstanding",
  "Very Satisfactory",
  "Satisfactory",
  "Fair",
  "Unsatisfactory",
] as const;

const OVERALL_RATING_FORMS: readonly string[] = OVERALL_RATING_VALUES.flatMap(
  (v) => [v, v.toUpperCase()]
);

const overallAssessmentRatingField = z
  .string()
  .max(50)
  .refine((v) => OVERALL_RATING_FORMS.includes(v.trim()), {
    message: `Overall rating must be one of: ${OVERALL_RATING_VALUES.join(", ")}`,
  });

// Rating columns are Int? in production (integer scorecard scores).
const assessmentRatingField = z.number().int().min(1).max(10).optional().nullable();
// Comment columns are String? free-text.
const assessmentCommentField = z.string().max(2000).optional().nullable();

export const assessmentSchema = z.object({
  // -- Rating columns (Int?) --
  educationRating: assessmentRatingField,
  workExperienceRating: assessmentRatingField,
  trainingRating: assessmentRatingField,
  eligibilityRating: assessmentRatingField,
  technicalSkillsRating: assessmentRatingField,
  organizationalAwarenessRating: assessmentRatingField,
  interpersonalSkillsRating: assessmentRatingField,
  adaptabilityRating: assessmentRatingField,
  extraCurricularRating: assessmentRatingField,
  personalDevelopmentRating: assessmentRatingField,
  technologyApplicationRating: assessmentRatingField,
  // -- Comment columns (String?) --
  educationComments: assessmentCommentField,
  workExperienceComments: assessmentCommentField,
  trainingComments: assessmentCommentField,
  eligibilityComments: assessmentCommentField,
  technicalSkillsComments: assessmentCommentField,
  organizationalAwarenessComments: assessmentCommentField,
  interpersonalSkillsComments: assessmentCommentField,
  adaptabilityComments: assessmentCommentField,
  extraCurricularComments: assessmentCommentField,
  personalDevelopmentComments: assessmentCommentField,
  technologyApplicationComments: assessmentCommentField,
  // -- Summary columns --
  overallAssessmentRating: overallAssessmentRatingField.optional().nullable(),
  commentAndRecommendation: z.string().max(2000).optional().nullable(),
  typeOfApplication: z.string().max(50).optional().nullable(),
  // year is a String? column in production (e.g. "2024").
  year: z.string().max(20).optional().nullable(),
});

export type AssessmentInput = z.infer<typeof assessmentSchema>;
