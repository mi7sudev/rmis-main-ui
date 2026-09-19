import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { registerSchema } from "@/lib/validation";

// Production schema notes:
//   * User has NO `role`, `passwordHash`, `isActive`, or `emailVerified` columns.
//     - password → the users table (`up_users`) stores the bcrypt hash here directly (cost factor 10).
//     - role → derived (is_admin=true → ADMIN; up_users_role_lnk.role_id=3 → APPLICANT; else EVALUATOR).
//     - isActive → !blocked
//     - emailVerified → confirmed
//   * User↔Applicant link is via `up_users_applicant_id_lnk` (no `userId` on Applicant).
//   * UserRoleLink has `userOrd` (Float?), not `ord`.
//   * Role id for APPLICANT = 3 (verified against production `up_roles` table:
//     1=Authenticated, 2=Public, 3=applicants).
//   * All writes are wrapped in `db.$transaction` for atomicity.

const APPLICANT_ROLE_ID = 3;

export const POST = handleApi(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) return err("Invalid input", 400, parsed.error.flatten());
  const { email, firstName, lastName, password } = parsed.data;

  const normalizedEmail = email.trim().toLowerCase();

  // Pre-flight: ensure email is unique (the transaction below also enforces
  // this, but checking first gives a clean 409 without a half-committed txn).
  const existing = await db.user.findFirst({ where: { email: normalizedEmail } });
  if (existing) return err("An account with this email already exists", 409);

  // Generate a unique username (email-local-part + numeric suffix if needed).
  const baseUsername = normalizedEmail.split("@")[0];
  let username = baseUsername;
  let i = 1;
  while (await db.user.findFirst({ where: { username } })) {
    username = `${baseUsername}${i++}`;
  }

  // bcrypt hash — matches the legacy hash convention in `up_users` (cost factor 10).
  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();

  // Atomic creation of user + role link + applicant + applicant link.
  // If any step fails, the entire write is rolled back.
  const { user, applicant } = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        documentId: crypto.randomUUID(),
        firstName: firstName || null,
        lastName: lastName || null,
        username,
        email: normalizedEmail,
        password: passwordHash,
        provider: "local",
        confirmed: true,
        blocked: false,
        isApplicant: true,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Link the new user to the APPLICANT role (role_id=3).
    await tx.userRoleLink.create({
      data: { userId: user.id, roleId: APPLICANT_ROLE_ID },
    });

    // Create the applicant profile row (no userId column — link via junction).
    const applicant = await tx.applicant.create({
      data: {
        documentId: crypto.randomUUID(),
        firstName: firstName || null,
        lastName: lastName || null,
        emailAddress: normalizedEmail,
        createdAt: now,
        updatedAt: now,
        publishedAt: now,
      },
    });

    // Link the user to the applicant profile.
    await tx.userApplicantLink.create({
      data: { userId: user.id, applicantId: applicant.id },
    });

    return { user, applicant };
  });

  // Do NOT echo the password hash. `role` is a derived string for the
  // response only — the User table has no `role` column.
  return ok(
    {
      id: user.id,
      email: user.email,
      role: "APPLICANT",
      applicantId: applicant.id,
    },
    201
  );
});
