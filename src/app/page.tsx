"use client";

import { SessionProvider, useSession } from "@/components/session-provider";
import { NavProvider, useNav, homeForRole } from "@/components/nav-provider";
import { AppShell } from "@/components/shell/app-shell";
import { Suspense, useEffect, useSyncExternalStore } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Public views
import { PublicLanding } from "@/components/workspaces/public/public-landing";
import { JobsView } from "@/components/views/jobs-view";
import { SignInView } from "@/components/views/signin-view";
import { SignUpView } from "@/components/views/signup-view";

// Applicant (new workspaces)
import { ApplicantHome } from "@/components/workspaces/applicant/applicant-home";
import { ProfileView } from "@/components/views/profile-view";

// Evaluator — Atlas dash views (rebuilt review queue) + legacy review workspace
import { QueueView } from "@/components/dash/views/queue";
import { ReviewWorkspace } from "@/components/workspaces/evaluator/review-workspace";

// Admin (new workspaces)
import { CommandCenter } from "@/components/workspaces/admin/command-center";
import { RecruitmentList } from "@/components/workspaces/recruitment/recruitment-list";
import { JobWorkspace } from "@/components/workspaces/recruitment/job-workspace";

// Admin — Atlas dash views (rebuilt candidate registry + dossier)
import { CandidatesView } from "@/components/dash/views/candidates";
import { CandidateDetailView } from "@/components/dash/views/candidate";
import { AnalyticsWorkspace } from "@/components/workspaces/analytics/analytics";
import { SettingsWorkspace } from "@/components/workspaces/settings/settings";

function LoadingShell() {
  // Skeleton that mirrors the workspace content shape (eyebrow + title bar,
  // identity strip, two-column card grid) so the boot state doesn't flash.
  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] space-y-6">
        <div className="space-y-3 border-b border-border pb-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-64 max-w-full" />
        </div>
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Skeleton className="hidden h-80 lg:block" />
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Subscribe no-op for the mounted read — the value never changes after
// hydration, so there is nothing to subscribe to.
const subscribeNever = () => () => {};

function Router() {
  const { view, navigate } = useNav();
  const { user, loading } = useSession();

  // HYDRATION GATE — the hash router is client-only state (the server can
  // never see location.hash), so the server-rendered tree and the client's
  // first render must agree exactly: both render <LoadingShell /> until the
  // store flips after hydration. Hydrating directly on a deep link
  // (/#/job?id=4) without this gate makes the nav store's real snapshot
  // diverge from SERVER_VIEW mid-hydration, which double-mounts the app
  // (duplicate shell + dead event handlers on the stale copy). After mount,
  // views swap instantly — each view renders its own skeleton while its
  // data loads.
  //
  // useSyncExternalStore is the sanctioned "is hydrated" read: the hydration
  // render uses the server snapshot (false — matches SSR), the client
  // snapshot turns true right after hydration with no effect needed.
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  );

  // Redirect auth views if already logged in. The role→home table and the
  // hash write both live behind the Nav seam (nav-provider registry).
  useEffect(() => {
    if (loading) return;
    if ((view === "signin" || view === "signup") && user) {
      navigate(homeForRole(String(user.role)));
    }
  }, [view, user, loading, navigate]);

  if (!mounted || loading) return <LoadingShell />;

  function renderView() {
    // `view` is always canonical here — legacy names (admin-jobs,
    // evaluator-queue, applicant-details, …) are resolved by the VIEW_ALIASES
    // registry in nav-provider before they reach the Router.

    // Not logged in — public landing by default, jobs board on explicit view
    if (!loading && !user) {
      if (view === "signup") return <SignUpView />;
      if (view === "signin") return <SignInView />;
      if (view === "jobs") return <JobsView />;
      return <PublicLanding />;
    }

    if (loading) return <LoadingShell />;

    // Applicant role
    if (String(user?.role) === "APPLICANT") {
      if (view === "profile") return <ProfileView />;
      if (view === "jobs") return <JobsView />;
      return <ApplicantHome />;
    }

    // Evaluator role
    if (String(user?.role) === "EVALUATOR") {
      if (view === "evaluator-review") return <ReviewWorkspace />;
      if (view === "candidate") return <CandidateDetailView />;
      if (view === "candidates") return <CandidatesView />;
      if (view === "recruitment") return <RecruitmentList />;
      if (view === "job") return <JobWorkspace />;
      if (view === "jobs") return <JobsView />;
      return <QueueView />;
    }

    // Administrator role
    if (String(user?.role) === "ADMIN") {
      if (view === "recruitment") return <RecruitmentList />;
      if (view === "job") return <JobWorkspace />;
      if (view === "candidates") return <CandidatesView />;
      if (view === "candidate") return <CandidateDetailView />;
      if (view === "review-queue") return <QueueView />;
      if (view === "evaluator-review") return <ReviewWorkspace />;
      if (view === "analytics") return <AnalyticsWorkspace />;
      if (view === "settings") return <SettingsWorkspace initial={view} />;
      if (view === "jobs") return <JobsView />;
      return <CommandCenter />;
    }

    return <JobsView />;
  }

  // Views swap instantly — each view renders its own skeleton while its
  // data loads (no full-screen navigation wipe).
  return renderView();
}

function Shell() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingShell />}>
        <Router />
      </Suspense>
    </AppShell>
  );
}

export default function Page() {
  return (
    <SessionProvider>
      <NavProvider>
        <Shell />
      </NavProvider>
    </SessionProvider>
  );
}
