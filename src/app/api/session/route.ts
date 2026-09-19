import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ok, handleApi } from "@/lib/api";
import { getSessionFromReq } from "@/lib/auth";

export const GET = handleApi(async (req: NextRequest) => {
  const session = await getSessionFromReq(req);
  if (!session) return ok({ user: null });

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
