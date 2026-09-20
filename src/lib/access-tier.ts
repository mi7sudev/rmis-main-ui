// ============================================================================
// access-tier.ts — Two-tier network access control.
//
// TOPOLOGY (the deployment this module implements):
//
//   ┌─ PUBLIC WEB (internet) ──────────────┐   ┌─ MIRDC INTRANET ─────────┐
//   │ Applicants: landing, jobs board,     │   │ IT officials: ADMIN +    │
//   │ sign-up, applicant sign-in/portal    │   │ EVALUATOR workspaces     │
//   └──────────────┬───────────────────────┘   └────────────┬─────────────┘
//                  │ public domain (TLS)                    │ bare LAN IP
//           deploy/Caddyfile.public                 deploy/Caddyfile.intranet
//                  └───────────────┬────────────────────────┘
//                                  ▼
//                      RMIS Next.js app (ONE instance)
//                      · applicant flows  → allowed from ANY network
//                      · staff flows      → allowed ONLY from intranet IPs
//
// Staff = ADMIN + EVALUATOR. Applicants (the public web audience) are never
// restricted — the whole point of this split is that the applicant-facing
// system runs like a real production website on the internet, while the
// staff tooling stays an internal, network-gated system.
//
// ENFORCEMENT POINTS (defense in depth — all three must agree):
//   1. POST /api/auth/login   — staff credentials are refused from the web.
//   2. GET  /api/session      — a staff session cookie presented from the web
//                               resolves to `user: null` (fail closed), so a
//                               cookie carried out of the building is useless.
//   3. requireRoleFromReq()   — every staff-role API call (admin stats,
//                               evaluator reviews, user management, …) 403s
//                               from the web, even with a valid staff JWT.
//
// SPOOF-RESISTANCE — why we classify the LAST proxy address, not the first:
//   `X-Forwarded-For` is client-forgeable. A malicious client on the internet
//   can send `X-Forwarded-For: 10.0.0.1` and — if the proxy APPENDS — the app
//   would see "10.0.0.1, <real public ip>" and a naive "first entry" check
//   would classify the request as intranet. The ONLY address our own reverse
//   proxy vouches for is the one it adds itself — the LAST entry of the chain
//   (for the overwrite-style configs this repo ships, the chain has exactly
//   one entry, which is the proxy's direct peer). So:
//     · last entry public            → the request came from the web → staff ✗
//     · last entry private/loopback  → intranet → staff ✓
//     · no proxy headers at all      → direct on-box access (dev/localhost,
//                                      curl on the server) → trusted ✓
//     · INTRANET_CIDRS allowlist     → trusted office egress IPs (e.g. a
//                                      corporate proxy with a public IP)
//   The shipped proxy configs OVERWRITE X-Forwarded-For with {remote_host}
//   (Caddy `header_up`) — keep that directive on any public-facing proxy.
//
// KILL SWITCH: set INTRANET_ENFORCEMENT=off to disable all tier checks
// (emergency recovery if a proxy misclassification locks staff out — the
// audit trail still records every block that happened before the switch).
// ============================================================================

import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api";

/** Roles that must stay on the intranet. */
export const STAFF_ROLES = ["ADMIN", "EVALUATOR"] as const;

export function isStaffRole(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "EVALUATOR";
}

/** User-facing explanation shown by the sign-in UI when staff login is refused. */
export const STAFF_INTRANET_MESSAGE =
  "Staff access is restricted to the MIRDC intranet. Administrators and evaluators must sign in from the office network (or VPN). Applicants can sign in from any network.";

// ---------------------------------------------------------------------------
// IP classification
// ---------------------------------------------------------------------------

/** Parse a dotted-quad IPv4 string into a number, or null if malformed. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const v = Number(part);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function rangeContains(ip: string, base: string, bits: number): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null) return false;
  if (bits <= 0) return true;
  const mask = bits >= 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/**
 * Is this address a PRIVATE/loopback (intranet-side) IPv4?
 * Covers: 127/8 loopback, 10/8, 172.16/12, 192.168/16 (RFC 1918),
 * 169.254/16 link-local, 0.0.0.0/8 "this network", 100.64/10 CGNAT
 * (carrier-grade NAT sits on the ISP side — treated as intranet-side only
 * in the sense of "not a routable public client address"; a CGNAT address
 * can never be a real internet client's source IP).
 */
