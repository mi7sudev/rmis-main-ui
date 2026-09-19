import { NextRequest } from "next/server";
import { ok, handleApi } from "@/lib/api";
import { SESSION_COOKIE, secureCookieFor } from "@/lib/jwt";
import { getSessionFromReq } from "@/lib/auth";
import { getClientIp } from "@/lib/rate-limit";
import { auditLog } from "@/lib/audit-log";

export const POST = handleApi(async (req: NextRequest) => {
  // Capture the session BEFORE clearing the cookie — we need the user info
  // to record a LOGOUT audit event.
  const session = await getSessionFromReq(req);
  if (session) {
    await auditLog({
      userId: session.id,
      userLabel: session.name
        ? `${session.name}${session.email ? ` (${session.email})` : ""}`
        : session.email,
      userRole: session.role,
      action: "LOGOUT",
      description: `User signed out`,
      ipAddress: getClientIp(req),
    });
  }

  const res = ok({ success: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    // Must mirror the login flag exactly so the browser matches and clears
    // the right cookie (Secure-only when the deployment is HTTPS-based).
    secure: secureCookieFor(req),
  });
  return res;
});
