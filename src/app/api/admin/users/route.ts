import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireAdminFromReq } from "@/lib/auth";
import { batchDeriveUserRoles } from "@/lib/role-utils";
import { auditLog } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { userCreateSchema, paginationSchema, type Paginated } from "@/lib/validation";
import type { Role } from "@/lib/roles";

// Production schema notes:
//   * User has NO `role`, `passwordHash`, `isActive`, or `emailVerified` columns.
//     - password → the users table (`up_users`) stores the bcrypt hash here directly
//     - role → derived (is_admin=true → ADMIN; up_users_role_lnk.role_id=3 → APPLICANT; else EVALUATOR)
//     - isActive → !blocked
//     - emailVerified → confirmed
//   * User↔Applicant link is via `up_users_applicant_id_lnk`.

export const GET = handleApi(async (req: NextRequest) => {
  await requireAdminFromReq(req);
  const url = new URL(req.url);
  const roleFilter = url.searchParams.get("role");
  const q = url.searchParams.get("q");
  const { page, pageSize } = paginationSchema.parse({
    page: url.searchParams.get("page") ?? 1,
    pageSize: url.searchParams.get("pageSize") ?? 50,
  });

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { email: { contains: q } },
      { username: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } },
    ];
  }

  // Role filtering: derive from is_admin + role_lnk
  if (roleFilter && ["APPLICANT", "EVALUATOR", "ADMIN"].includes(roleFilter)) {
    if (roleFilter === "ADMIN") {
      where.isAdmin = true;
    } else if (roleFilter === "APPLICANT") {
      const links = await db.userRoleLink.findMany({ where: { roleId: 3 } });
      const userIds = links.map((l) => l.userId).filter((x): x is number => x != null);
      if (!userIds.length) {
        return ok({ data: [], total: 0, page, pageSize, hasMore: false });
      }
      where.id = { in: userIds };
    } else {
      // EVALUATOR: non-admin users NOT linked to role_id=3
      const applLinks = await db.userRoleLink.findMany({ where: { roleId: 3 } });
      const applUserIds = new Set(
        applLinks.map((l) => l.userId).filter((x): x is number => x != null)
      );
      const allUsers = await db.user.findMany({
        where: { isAdmin: { not: true } },
        select: { id: true },
      });
      const userIds = allUsers.filter((u) => !applUserIds.has(u.id)).map((u) => u.id);
      if (!userIds.length) {
        return ok({ data: [], total: 0, page, pageSize, hasMore: false });
      }
      where.id = { in: userIds };
    }
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      // SECURITY: Never select password, otp, encryptedId, tokens
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
      },
    }),
    db.user.count({ where }),
  ]);

  // Batch-derive roles (2 queries total, not 2N)
  const userIds = users.map((u) => u.id);
  const [roleMap, applLinks] = await Promise.all([
    batchDeriveUserRoles(userIds),
    db.userApplicantLink.findMany({ where: { userId: { in: userIds } } }),
  ]);

  // Batch-load applicant profiles for linked users
  const applicantIds = applLinks
    .map((l) => l.applicantId)
    .filter((x): x is number => x != null);
  const applicants = applicantIds.length
    ? await db.applicant.findMany({
        where: { id: { in: applicantIds } },
        select: { id: true, isFillouted: true },
      })
    : [];
  const applicantById = new Map(applicants.map((a) => [a.id, a]));
  const applicantLinkByUserId = new Map(applLinks.map((l) => [l.userId, l.applicantId]));

  type UserRow = (typeof users)[number] & {
    role: Role;
    isActive: boolean;
    applicant: { id: number; isProfileComplete: boolean } | null;
  };
  const data: UserRow[] = users.map((u) => {
    const applicantId = applicantLinkByUserId.get(u.id);
    const appl = applicantId != null ? applicantById.get(applicantId) : undefined;
    return {
      ...u,
      role: roleMap.get(u.id) ?? "EVALUATOR",
      isActive: !u.blocked,
      applicant: appl
        ? { id: appl.id, isProfileComplete: appl.isFillouted ?? false }
        : null,
    };
  });

  const result: Paginated<typeof data[number]> = {
    data,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  };
  return ok(result);
});

export const POST = handleApi(async (req: NextRequest) => {
  const admin = await requireAdminFromReq(req);
  const parsed = userCreateSchema.safeParse(await req.json());
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const { email, username, password, role, firstName, lastName, isActive } = parsed.data;

  const exists = await db.user.findFirst({
    where: { OR: [{ email: email.toLowerCase() }, { username }] },
  });
  if (exists) return err("Email or username already exists", 409);

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();
  const user = await db.user.create({
    data: {
      email: email.toLowerCase(),
      username,
      password: passwordHash,
      firstName: firstName || null,
      lastName: lastName || null,
      provider: "local",
      confirmed: true,
      blocked: isActive === false,
      isAdmin: role === "ADMIN",
      isApplicant: role === "APPLICANT",
      createdAt: now,
      updatedAt: now,
    },
  });

  // Assign role via up_users_role_lnk
  let roleId: number;
  if (role === "APPLICANT") roleId = 3;
  else if (role === "ADMIN") roleId = 1; // Authenticated (admin via is_admin flag)
  else roleId = 1;
  await db.userRoleLink.create({ data: { userId: user.id, roleId } });

  // If APPLICANT, also create an Applicant row and link it to the user.
  if (role === "APPLICANT") {
    const applicant = await db.applicant.create({
      data: {
        emailAddress: email.toLowerCase(),
        firstName: firstName || null,
        lastName: lastName || null,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      },
    });
    await db.userApplicantLink.create({
      data: { userId: user.id, applicantId: applicant.id },
    });
  }

  // SECURITY: Strip password hash from response
  const { password: _stripped, ...userWithoutPassword } = user;

  await auditLog({
    userId: admin.id,
    userLabel: admin.name ? `${admin.name} (${admin.email})` : admin.email,
    userRole: admin.role,
    action: "USER_CREATED",
    entityType: "user",
    entityId: user.id,
    description: `Created user ${username} with role ${role}`,
    ipAddress: getClientIp(req),
  });

  return ok({ ...userWithoutPassword, role, isActive: !user.blocked }, 201);
});
