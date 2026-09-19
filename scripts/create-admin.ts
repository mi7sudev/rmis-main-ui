/**
 * create-admin.ts — Production staff-account management tool.
 *
 * Creates ADMIN/EVALUATOR accounts and manages passwords on the intranet
 * production server. Run from the project root (bun auto-loads .env):
 *
 *   bun scripts/create-admin.ts --email juan.delacruz@mirdc.gov.ph --password 'S3cure!Passw0rd' --name "Juan Dela Cruz"
 *   bun scripts/create-admin.ts --email maria.santos@mirdc.gov.ph --password 'S3cure!Passw0rd' --name "Maria Santos" --role evaluator
 *   bun scripts/create-admin.ts --reset testadmin --password 'N3wS3cure!Pass'
 *   bun scripts/create-admin.ts --deactivate testapplicant        # disable a test login
 *
 * Role model (see src/lib/role-utils.ts):
 *   ADMIN     → up_users.is_admin = true          (+ role lnk 1 "Authenticated")
 *   EVALUATOR → up_users.is_admin = false, staff  (+ role lnk 1 "Authenticated")
 *   APPLICANT → role lnk 3 ("applicants") — self-registration, NOT this tool.
 *
 * Passwords are bcrypt-hashed with cost factor 10 — identical to the
 * register/login routes, so the accounts work with the normal login API.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const db = new PrismaClient();

type RoleFlag = "admin" | "evaluator";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (flag: string) => process.argv.includes(flag);

async function createStaff(role: RoleFlag) {
  const email = arg("--email");
  const password = arg("--password");
  const name = arg("--name") ?? "";
  if (!email || !password) {
    console.error("Usage: bun scripts/create-admin.ts --email you@mirdc.gov.ph --password 'S3cure!Passw0rd' [--name \"First Last\"] [--role evaluator]");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Refusing: password must be at least 12 characters for a production staff account.");
    process.exit(1);
  }

  const normalized = email.trim().toLowerCase();
  const existing = await db.user.findFirst({ where: { email: normalized } });
  if (existing) {
    console.error(`Refusing: an account with email ${normalized} already exists (id=${existing.id}). Use --reset ${existing.username} --password '...' to change its password.`);
    process.exit(1);
  }

  const [firstName, ...rest] = name.split(" ");
  const lastName = rest.join(" ") || null;

  // Unique username from the email local part (same convention as register).
  const base = normalized.split("@")[0];
  let username = base;
  let i = 1;
  while (await db.user.findFirst({ where: { username } })) username = `${base}${i++}`;

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        documentId: randomUUID(),
        firstName: firstName || null,
        lastName,
        username,
        email: normalized,
        password: passwordHash,
        provider: "local",
        confirmed: true,
        blocked: false,
        isApplicant: false,
        isAdmin: role === "admin",
        createdAt: now,
        updatedAt: now,
      },
    });
    // Staff accounts link to role 1 "Authenticated" (never role 3 "applicants").
    await tx.userRoleLink.create({ data: { userId: created.id, roleId: 1 } });
    return created;
  });

  console.log(`✓ Created ${role.toUpperCase()} account:`);
  console.log(`  id        : ${user.id}`);
  console.log(`  username  : ${user.username}`);
  console.log(`  email     : ${user.email}`);
  console.log(`  name      : ${name || "(none)"}`);
  console.log(`  login at  : the RMIS sign-in page with username OR email`);
}

async function resetPassword() {
  const username = arg("--reset");
  const password = arg("--password");
  if (!username || !password) {
    console.error("Usage: bun scripts/create-admin.ts --reset <username> --password 'N3wS3cure!Pass'");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("Refusing: password must be at least 12 characters for a production staff account.");
    process.exit(1);
  }
  const user = await db.user.findFirst({ where: { username } });
  if (!user) {
    console.error(`No user named "${username}".`);
    process.exit(1);
  }
  await db.user.update({
    where: { id: user.id },
    data: { password: await bcrypt.hash(password, 10), updatedAt: new Date() },
  });
  console.log(`✓ Password updated for ${username} (id=${user.id}). All their old sessions stay valid until expiry — rotate NEXTAUTH_SECRET to force re-login everywhere.`);
}

async function deactivate() {
  const username = arg("--deactivate");
  if (!username) {
    console.error("Usage: bun scripts/create-admin.ts --deactivate <username>");
    process.exit(1);
  }
  const user = await db.user.findFirst({ where: { username } });
  if (!user) {
    console.error(`No user named "${username}".`);
    process.exit(1);
  }
  await db.user.update({
    where: { id: user.id },
    data: { blocked: true, updatedAt: new Date() },
  });
  console.log(`✓ Deactivated "${username}" (blocked=true). Login is now refused for this account.`);
}

async function main() {
  if (has("--reset")) await resetPassword();
  else if (has("--deactivate")) await deactivate();
  else await createStaff(has("--role") && arg("--role") === "evaluator" ? "evaluator" : "admin");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