function isPrivateIpv4(ip: string): boolean {
  return (
    rangeContains(ip, "127.0.0.0", 8) ||
    rangeContains(ip, "10.0.0.0", 8) ||
    rangeContains(ip, "172.16.0.0", 12) ||
    rangeContains(ip, "192.168.0.0", 16) ||
    rangeContains(ip, "169.254.0.0", 16) ||
    rangeContains(ip, "0.0.0.0", 8) ||
    rangeContains(ip, "100.64.0.0", 10)
  );
}

/** Is this a public (internet-side) IPv4? Anything not in the private ranges. */
function isPublicIpv4(ip: string): boolean {
  return !isPrivateIpv4(ip);
}

/** Is this a public (internet-side) IPv6? Loopback/ULA/link-local/mapped are intranet-side. */
function isPublicIpv6(raw: string): boolean {
  const ip = raw.trim().toLowerCase();
  if (!ip) return false;
  // IPv4-mapped IPv6 (::ffff:10.0.0.1) — classify the embedded v4.
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPublicIpv4(mapped[1]);
  if (ip === "::1" || ip === "::") return false; // loopback / unspecified
  if (ip.startsWith("fc") || ip.startsWith("fd")) return false; // fc00::/7 ULA
  if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb"))
    return false; // fe80::/10 link-local
  return true; // routable IPv6 → public
}

/** Is this a PUBLIC (internet-side) IP address? Malformed input → not public. */
export function isPublicIp(ip: string): boolean {
  const trimmed = ip.trim();
  if (!trimmed) return false;
  if (trimmed.includes(":")) return isPublicIpv6(trimmed);
  const asInt = ipv4ToInt(trimmed);
  if (asInt === null) return false; // not an IP ("unknown", hostnames, garbage)
  return !isPrivateIpv4(trimmed);
}

/** IPv4 CIDR membership (for the INTRANET_CIDRS allowlist). */
function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw ?? 32);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  // Allow the allowlist to contain bare IPs (treated as /32).
  return rangeContains(ip, base, bits);
}

// ---------------------------------------------------------------------------
// Request classification
// ---------------------------------------------------------------------------

/**
 * The address OUR reverse proxy vouches for: the LAST X-Forwarded-For entry
 * (see the spoof-resistance note at the top of this file). Falls back to
 * X-Real-IP, then to "unknown" for direct on-box access (no proxy involved).
 */
export function getTrustedClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (entries.length > 0) return entries[entries.length - 1];
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

/**
 * Is this request coming from the MIRDC intranet (staff tier allowed)?
 *
 * Classification of the trusted (proxy-added) address:
 *   · explicitly allowlisted via INTRANET_CIDRS  → intranet
 *   · public IP                                  → public web
 *   · private / loopback / CGNAT / link-local    → intranet
 *   · "unknown" (no proxy headers — direct access on the server itself,
 *     e.g. localhost dev, curl on the box, health checks) → intranet
 *
 * INTRANET_ENFORCEMENT=off short-circuits everything to `true`.
 */
export function isIntranetRequest(req: Request): boolean {
  if (env.INTRANET_ENFORCEMENT === "off") return true;

  const ip = getTrustedClientIp(req);
  if (ip === "unknown") return true; // direct on-box access — no proxy chain to classify

  // Explicit allowlist (office egress IP behind NAT, admin VPN range, …).
  const extras = env.INTRANET_CIDRS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (extras.some((cidr) => ipInCidr(ip, cidr))) return true;

  return !isPublicIp(ip);
}

/**
 * Guard helper for API routes: throws when a STAFF session is used from the
 * public web. Applicant sessions are never restricted.
 */
export function assertStaffIntranetAccess(req: Request, role: string): void {
  if (!isStaffRole(role)) return; // applicant tier — allowed from any network
  if (isIntranetRequest(req)) return;
  throw new ApiError(STAFF_INTRANET_MESSAGE, 403);
}
