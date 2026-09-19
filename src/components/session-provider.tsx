"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import type { SessionUser } from "@/lib/client";
import { apiFetch } from "@/lib/client";

// ============================================================================
// SessionProvider — the app-level session store.
//
// The session is the one piece of state that OUTLIVES view navigation (the
// hash router remounts views, but this provider stays mounted), so every
// session-driven UI — the applicant "Complete Your Profile" banner, the
// header greeting, role-gated navigation — reads from here.
//
// Realtime contract:
//   1. refresh()        — hard refresh; a failure CLEARS the user (used at
//                          boot and after sign-in/out: a dead session must
//                          surface as logged-out).
//   2. silentRefresh()  — soft self-heal; a failure KEEPS the current user
//                          (a transient network hiccup on a focus event must
//                          never kick a signed-in user out).
//   3. Auto triggers    — silentRefresh on window focus / tab visibility and
//                          on a gentle 60s poll (visible tabs only), so
//                          profile completeness, names and role changes made
//                          anywhere (another tab, another device, the HR
//                          office) surface without a manual reload.
// ============================================================================

type SessionContextValue = {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (u: SessionUser | null) => void;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

// Gentle self-heal cadence — the session carries slowly-changing profile
// state, so it does not need an aggressive poll; focus + visibility events
// cover the instant cases (e.g. completing the profile in another tab).
const SESSION_POLL_MS = 60_000;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSession = useCallback(async (onFailure: "clear" | "keep") => {
    try {
      const data = await apiFetch<{ user: SessionUser | null }>("/api/session");
      setUser(data.user);
    } catch {
      if (onFailure === "clear") setUser(null);
      // "keep": transient failure — hold the last known session.
    } finally {
      setLoading(false);
    }
  }, []);

  // Boot + post-auth refresh — a dead/invalid session surfaces as logged out.
  const refresh = useCallback(() => fetchSession("clear"), [fetchSession]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ---- Realtime self-heal (focus / visibility / gentle poll) ---------------
  const inFlight = useRef(false);
  useEffect(() => {
    const run = () => {
      if (inFlight.current) return;
      if (document.visibilityState !== "visible") return;
      inFlight.current = true;
      fetchSession("keep").finally(() => {
        inFlight.current = false;
      });
    };

    const handler = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("focus", handler);
    document.addEventListener("visibilitychange", handler);
    const timer = setInterval(run, SESSION_POLL_MS);

    return () => {
      window.removeEventListener("focus", handler);
      document.removeEventListener("visibilitychange", handler);
      clearInterval(timer);
    };
  }, [fetchSession]);

  return (
    <SessionContext.Provider value={{ user, loading, refresh, setUser }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
