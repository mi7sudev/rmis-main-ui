// ============================================================================
// wire.ts — THE wire-shape module (single source of truth for API payloads).
//
// TYPES-ONLY: zero runtime imports, pure types. Safe to import from any
// client component.
//
// Why one home: `Job` was hand-declared in 5 files and `Application` in 1
// (+ inline partials in 4 more) with real drift — `position.id: string` vs
// the numeric DB id, an invented `applications?: { id: string }[] | false`,
// a `salaryStep` column that does not exist on the wire (the DB column is
// `positionSalaryStep`), and non-null declarations over nullable columns.
// Fixing a wire field meant hunting every copy. Now the shapes below are
// derived from what the routes actually return and every view derives its
// subset from here (Pick / Omit / extend).
//
// Serialization contract (what JSON.stringify does to a Prisma row):
//   * DateTime?  → ISO `string | null`          (e.g. publishDate)
//   * Int?/Float? → `number | null`
//   * Unsupported("json") columns are EXCLUDED from Prisma query results, so
//     they never appear on the wire (Application snapshots are read server-
//     side via raw-json and exposed as `snapshots`, see
//     /api/evaluator/applications/[id]).
//   * BigInt? columns cannot survive JSON.stringify — any non-null value
//     would fail the response, so on a 200 they are always `null`.
//
// Canonical shapes:
//   Job         — one item of GET /api/jobs (public jobs list)
//   Application — one item of GET /api/applications (applicant's applications)
// ============================================================================

/**
 * Place of assignment reference — the trimmed `{ id, name }` the routes emit
 * (GET /api/jobs job-level `placeOfAssignment`, and the value nested inside
 * `position` on application payloads).
 */
export type PlaceOfAssignmentRef = { id: number; name: string | null };

/**
 * The Position row as embedded in job payloads. Routes return the FULL
 * `postions` row (no `select`), minus the Prisma-Unsupported
 * `competency_requirements_richtext` column which never reaches the wire.
 */
export type JobPosition = {
  id: number;
  documentId: string | null;
  positionType: string | null;
  itemNumber: string | null;
  positionTitle: string | null;
  positionStatus: string | null;
  positionSalaryGrade: string | null;
  positionSalaryStep: string | null;
  positionSalaryAmount: string | null;
  salaryGrade: string | null;
  salaryAmount: number | null;
  positionLevel: number | null;
  hrmisId: number | null;
  specialSkill: string | null;
  areaCode: string | null;
  areaType: string | null;
  level: string | null;
  classification: string | null;
  educationCriteria: string | null;
  trainingType: string | null;
  otherTraining: string | null;
  preferredQualification: string | null;
  competencyRequirements: string | null;
  cscEligibility: string | null;
  cscEligibilityGroup: string | null;
  cscEducation: string | null;
  cscWorkExperience: string | null;
  cscTrainingRequirements: string | null;
  education: string | null;
  experience: string | null;
  training: string | null;
  eligibility: string | null;
  division: string | null;
  section: string | null;
  officeId: number | null;
  departmentId: number | null;
  placeOfAssignmentId: number | null;
  sectionId: number | null;
  trancheId: number | null;
  salaryGradeId: number | null;
  stepId: number | null;
  /** BigInt column — JSON-serializes only as null (see header note). */
  divisionId: null;
  /** BigInt column — JSON-serializes only as null (see header note). */
  incumbentId: null;
  dateVacated: string | null;
  yearsRequired: number | null;
  hoursRequired: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  createdById: number | null;
  updatedById: number | null;
  locale: string | null;
};

/** The viewer's own application attached to each job (the "Applied" badge). */
export type JobApplicationRef = { id: number; status: string | null };

/**
 * Canonical Job wire shape — one item of GET /api/jobs.
 *
 * The route spreads the full JobPosting row and enriches it with the linked
 * position (junction `jobpostings_postions_lnk`), the position's place of
 * assignment, the author, the viewer's own `applications` and the total
 * `applicationCount`. The `*Html` fields are UI-contract aliases for the
 * legacy `*_richtext` columns mapped in the route.
 */
export type Job = {
  // ---- JobPosting row (JSON-serialized) ----
  id: number;
  documentId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  createdById: number | null;
  updatedById: number | null;
  locale: string | null;
  positionType: string | null;
  dutiesResponsibilities: string | null;
  contractDateFrom: string | null;
  contractDateTo: string | null;
  publishDate: string | null;
  deadlineDate: string | null;
  processingDate: string | null;
  briefDescription: string | null;
  compensationPackage: string | null;
  otherQualifications: string | null;
  otherQualificationsRichtext: string | null;
  briefDescriptionRichtext: string | null;
  compensationPackageRichtext: string | null;
  numberOfVacancy: number | null;
  // ---- Route enrichments ----
  /** Linked position's title, falling back to briefDescription. */
  title: string | null;
  /** Publication state (publishedAt != null). */
  isActive: boolean;
  position: JobPosition | null;
  placeOfAssignment: PlaceOfAssignmentRef | null;
  author: { id: number; firstName: string | null; lastName: string | null } | null;
  /** The VIEWER's own applications on this job (empty for admin/evaluator). */
  applications: JobApplicationRef[];
  /** TOTAL applications on this job across all applicants. */
  applicationCount: number;
  briefDescriptionHtml: string | null;
  dutiesResponsibilitiesHtml: string | null;
  compensationPackageHtml: string | null;
  otherQualificationsHtml: string | null;
};

/**
 * Canonical Application wire shape — one item of GET /api/applications.
 *
 * The route spreads the full Application row (minus the snapshot_* Unsupported
 * columns, which Prisma never returns) and adds the `status` alias, the
 * linked job (full JobPosting row + `title` + `position` with the place of
 * assignment nested INSIDE the position) and the always-empty `assessments`
 * placeholder kept for backwards compatibility with the frontend contract.
 */
export type Application = {
  // ---- Application row (JSON-serialized; snapshot_* columns excluded) ----
  id: number;
  documentId: string | null;
  dateApplied: string | null;
  applicationStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  createdById: number | null;
  updatedById: number | null;
  locale: string | null;
  // ---- Route enrichments ----
  /** Alias of applicationStatus (frontend contract). */
  status: string | null;
  job:
    | (Omit<
        Job,
        | "isActive"
        | "position"
        | "placeOfAssignment"
        | "author"
        | "applications"
        | "applicationCount"
        | "briefDescriptionHtml"
        | "dutiesResponsibilitiesHtml"
        | "compensationPackageHtml"
        | "otherQualificationsHtml"
      > & {
        position: (JobPosition & { placeOfAssignment: PlaceOfAssignmentRef | null }) | null;
      })
    | null;
  /** Route hardcodes `[]` today (see /api/applications route comment). */
  assessments: never[];
};

/**
 * POST /api/applicant/documents response — the uploaded document's sidecar
 * meta row (`ok(meta, 201)`; layout documented in /api/applicant/documents
 * and src/lib/documents.ts). Consumers key off `id` to chain extraction
 * (`/api/applicant/documents/extract`); everything else is informational.
 */
export type DocumentUploadResponse = {
  id: string;
  applicantId: number;
  uploadedById: number;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  /** Relative to project root, e.g. "upload/123/uuid.xlsx". */
  filePath: string;
  category: string;
  status: string;
  extractedJson?: string | null;
  extractionError?: string | null;
  extractedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** `files` table row id, when the production-table write succeeded. */
  fileTableId?: number | null;
};
