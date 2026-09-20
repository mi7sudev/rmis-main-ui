import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApi } from "@/lib/api";
import { getSessionFromReq } from "@/lib/auth";
import { isStaffRole, isIntranetRequest } from "@/lib/access-tier";
import { getClientIp } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit-log";

export const GET = handleApi(async (req: NextRequest) => {
  const session = await getSessionFromReq(req);
  if (!session) return ok({ user: null });

  // ── TWO-TIER ACCESS: a staff (ADMIN/EVALUATOR) session cookie presented
  // from the public web resolves to NO session — fail closed. This makes a
  // cookie carried out of the building worthless on the internet: the SPA
  // boots logged out and every staff API is independently guarded (see
  // requireRoleFromReq). Applicant sessions are never restricted.
  if (isStaffRole(session.role) && !isIntranetRequest(req)) {
    await auditLog({
      userId: session.id,
      userLabel: `${session.name ?? ""}${session.email ? ` (${session.email})` : ""}`.trim() || session.email,
      userRole: session.role,
      action: "STAFF_ACCESS_BLOCKED_EXTERNAL",
      description: "Staff session presented from the public web — treated as signed out",
      ipAddress: getClientIp(req),
    });
    return ok({ user: null });
  }

  const userId = parseInt(session.id, 10);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      firstName: true,
      lastName: true,
      middleName: true,
      isAdmin: true,
      isApplicant: true,
      confirmed: true,
      blocked: true,
      informationFillouted: true,
    },
  });

  if (!user || user.blocked) return ok({ user: null });

  // Check for linked applicant profile via the `up_users_applicant_id_lnk` junction table
  const applicantLink = await db.userApplicantLink.findFirst({
    where: { userId },
  });

  let applicant: { id: number; isProfileComplete: boolean } | null = null;
  if (applicantLink?.applicantId != null) {
    const a = await db.applicant.findUnique({
      where: { id: applicantLink.applicantId },
      select: { id: true, isFillouted: true },
    });
    if (a) {
      applicant = { id: a.id, isProfileComplete: a.isFillouted ?? false };
    }
  }

  return ok({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: session.role,
      firstName: user.firstName,
      lastName: user.lastName,
      middleName: user.middleName,
      isActive: !user.blocked,
      applicant,
    },
  });
});
