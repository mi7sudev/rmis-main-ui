// Simple in-memory rate limiter for login brute-force protection.
// In production, replace with Redis-based rate limiting (or the API gateway's
// built-in rate limiting). This is a minimum viable protection for the dev/staging
// environment — it resets on server restart.

type RateLimitEntry = {
  count: number;      // failed attempts since the last success
  lockLevel: number;  // how many lockouts have already been issued (0 = never locked)
  resetAt: number;    // epoch ms — lockout end while locked; window end before first lockout
};

const loginAttempts = new Map<string, RateLimitEntry>();
const MAX_LOGIN_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
// Progressive lockout ladder — after MAX_LOGIN_ATTEMPTS failures, each
// successive lockout steps up instead of jumping straight to the maximum:
// 1 → 3 → 5 → 10 → 15 → 30 minutes (capped at the last step).
const LOCKOUT_STEPS_MS = [
  1 * 60 * 1000,
  3 * 60 * 1000,
  5 * 60 * 1000,
  10 * 60 * 1000,
  15 * 60 * 1000,
  30 * 60 * 1000,
];

/**
 * Check if the given identifier (IP + username) is rate-limited.
 * Returns { allowed: boolean, retryAfterMs?: number, remaining?: number }
 */
export function checkLoginRateLimit(identifier: string): {
  allowed: boolean;
  retryAfterMs?: number;
  remaining?: number;
} {
  const key = identifier.toLowerCase();
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry) {
    return { allowed: true, remaining: MAX_LOGIN_ATTEMPTS };
  }

  // Once an identifier has been locked at least once the escalation level is
  // remembered until a successful login clears it — expiry of one lockout
  // does NOT forgive the escalation progress.
  if (entry.lockLevel > 0 && entry.count >= MAX_LOGIN_ATTEMPTS) {
    if (now < entry.resetAt) {
      // Still serving the current lockout step.
      return { allowed: false, retryAfterMs: entry.resetAt - now };
    }
    // Lockout served — allow the next attempt; the entry is kept so the next
    // failure escalates to the following step in the ladder.
    return { allowed: true, remaining: 0 };
  }

  // Pre-lockout failures live in a rolling 15-minute window — if it lapses
  // without reaching the threshold, the count starts over.
  if (now > entry.resetAt) {
    loginAttempts.delete(key);
    return { allowed: true, remaining: MAX_LOGIN_ATTEMPTS };
  }

  return { allowed: true, remaining: Math.max(0, MAX_LOGIN_ATTEMPTS - entry.count) };
}

/**
 * Record a failed login attempt for the given identifier.
 * The 5th failure starts a 1-minute lockout; every further failure escalates
 * the lockout: 3 → 5 → 10 → 15 → 30 minutes (capped).
 */
export function recordFailedLogin(identifier: string): void {
  const key = identifier.toLowerCase();
  const now = Date.now();
  const existing = loginAttempts.get(key);

  // Fresh window — first-ever failure, or the pre-lockout window lapsed
  // without reaching the threshold (never-locked identifiers only).
  if (!existing || (existing.lockLevel === 0 && now > existing.resetAt)) {
    loginAttempts.set(key, {
      count: 1,
      lockLevel: 0,
      resetAt: now + WINDOW_MS,
    });
    return;
  }

  existing.count += 1;
  if (existing.count >= MAX_LOGIN_ATTEMPTS) {
    // Progressive lockout: step up the ladder each time (capped at the last step).
    const stepMs = LOCKOUT_STEPS_MS[Math.min(existing.lockLevel, LOCKOUT_STEPS_MS.length - 1)];
    existing.resetAt = now + stepMs;
    existing.lockLevel += 1;
  }
}

/**
 * Clear rate limit on successful login.
 */
export function clearLoginRateLimit(identifier: string): void {
  loginAttempts.delete(identifier.toLowerCase());
}

// ---------------------------------------------------------------------------
// Generic per-action limiter (in-memory, resets on restart) — used for
// sensitive free-form actions such as direct emails to applicants.
// ---------------------------------------------------------------------------

const actionAttempts = new Map<string, RateLimitEntry>();

/**
 * Consume one slot from a generic sliding-window quota. Records the attempt
 * and reports whether the caller is still under the limit.
 * Example: direct emails — 20 sends per user per 10 minutes.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; retryAfterMs?: number } {
  const k = key.toLowerCase();
  const now = Date.now();
  const entry = actionAttempts.get(k);

  if (!entry || now > entry.resetAt) {
    actionAttempts.set(k, { count: 1, lockLevel: 0, resetAt: now + windowMs });
    return { allowed: true };
  }
  if (entry.count >= limit) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }
  entry.count += 1;
  return { allowed: true };
}

/**
 * Get client IP from NextRequest, accounting for the Caddy reverse proxy.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  return "unknown";
}
