import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import { verifySession, SESSION_COOKIE } from "@/lib/jwt";
import type { Role } from "@/lib/roles";

export type SessionUser = {
  id: string; // JWT stores ID as string (production DB uses integer IDs)
  email: string;
  name?: string | null;
  role: Role;
};

const COOKIE_NAMES = [
  SESSION_COOKIE,
  "__Secure-" + SESSION_COOKIE,
];

// Read session from a NextRequest (API route handler).
export async function getSessionFromReq(req: NextRequest): Promise<SessionUser | null> {
  for (const name of COOKIE_NAMES) {
    const token = req.cookies.get(name)?.value;
    if (token) {
      const decoded = await verifySession(token);
      if (decoded) {
        return { ...decoded, role: decoded.role as Role };
      }
    }
  }
  return null;
}

export async function requireAuthFromReq(req: NextRequest): Promise<SessionUser> {
  const user = await getSessionFromReq(req);
  if (!user) throw new ApiError("Unauthorized", 401);
  // LIVE ACCOUNT CHECK — a JWT stays valid up to 24h, but the account it
  // belongs to may not be: admins block/deactivate users (up_users.blocked —
  // e.g. create-admin.ts --deactivate) and rows can be deleted. Fail closed:
  // a vanished or blocked account gets 401 immediately instead of keeping API
  // access until token expiry. This also removes the fail-open path where a
  // deleted user's token would fall through to default role derivation.
  const uid = Number(user.id);
  const row = Number.isFinite(uid)
    ? await db.user.findUnique({ where: { id: uid }, select: { blocked: true } })
    : null;
  if (!row || row.blocked) throw new ApiError("Unauthorized", 401);
  return user;
}

export async function requireRoleFromReq(req: NextRequest, ...roles: Role[]): Promise<SessionUser> {
  const user = await requireAuthFromReq(req);
  if (!roles.includes(user.role)) throw new ApiError("Forbidden: insufficient role", 403);
  return user;
}

export async function requireApplicantFromReq(req: NextRequest) {
  return requireRoleFromReq(req, "APPLICANT");
}

export async function requireEvaluatorFromReq(req: NextRequest) {
  return requireRoleFromReq(req, "EVALUATOR", "ADMIN");
}

export async function requireAdminFromReq(req: NextRequest) {
  return requireRoleFromReq(req, "ADMIN");
}

// Get the applicant profile record for a given user (via the `up_users_applicant_id_lnk` junction table)
export async function getApplicantForUser(userId: number) {
  const link = await db.userApplicantLink.findFirst({
    where: { userId },
  });
  if (!link) return null;
  return db.applicant.findUnique({ where: { id: link.applicantId! } });
}

// Get the applicant ID for a user (faster than loading the full record)
export async function getApplicantIdForUser(userId: number): Promise<number | null> {
  const link = await db.userApplicantLink.findFirst({
    where: { userId },
  });
  return link?.applicantId ?? null;
}
