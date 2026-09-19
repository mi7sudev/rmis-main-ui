"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/client";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";

// ============================================================================
// Shared admin data hooks — realtime-lite.
//
// Both hooks auto-refresh SILENTLY when the tab regains focus and on a
// gentle poll while the tab stays visible, so admin/evaluator surfaces
// (recruitment list, command center, analytics) track new postings, new
// applications and status changes recorded elsewhere without a manual
// reload. Silent loads never flip the full-page skeleton and never clobber
// good data with a transient error.
// ============================================================================

// Canonical stats shape returned by GET /api/admin/stats (preserved contract)
export type AdminStats = {
  totalUsers: number;
  applicants: number;
  evaluators: number;
  admins: number;
  activeJobs: number;
  totalApplications: number;
  pendingReview: number;
  shortlisted: number;
  rejected: number;
  byStatus: { status: string; count: number }[];
  recent: {
    id: number;
    status: string;
    dateApplied: string;
    applicantId: number | null;
    applicant: { firstName: string | null; lastName: string | null } | null;
    job: { title: string | null } | null;
  }[];
  failedLogins24h: number;
  deadlinesThisWeek: number;
  blockedUsers: number;
  incompleteProfiles: number;
};

// Quiet cadence — operational dashboards, not chat: 30s catches every
// meaningful movement (new applications, decisions, deadline crossings)
// without hammering the API.
const ADMIN_POLL_MS = 30_000;

export function useAdminStats() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async (silent?: boolean) => {
    // `silent === true` only when called deliberately (focus/poll refetch).
    // Event-object args (e.g. onClick={reload}) fall through to a full load.
    const isSilent = silent === true;
    if (inFlight.current) return;
    if (!isSilent) {
      setLoading(true);
    }
    setError(null);
    inFlight.current = true;
    try {
      const data = await apiFetch<AdminStats>("/api/admin/stats");
      setStats(data);
    } catch (e) {
      // Silent refresh: keep the last good stats on a transient failure.
      if (!isSilent) setError(e instanceof Error ? e.message : "Failed to load stats");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRefetchOnFocus(() => load(true), { pollMs: ADMIN_POLL_MS });

  // No-arg wrapper — safe to hand straight to onClick handlers.
  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { stats, loading, error, reload };
}

// Job shape (preserved from /api/jobs)
export type JobRow = {
  id: number;
  title: string | null;
  positionType: string | null;
  briefDescription: string | null;
  briefDescriptionHtml: string | null;
  dutiesResponsibilities: string | null;
  dutiesResponsibilitiesHtml: string | null;
  compensationPackage: string | null;
  compensationPackageHtml: string | null;
  otherQualifications: string | null;
  otherQualificationsHtml: string | null;
  numberOfVacancy: number;
  publishDate: string | null;
  deadlineDate: string | null;
  processingDate: string | null;
  isActive: boolean;
  position: {
    id: string;
    positionTitle: string | null;
    itemNumber: string | null;
    salaryGrade: string | null;
    salaryStep: string | null;
    salaryAmount: number | null;
    division: string | null;
    section: string | null;
    cscEducation: string | null;
    cscWorkExperience: string | null;
    cscTrainingRequirements: string | null;
    cscEligibilityGroup: string | null;
    specialSkill: string | null;
    placeOfAssignment: { name: string } | null;
  } | null;
  applications?: { id: string }[] | false;
  applicationCount?: number;
};

export function useJobs() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async (silent?: boolean) => {
    const isSilent = silent === true;
    if (inFlight.current) return;
    if (!isSilent) {
      setLoading(true);
    }
    setError(null);
    inFlight.current = true;
    try {
      const data = await apiFetch<JobRow[]>("/api/jobs");
      setJobs(Array.isArray(data) ? data : []);
    } catch (e) {
      // Silent refresh: keep the last good list on a transient failure.
      if (!isSilent) setError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useRefetchOnFocus(() => load(true), { pollMs: ADMIN_POLL_MS });

  // No-arg wrapper — safe to hand straight to onClick handlers.
  const reload = useCallback(() => {
    void load();
  }, [load]);

  return { jobs, loading, error, reload };
}

// Derived "active" check (preserved business rule: published + deadline not passed)
export function isJobActive(job: JobRow): boolean {
  return job.isActive && (!job.deadlineDate || new Date(job.deadlineDate) >= new Date());
}

export function appCount(job: JobRow): number | null {
  if (typeof job.applicationCount === "number") return job.applicationCount;
  if (Array.isArray(job.applications)) return job.applications.length;
  return null;
}
