"use client";

import { createContext, useContext, useCallback, useSyncExternalStore, type ReactNode } from "react";
import type { Role } from "@/lib/roles";

// ============================================================================
// RMIS 2.0 — View union
// Extended with new workspace views. Legacy views retained for backward
// compatibility (deep-links, redirects) but the new Router routes primary
// experiences through the new workspace views.
// ============================================================================
export type View =
  // Public / auth
  | "signin"
  | "signup"
  | "jobs"            // public job board (also used as applicant "positions")
  // Applicant
  | "home"            // applicant home (journey + applications tracker)
  | "profile"         // applicant: profile builder
  // Evaluator
  | "review-queue"    // NEW: evaluator my review queue
  | "evaluator-queue" // legacy alias → review-queue
  | "evaluator-review"
  // Admin — new workspaces
  | "operations"      // NEW: admin command center
  | "recruitment"     // NEW: jobs workspace list
  | "job"             // NEW: job workspace (params: id, tab)
  | "candidates"      // NEW: candidate workspace (list/kanban)
  | "candidate"       // NEW: candidate detail workspace (params: id)
  | "analytics"       // NEW: recruitment analytics
  | "settings"        // NEW: admin settings hub
  // Legacy admin views (kept for deep-link compat, routed to new workspaces)
  | "admin-dashboard"
  | "admin-users"
  | "admin-jobs"
  | "admin-applicants"
  | "admin-audit-log"
  | "admin-positions"
  | "applicant-details"
  | "my-applications";

type NavParams = Record<string, string>;

type NavContextValue = {
  view: View;
  params: NavParams;
  navigate: (view: View, params?: NavParams) => void;
};

const NavContext = createContext<NavContextValue | undefined>(undefined);

const VALID_VIEWS: View[] = [
  "signin", "signup", "jobs",
  "home", "profile",
  "review-queue", "evaluator-queue", "evaluator-review",
  "operations", "recruitment", "job", "candidates", "candidate", "analytics", "settings",
  "admin-dashboard", "admin-users", "admin-jobs", "admin-applicants", "admin-audit-log", "admin-positions",
  "applicant-details", "my-applications",
];

// ============================================================================
// View registry — the single set of tables behind the Nav seam.
// parseHash(), navigate(), and the role→home redirect all resolve through
// these tables; navigate() below is the ONLY code that writes
// window.location.hash.
// ============================================================================

// Legacy/deprecated view name → canonical View. Old deep-links redirect to the
// new workspace so bookmarks keep working, and navigate() canonicalizes on the
// way out so the hash never carries a legacy name.
export const VIEW_ALIASES: Partial<Record<View, View>> = {
  "evaluator-queue": "review-queue",
  "admin-dashboard": "operations",
  "admin-jobs": "recruitment",
  "admin-applicants": "candidates",
  "admin-audit-log": "settings",
  "admin-users": "settings",
  "admin-positions": "settings",
  "applicant-details": "candidate",
  // Legacy deep-link: the standalone tracker is gone — applications now live
  // on the applicant home rail ("Your Applications · In Progress").
  "my-applications": "home",
};

// Home view per role (post-login redirect target). Roles are the app's three
// derived roles from src/lib/roles.ts (there is no Prisma Role enum — the
// production DB stores roles in `up_roles` and the JWT role is derived at login).
const ROLE_HOME: Partial<Record<Role, View>> = {
  APPLICANT: "home",
  EVALUATOR: "review-queue",
  ADMIN: "operations",
};

// Resolve a legacy/deprecated view name to its canonical View.
export function resolveAlias(view: View): View {
  return VIEW_ALIASES[view] ?? view;
}

// Home view for a role string (as carried by the session JWT). Unknown or
// absent roles fall back to the admin home, matching the previous inline
// mapping in page.tsx.
export function homeForRole(role: string | undefined | null): View {
  return ROLE_HOME[String(role) as Role] ?? "operations";
}

function parseHash(): { view: View; params: NavParams } {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [viewPart, queryPart] = hash.split("?");
  // Default to "home" — the landing page (logged out) or role home (authed)
  let view = (VALID_VIEWS.includes(viewPart as View) ? viewPart : "home") as View;
  // Resolve legacy → canonical via the view registry
  view = resolveAlias(view);
  const params: NavParams = {};
  if (queryPart) {
    for (const pair of queryPart.split("&")) {
      const [k, v] = pair.split("=");
      if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
  }
  return { view, params };
}

function toHash(view: View, params?: NavParams): string {
  let hash = `#/${view}`;
  if (params && Object.keys(params).length) {
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    hash += `?${qs}`;
  }
  return hash;
}

// ---- External store for window.location.hash (hydration-safe) -------------
// useSyncExternalStore returns the server snapshot during SSR + the first
// client render (avoiding hydration mismatch), then the real client value on
// subsequent renders. We always return "jobs" on the server so that the
// SiteHeader / AppShell render consistently on first paint.
//
// IMPORTANT: getSnapshot must return a cached/stable value (same reference
// if the underlying hash hasn't changed), otherwise React detects an infinite
// update loop. We cache the parsed { view, params } and only re-parse when
// window.location.hash actually changes.
const SERVER_VIEW: View = "jobs";
const SERVER_PARAMS: NavParams = {};

function subscribeHash(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

// Cached snapshot — re-parsed only when the hash string changes.
let cachedHash: string | null = null;
let cachedView: View = SERVER_VIEW;
let cachedParams: NavParams = SERVER_PARAMS;

function getHashView(): View {
  if (typeof window === "undefined") return SERVER_VIEW;
  const h = window.location.hash;
  if (h !== cachedHash) {
    cachedHash = h;
    const parsed = parseHash();
    cachedView = parsed.view;
    cachedParams = parsed.params;
  }
  return cachedView;
}

function getHashParams(): NavParams {
  if (typeof window === "undefined") return SERVER_PARAMS;
  const h = window.location.hash;
  if (h !== cachedHash) {
    cachedHash = h;
    const parsed = parseHash();
    cachedView = parsed.view;
    cachedParams = parsed.params;
  }
  return cachedParams;
}

export function NavProvider({ children }: { children: ReactNode }) {
  const view = useSyncExternalStore(subscribeHash, getHashView, () => SERVER_VIEW);
  const params = useSyncExternalStore(subscribeHash, getHashParams, () => SERVER_PARAMS);

  const navigate = useCallback((newView: View, newParams?: NavParams) => {
    const resolved = resolveAlias(newView);
    // Setting the hash triggers the `hashchange` event, which the
    // useSyncExternalStore subscription picks up — no manual setState needed.
    window.location.hash = toHash(resolved, newParams);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <NavContext.Provider value={{ view, params, navigate }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}
