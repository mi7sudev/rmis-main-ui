"use client";

import { useEffect, useRef } from "react";

// ============================================================================
// useRefetchOnFocus — realtime-lite data refresh for long-lived portal views.
//
// Keeps views in sync with changes recorded elsewhere — another role (an
// evaluator shortlisting while the applicant tab is open), another tab, or
// the same user mutating data through a different view — WITHOUT a manual
// reload. Three triggers, all silent by design (no skeleton flash; the
// caller decides how to refetch):
//
//   1. Window focus / tab visibility  — the classic "come back to the tab"
//      refetch; surfaces decisions recorded while the user was away.
//   2. Optional gentle polling (`pollMs`) — while the document is visible,
//      the refetch fires on a fixed interval so changes made by OTHER users
//      surface even when this tab never loses focus. Paused automatically
//      while the tab is hidden (no background network churn).
//   3. Overlap guard — a slow response never stacks a second in-flight
//      request; ticks that land mid-flight are skipped.
// ============================================================================

export function useRefetchOnFocus(
  refetch: () => void,
  opts?: { pollMs?: number }
) {
  const cb = useRef(refetch);
  const inFlight = useRef(false);

  // Keep the latest callback without re-binding the listeners.
  useEffect(() => {
    cb.current = refetch;
  }, [refetch]);

  // The runner serializes calls: a tick (or focus event) that arrives while
  // a previous silent refetch is still in the air is dropped — the next
  // tick will pick the data up. Never throws.
  useEffect(() => {
    const run = () => {
      if (inFlight.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible")
        return;
      inFlight.current = true;
      try {
        // Annotated as unknown: the callback may return a Promise (async
        // refetches) — only then do we defer clearing the in-flight flag.
        const result: unknown = cb.current();
        if (result && typeof (result as Promise<unknown>).finally === "function") {
          (result as Promise<unknown>).finally(() => {
            inFlight.current = false;
          });
        } else {
          inFlight.current = false;
        }
      } catch {
        inFlight.current = false;
      }
    };

    const focusHandler = () => {
      if (document.visibilityState === "visible") run();
    };

    window.addEventListener("focus", focusHandler);
    document.addEventListener("visibilitychange", focusHandler);

    let timer: ReturnType<typeof setInterval> | null = null;
    if (opts?.pollMs && Number.isFinite(opts.pollMs) && opts.pollMs > 0) {
      timer = setInterval(run, opts.pollMs);
    }

    return () => {
      window.removeEventListener("focus", focusHandler);
      document.removeEventListener("visibilitychange", focusHandler);
      if (timer) clearInterval(timer);
    };
  }, []);
}
