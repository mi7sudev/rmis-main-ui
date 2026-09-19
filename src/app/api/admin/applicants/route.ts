import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApi } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { paginationSchema, type Paginated } from "@/lib/validation";

// ============================================================================
// GET /api/admin/applicants
//
// Returns a PAGINATED, SEARCHABLE list of ALL applicants in the production
// `applicants` table — the master records created when applicants first
// registered / filled out their PDS in the legacy RMIS backend.
//
// This is the data source for the "Applicants" management page accessible
// to both EVALUATOR and ADMIN roles. Previously the only ways to reach an
// applicant were:
//   1. Clicking a row in the admin-dashboard "Recent Applications" list
//      (only the 4 applicants who had applied were visible).
//   2. Clicking the Eye icon on a user row in admin-users (only the ~12
//      applicants who had a linked up_users account were visible).
// 13 of the 25 production applicants had NO user account and NO application,
// making them completely invisible to admins/evaluators.
//
// Auth: EVALUATOR + ADMIN (requireEvaluatorFromReq allows both).
//
// Query params:
//   - page      (default 1)
//   - pageSize  (default 50, max 100)
//   - search    (optional substring match on first/last/email)
//   - status    (optional: "complete" | "incomplete" filters by isFillouted)
//   - hasAccount(optional: "yes" | "no" filters by linked up_users account)
// ============================================================================

export const GET = handleApi(async (req: NextRequest) => {
  await requireEvaluatorFromReq(req);

  const url = new URL(req.url);
  const { page, pageSize } = paginationSchema.parse({
    page: url.searchParams.get("page") ?? 1,
    pageSize: url.searchParams.get("pageSize") ?? 50,
  });
  const search = url.searchParams.get("search")?.trim() || "";
  const status = url.searchParams.get("status"); // "complete" | "incomplete"
  const hasAccount = url.searchParams.get("hasAccount"); // "yes" | "no"

  // Build the WHERE clause for the applicant query.
  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { middleName: { contains: search } },
      { emailAddress: { contains: search } },
      { employeeNumber: { contains: search } },
      { contactNumber: { contains: search } },
    ];
  }
  if (status === "complete") where.isFillouted = true;
  if (status === "incomplete") {
    // isFillouted is NULL for applicants who never started their profile and
    // false (0) for those who started but haven't finished. Prisma's
    // { isFillouted: false } doesn't match NULL rows, so use a nested OR to
    // count both as incomplete.
    where.AND = [{ OR: [{ isFillouted: null }, { isFillouted: false }] }];
  }

  const [applicants, total] = await Promise.all([
    db.applicant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // Select only the columns needed for the list view (avoids pulling
      // large TEXT columns like pdsPath, characterReference, etc.)
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        extensionName: true,
        emailAddress: true,
        contactNumber: true,
        mobileNumber: true,
        gender: true,
        civilStatus: true,
        city: true,
        province: true,
        country: true,
        birthDate: true,
        isFillouted: true,
        qualified: true,
        statusOfEployment: true,
        employeeNumber: true,
        employeeId: true,
        submittedDate: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    db.applicant.count({ where }),
  ]);

  // Batch-load linked user accounts (up_users_applicant_id_lnk → up_users)
  // so the list can show which applicants have a login account.
  const applicantIds = applicants.map((a) => a.id);
  const userLinks = applicantIds.length
    ? await db.userApplicantLink.findMany({
        where: { applicantId: { in: applicantIds } },
        select: { applicantId: true, userId: true },
      })
    : [];
  const userIds = Array.from(new Set(userLinks.map((l) => l.userId))).filter(
    (x): x is number => x != null,
  );
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          username: true,
          email: true,
          isAdmin: true,
          isApplicant: true,
          firstName: true,
          lastName: true,
          blocked: true,
        },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  // Map: applicantId → user (first link wins; production data shows at most
  // one user per applicant, but the junction table technically allows many)
  const userByApplicantId = new Map<number, (typeof users)[number]>();
  for (const link of userLinks) {
    if (link.applicantId != null && link.userId != null) {
      if (!userByApplicantId.has(link.applicantId)) {
        const u = userById.get(link.userId);
        if (u) userByApplicantId.set(link.applicantId, u);
      }
    }
  }

  // Batch-load application counts per applicant.
  // applications_applicant_lnk joins applications ↔ applicants.
  const appLinks = applicantIds.length
    ? await db.applicationApplicantLink.findMany({
        where: { applicantId: { in: applicantIds } },
        select: { applicantId: true, applicationId: true },
      })
    : [];
  const applicationCountMap = new Map<number, number>();
  for (const link of appLinks) {
    if (link.applicantId != null) {
      applicationCountMap.set(
        link.applicantId,
        (applicationCountMap.get(link.applicantId) ?? 0) + 1,
      );
    }
  }

  // Apply the hasAccount filter post-query (it depends on the junction
  // table, which Prisma can't easily express in the applicant WHERE clause
  // because the relationship is modelled as an explicit join model).
  let rows = applicants.map((a) => {
    const user = userByApplicantId.get(a.id) ?? null;
    return {
      id: a.id,
      firstName: a.firstName,
      middleName: a.middleName,
      lastName: a.lastName,
      extensionName: a.extensionName,
      emailAddress: a.emailAddress,
      contactNumber: a.contactNumber,
      mobileNumber: a.mobileNumber?.toString() ?? null,
      gender: a.gender,
      civilStatus: a.civilStatus,
      city: a.city,
      province: a.province,
      country: a.country,
      birthDate: a.birthDate,
      isProfileComplete: a.isFillouted ?? false,
      qualified: a.qualified ?? null,
      statusOfEmployment: a.statusOfEployment ?? null,
      employeeNumber: a.employeeNumber ?? null,
      employeeId: a.employeeId ?? null,
      submittedDate: a.submittedDate,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      hasAccount: !!user,
      user: user
        ? {
            id: user.id,
            username: user.username,
            email: user.email,
            isAdmin: user.isAdmin ?? false,
            isApplicant: user.isApplicant ?? false,
            blocked: user.blocked ?? false,
          }
        : null,
      applicationCount: applicationCountMap.get(a.id) ?? 0,
    };
  });

  if (hasAccount === "yes") rows = rows.filter((r) => r.hasAccount);
  if (hasAccount === "no") rows = rows.filter((r) => !r.hasAccount);

  const result: Paginated<(typeof rows)[number]> = {
    data: rows,
    total: hasAccount ? rows.length : total,
    page,
    pageSize,
    hasMore: page * pageSize < (hasAccount ? rows.length : total),
  };
  return ok(result);
});
