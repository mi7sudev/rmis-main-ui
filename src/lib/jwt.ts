import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";

// Single source of truth for the JWT secret. Validation (presence + length)
// happens in @/lib/env on first import — this module just encodes the cached
// value. Never falls back to a hardcoded string (that would make tokens forgeable).
let _secret: Uint8Array | null = null;

export function getJwtSecret(): Uint8Array {
  if (_secret) return _secret;
  _secret = new TextEncoder().encode(env.NEXTAUTH_SECRET);
  return _secret;
}

export const SESSION_COOKIE = "next-auth.session-token";
export const SESSION_MAX_AGE = 60 * 60 * 24; // 24h

/**
 * Should the session cookie carry the `Secure` flag?
 *
 * `Secure` cookies are ONLY stored by browsers over HTTPS. Most intranet
 * deployments run plain HTTP on a bare IP (e.g. http://10.10.120.15) — with
 * an unconditional `secure: true` in production, browsers would silently
 * drop the session cookie and NOBODY could log in. So the flag follows the
 * actual transport:
 *
 *   1. NEXTAUTH_URL starts with https://  → secure (canonical TLS deploy).
 *   2. Otherwise, per-request: the proxy forwarded the request as https
 *      (x-forwarded-proto: https)         → secure (TLS at the reverse proxy).
 *   3. Plain HTTP (bare-IP intranet)      → NOT secure, so login works.
 */
export function secureCookieFor(req: NextRequest): boolean {
  if (env.NEXTAUTH_URL.startsWith("https://")) return true;
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "";
  return forwardedProto.split(",")[0]?.trim() === "https";
}

export async function signSession(payload: {
  id: string;
  email: string;
  name: string;
  role: string;
}): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getJwtSecret());
}

export async function verifySession(token: string): Promise<{
  id: string;
  email: string;
  name?: string | null;
  role: string;
} | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (!payload.id || !payload.role) return null;
    return {
      id: payload.id as string,
      email: (payload.email as string) || "",
      name: (payload.name as string) || null,
      role: payload.role as string,
    };
  } catch {
    return null;
  }
}
