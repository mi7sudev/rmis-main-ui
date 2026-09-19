import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireAdminFromReq } from "@/lib/auth";
import { deriveUserRole } from "@/lib/role-utils";
import { auditLog } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { userUpdateSchema } from "@/lib/validation";

// Production schema notes (same as admin/users/route.ts):
//   * User has NO `role`, `passwordHash`, `isActive`, `emailVerified` columns.
//   * Role is derived; password is stored in `password`; isActive ↔ !blocked.

export const GET = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await requireAdminFromReq(req);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return err("Invalid id", 400);

  // SECURITY: Never select the password column — it contains the bcrypt hash.
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      documentId: true,
      username: true,
      email: true,
      provider: true,
      confirmed: true,
      blocked: true,
      isAdmin: true,
      isApplicant: true,
      firstName: true,
      middleName: true,
      lastName: true,
      informationFillouted: true,
      createdAt: true,
      updatedAt: true,
      // password, otp, encryptedId, resetPasswordToken, confirmationToken — EXCLUDED
    },
  });
  if (!user) return err("User not found", 404);

  const role = await deriveUserRole(id);
  const applLink = await db.userApplicantLink.findFirst({ where: { userId: id } });
  let applicant: { id: number; documentId: string | null; firstName: string | null; middleName: string | null; lastName: string | null; emailAddress: string | null; isFillouted: boolean | null } | null = null;
  if (applLink?.applicantId != null) {
    applicant = await db.applicant.findUnique({ where: { id: applLink.applicantId } });
  }
  return ok({ ...user, role, isActive: !user.blocked, applicant });
});

export const PATCH = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const admin = await requireAdminFromReq(req);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return err("Invalid id", 400);

  const parsed = userUpdateSchema.safeParse(await req.json());
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const d = parsed.data;

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (d.firstName !== undefined) update.firstName = d.firstName || null;
  if (d.lastName !== undefined) update.lastName = d.lastName || null;
  if (d.email) update.email = d.email.toLowerCase();
  if (d.isActive !== undefined) update.blocked = !d.isActive;
  if (d.password) update.password = await bcrypt.hash(d.password, 10);

  // Role change: update is_admin + role link
  if (d.role) {
    update.isAdmin = d.role === "ADMIN";
    // Remove existing role links, then add the new one
    await db.userRoleLink.deleteMany({ where: { userId: id } });
    let roleId = 1; // "Authenticated" by default
    if (d.role === "APPLICANT") roleId = 3;
    await db.userRoleLink.create({ data: { userId: id, roleId } });
  }

  const updated = await db.user.update({ where: { id }, data: update as never });
  const role = await deriveUserRole(id);

  await auditLog({
    userId: admin.id,
    userLabel: admin.name ? `${admin.name} (${admin.email})` : admin.email,
    userRole: admin.role,
    action: d.role ? "USER_ROLE_CHANGED" : "USER_UPDATED",
    entityType: "user",
    entityId: id,
    description: d.role
      ? `Changed user ${id} role to ${d.role}`
      : `Updated user ${id} profile`,
    ipAddress: getClientIp(req),
  });

  return ok({ ...updated, role, isActive: !updated.blocked });
});

export const DELETE = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const admin = await requireAdminFromReq(req);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return err("Invalid id", 400);

  // ?hard=1 performs a REAL deletion (removes the user row + cleans up link
  // tables). Without it, DELETE is a soft-disable (sets blocked=true) so the
  // existing "Disable" toggle keeps working.
  const hard = req.nextUrl.searchParams.get("hard") === "1";

  if (hard) {
    // SAFETY GUARD 1: cannot delete your own account (would lock out the
    // only admin in a single-admin deployment).
    if (admin.id === String(id)) {
      return err("You cannot delete your own account", 400);
    }

    // SAFETY GUARD 2: cannot delete other admin accounts — prevents
    // accidental lockout / privilege stripping. Admins should be disabled
    // instead, or demoted first then deleted.
    const targetRole = await deriveUserRole(id);
    if (targetRole === "ADMIN") {
      return err(
        "Cannot delete an admin account. Demote the user to a non-admin role first, or disable the account instead.",
        400
      );
    }

    // Confirm the target exists before attempting cleanup.
    const target = await db.user.findUnique({ where: { id }, select: { id: true } });
    if (!target) return err("User not found", 404);

    // Clean up the legacy junction tables that reference this user.
    // (The schema uses @@index only — no @relation / FK constraints — so
    // Prisma won't cascade; we delete the link rows explicitly to avoid
    // orphaned references.)
    await db.userRoleLink.deleteMany({ where: { userId: id } });
    await db.userApplicantLink.deleteMany({ where: { userId: id } });
    await db.userPositionLink.deleteMany({ where: { userId: id } });
    await db.userPositionUpdateLink.deleteMany({ where: { userId: id } });

    await db.user.delete({ where: { id } });

    await auditLog({
      userId: admin.id,
      userLabel: admin.name ? `${admin.name} (${admin.email})` : admin.email,
      userRole: admin.role,
      action: "USER_DELETED",
      entityType: "user",
      entityId: id,
      description: `Permanently deleted user ${id}`,
      ipAddress: getClientIp(req),
    });

    return ok({ deleted: true, id });
  }

  // Default: soft-disable to preserve referential integrity (block the user)
  const updated = await db.user.update({
    where: { id },
    data: { blocked: true, updatedAt: new Date() },
  });

  await auditLog({
    userId: admin.id,
    userLabel: admin.name ? `${admin.name} (${admin.email})` : admin.email,
    userRole: admin.role,
    action: "USER_DISABLED",
    entityType: "user",
    entityId: id,
    description: `Disabled user ${id}`,
    ipAddress: getClientIp(req),
  });

  return ok({ ...updated, isActive: false });
});
