import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE, secureCookieFor } from "@/lib/jwt";
import { deriveUserRole } from "@/lib/role-utils";
import { isStaffRole, isIntranetRequest, STAFF_INTRANET_MESSAGE } from "@/lib/access-tier";
import {
  checkLoginRateLimit,
  recordFailedLogin,
  clearLoginRateLimit,
  getClientIp,
} from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit-log";

export const POST = handleApi(async (req: NextRequest) => {
  const { identifier, password } = await req.json();
  if (!identifier || !password) return err("Email/username and password are required", 400);

  // Rate limiting: prevent brute-force attacks
  const clientIp = getClientIp(req);
  const rateLimitKey = `${clientIp}:${identifier.trim().toLowerCase()}`;
  const rateCheck = checkLoginRateLimit(rateLimitKey);
  if (!rateCheck.allowed) {
    const retryAfterMinutes = Math.ceil((rateCheck.retryAfterMs || 0) / 60000);
    return err(
      `Too many failed login attempts. Please try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? "" : "s"}.`,
      429
    );
  }

  const id = identifier.trim().toLowerCase();
  // The users table (`up_users`) stores both email and username — search by either
  const user = await db.user.findFirst({
    where: {
      OR: [
        { email: id },
        { username: id },
      ],
    },
  });

  if (!user || !user.password) {
    recordFailedLogin(rateLimitKey);
    await auditLog({ userId: null, userLabel: id, action: "LOGIN_FAILED", description: `Failed login attempt for ${id}`, ipAddress: clientIp });
    return err("Invalid credentials", 401);
  }

  // `blocked=true` marks a disabled user
  if (user.blocked) {
    return err("Account is blocked. Contact administrator.", 403);
  }

  // Verify bcrypt password (stored hashes use bcrypt with $2a$/$2b$ prefix)
  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    recordFailedLogin(rateLimitKey);
    await auditLog({ userId: user.id, userLabel: user.username ?? user.email ?? id, action: "LOGIN_FAILED", description: `Failed login attempt for ${id}`, ipAddress: clientIp });
    return err("Invalid credentials", 401);
  }

  // Clear rate limit on successful login
  clearLoginRateLimit(rateLimitKey);
  const role = await deriveUserRole(user.id);

  // ── TWO-TIER ACCESS: staff (ADMIN/EVALUATOR) may only sign in from the
  // MIRDC intranet. Applicants (the public-web audience) may sign in from
  // any network. The password was already verified, so this block is purely
  // network-tier — and it is AUDITED with the real client IP for compliance.
  if (isStaffRole(role) && !isIntranetRequest(req)) {
    await auditLog({
      userId: user.id,
      userLabel: `${user.username ?? user.email ?? id}${user.email ? ` (${user.email})` : ""}`,
      userRole: role,
      action: "LOGIN_BLOCKED_EXTERNAL",
      description: `Staff login refused — valid credentials presented from the public web`,
      ipAddress: clientIp,
    });
    return err(STAFF_INTRANET_MESSAGE, 403);
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "";
  await auditLog({
    userId: user.id,
    userLabel: `${user.username ?? user.email ?? id}${user.email ? ` (${user.email})` : ""}`,
    userRole: role,
    action: "LOGIN_SUCCESS",
    description: `User ${user.username} signed in`,
    ipAddress: clientIp,
  });

  const token = await signSession({
    id: String(user.id), // JWT payload is string — convert integer ID
    email: user.email || "",
    name: fullName,
    role,
  });

  const res = ok({
    id: user.id,
    email: user.email,
    username: user.username,
    role,
    firstName: user.firstName,
    lastName: user.lastName,
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    // Secure ONLY when the deployment is HTTPS-based (NEXTAUTH_URL https:// or
    // TLS terminated at the proxy). Plain-HTTP intranet (bare IP) must NOT set
    // it, or browsers silently drop the cookie and nobody can log in.
    secure: secureCookieFor(req),
  });
  return res;
});
