// Role definitions for the new Next.js RMIS.
// The production database uses the `up_roles` table with:
//   id=1 "Authenticated" (type=authenticated) — all logged-in users
//   id=2 "Public" (type=public) — unauthenticated
//   id=3 "applicants" (type=applicants) — applicant role
//
// Admin access is controlled by the `up_users.is_admin` boolean column.
// The new app formalizes three roles derived from these existing fields:
//   APPLICANT — user has role "applicants" (up_users_role_lnk → role_id=3)
//   EVALUATOR — (new) assigned via the admin UI; stored in the same role system
//   ADMIN     — user has up_users.is_admin = true
//
// For backwards compatibility with the production DB, the JWT role is derived
// at login time from: is_admin → ADMIN, else role "applicants" → APPLICANT,
// else → EVALUATOR (for users assigned the "authenticated" role but not applicants).

export type Role = "APPLICANT" | "EVALUATOR" | "ADMIN";

export const ROLES: Role[] = ["APPLICANT", "EVALUATOR", "ADMIN"];
