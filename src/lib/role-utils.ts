// Shared role derivation logic — the production users table (`up_users`) stores role signals as:
//   - up_users.is_admin = true → ADMIN
//   - up_users_role_lnk with role_id=3 → APPLICANT (the "applicants" role)
//   - otherwise → EVALUATOR (default for authenticated staff)
//
// Single source of truth: login, admin user list, and admin user detail
// all import from here. No duplicates.

import { db } from "@/lib/db";
import type { Role } from "@/lib/roles";

/**
 * Derive a single user's role from the production data model.
 * Uses 2 queries (user lookup + junction table lookup).
 */
export async function deriveUserRole(userId: number): Promise<Role> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  if (!user) return "EVALUATOR";
  if (user.isAdmin) return "ADMIN";

  const applicantRoleLink = await db.userRoleLink.findFirst({
    where: { userId, roleId: 3 },
    select: { userId: true },
  });
  return applicantRoleLink ? "APPLICANT" : "EVALUATOR";
}

/**
 * Batch-derive roles for multiple users in 2 queries total (not 2N).
 * Returns a Map<userId, Role> for O(1) lookup.
 *
 * Usage:
 *   const roleMap = await batchDeriveUserRoles(userIds);
 *   const role = roleMap.get(userId) ?? "EVALUATOR";
 */
export async function batchDeriveUserRoles(
  userIds: number[]
): Promise<Map<number, Role>> {
  const roleMap = new Map<number, Role>();
  if (!userIds.length) return roleMap;

  const [adminUsers, applicantLinks] = await Promise.all([
    db.user.findMany({
      where: { id: { in: userIds }, isAdmin: true },
      select: { id: true },
    }),
    db.userRoleLink.findMany({
      where: { userId: { in: userIds }, roleId: 3 },
      select: { userId: true },
    }),
  ]);

  const adminIds = new Set(adminUsers.map((u) => u.id));
  const applicantUserIds = new Set(
    applicantLinks.map((l) => l.userId).filter((x): x is number => x != null)
  );

  for (const id of userIds) {
    if (adminIds.has(id)) roleMap.set(id, "ADMIN");
    else if (applicantUserIds.has(id)) roleMap.set(id, "APPLICANT");
    else roleMap.set(id, "EVALUATOR");
  }

  return roleMap;
}
