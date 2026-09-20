// ============================================================================
// env.ts — Centralized, validated environment configuration.
//
// The app runs in two environments, both driven by the same `.env` file:
//   1. Localhost development  — `bun run dev`  (NODE_ENV=development)
//   2. Intranet production     — `bun run start` (NODE_ENV=production)
//
// Both use a SQLite file database (`file:...`) and a persistent filesystem,
// so the SAME three variables configure either environment — only the VALUES
// differ between `.env` on your laptop and `.env` on the intranet server.
//
// This module:
//   1. Validates every required variable at startup (fail-fast with a clear
//      message — no silent fallbacks that would make tokens forgeable).
//   2. Provides a single typed source of truth (`env` object).
//   3. Documents each variable inline.
//
// See `.env.example` for a copy-paste template and `DEPLOYMENT.md` for the
// full setup guide for both environments.
// ============================================================================

type EnvShape = {
  /** SQLite connection string. Always `file:<path>` for both dev and prod. */
  DATABASE_URL: string;
  /** Secret (≥16 chars) used to sign JWT session tokens (HS256). */
  NEXTAUTH_SECRET: string;
  /** Canonical public URL of the deployed app (no trailing slash). */
  NEXTAUTH_URL: string;
  /** Node environment — "development" | "production" | "test". Set by Next.js. */
  NODE_ENV: string;
  /**
   * Absolute path to the upload directory for applicant documents.
   * Defaults to `<project-root>/upload`. Set this on the intranet server if
   * uploads should live on a separate volume (e.g. a mounted NFS share).
   */
  UPLOAD_DIR: string;
  // ── AI / Document Intelligence ──────────────────────────────────────────
  /** API key for the AI provider (NVIDIA, OpenAI-compatible). Required for PDS auto-extract. */
  AI_API_KEY: string;
  /** Base URL of the OpenAI-compatible AI API. Default: NVIDIA integrate endpoint. */
  AI_BASE_URL: string;
  /** Chat/instruct model for structuring extracted text into JSON. */
  AI_TEXT_MODEL: string;
  /** Vision/OCR model for extracting text from images. */
  AI_VISION_MODEL: string;
  // ── Two-tier access control (public web vs intranet staff) ─────────────
  /**
   * "on" (default) — ADMIN/EVALUATOR logins, sessions and APIs only work
   * from intranet IPs; applicants work from any network. "off" disables all
   * tier checks (emergency recovery switch). See src/lib/access-tier.ts.
   */
  INTRANET_ENFORCEMENT: string;
  /**
   * Comma-separated extra IPv4 CIDRs always treated as intranet (allowlist
   * for an office egress IP behind NAT or an admin VPN range).
   * Example: INTRANET_CIDRS=203.0.113.7/32,198.51.100.0/24
   */
  INTRANET_CIDRS: string;
};

const REQUIRED: ReadonlyArray<keyof EnvShape> = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
];

function readEnv(): EnvShape {
  const rawUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");

  const env: EnvShape = {
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? "",
    NEXTAUTH_URL: rawUrl,
    NODE_ENV: process.env.NODE_ENV ?? "development",
    UPLOAD_DIR: process.env.UPLOAD_DIR ?? "",
    AI_API_KEY: process.env.AI_API_KEY ?? "",
    AI_BASE_URL: (process.env.AI_BASE_URL ?? "https://integrate.api.nvidia.com/v1").replace(/\/+$/, ""),
    AI_TEXT_MODEL: process.env.AI_TEXT_MODEL ?? "nvidia/llama-3.3-nemotron-super-49b-v1",
    AI_VISION_MODEL: process.env.AI_VISION_MODEL ?? "nvidia/nemotron-nano-12b-v2-vl",
    INTRANET_ENFORCEMENT: (process.env.INTRANET_ENFORCEMENT ?? "on").trim().toLowerCase(),
    INTRANET_CIDRS: process.env.INTRANET_CIDRS ?? "",
  };

  // Fail-fast: required vars must be present and non-empty.
  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(
      "[env] Missing required environment variables: " +
        missing.join(", ") +
        ". Copy .env.example to .env and fill in the values. See DEPLOYMENT.md."
    );
  }

  if (env.NEXTAUTH_SECRET.length < 16) {
    throw new Error(
      "[env] NEXTAUTH_SECRET must be at least 16 characters. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  // DATABASE_URL must be a SQLite file URL for both dev and intranet prod.
  if (!env.DATABASE_URL.startsWith("file:")) {
    throw new Error(
      "[env] DATABASE_URL must be a SQLite file URL (e.g. file:./db/production-data.db). " +
        "Got: " + env.DATABASE_URL
    );
  }

  // Production safety guard — refuse to connect to the legacy dev scratch DB.
  if (env.NODE_ENV === "production" && env.DATABASE_URL.includes("custom.db")) {
    throw new Error(
      "[env] Refusing to connect to 'custom.db' in production — this is the old " +
        "dev scratch database. Set DATABASE_URL to the production database " +
        "(file:./db/production-data.db)."
    );
  }

  // Warn (don't throw) when AI_API_KEY is missing — the app still starts, but
  // the PDS auto-extract feature will fail at runtime with a clear error.
  if (!env.AI_API_KEY) {
    console.warn(
      "[env] AI_API_KEY is not set. Document Intelligence (PDS auto-extract) " +
        "will not work. Set AI_API_KEY in .env to enable AI-powered extraction."
    );
  }

  // Two-tier access guard sanity check — an unknown value should fail loudly
  // rather than silently behaving as "off".
  if (env.INTRANET_ENFORCEMENT !== "on" && env.INTRANET_ENFORCEMENT !== "off") {
    throw new Error(
      "[env] INTRANET_ENFORCEMENT must be 'on' or 'off' (default 'on'). " +
        "Got: " + env.INTRANET_ENFORCEMENT
    );
  }

  return env;
}

// ----------------------------------------------------------------------------
// Singleton — read once on first import, cached for the process lifetime.
// In dev (Turbopack/HMR) the module graph can be re-evaluated, so we also cache
// on globalThis to avoid re-running validation on every hot reload.
// ----------------------------------------------------------------------------
const g = globalThis as unknown as { __rmisEnv?: EnvShape };
export const env: EnvShape = g.__rmisEnv ?? (g.__rmisEnv = readEnv());

/** Convenience: is the app running in production mode? */
export const isProduction = env.NODE_ENV === "production";

/** Convenience: is the app running in development mode? */
export const isDevelopment = env.NODE_ENV === "development";

/**
 * Resolve the absolute upload directory. Falls back to `<cwd>/upload` when
 * UPLOAD_DIR is not set (the default for both localhost dev and a standard
 * intranet install).
 */
export function uploadDir(): string {
  return env.UPLOAD_DIR || `${process.cwd()}/upload`;
}

/**
 * Resolve the SQLite file path from DATABASE_URL (strips the `file:` prefix).
 * Used by better-sqlite3 in raw-json.ts.
 */
export function sqliteFilePath(): string {
  return env.DATABASE_URL.replace(/^file:/, "");
}
