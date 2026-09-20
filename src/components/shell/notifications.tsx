"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/client";
import { Bell, AlertTriangle, Upload, FileText } from "lucide-react";

type Stats = {
  pendingReview?: number;
  deadlinesThisWeek?: number;
  failedLogins24h?: number;
  blockedUsers?: number;
  incompleteProfiles?: number;
};

type Notif = {
  id: string;
  category: "attention" | "updates" | "system";
  icon: typeof AlertTriangle;
  title: string;
  detail?: string;
};

export function NotificationCenter({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useSession();
  const [stats, setStats] = useState<Stats | null>(null);

  const isAdmin = !!user && String(user.role) === "ADMIN";

  // Realtime badge: fetch as soon as the admin session is known, then keep
  // the count live with a 30s silent poll (visible tabs only) — previously
  // the badge only updated when the dropdown was opened, so it could sit
  // stale on the header all day.
  useEffect(() => {
    if (!isAdmin) return;
    let inFlight = false;
    const load = () => {
      if (inFlight) return;
      inFlight = true;
      apiFetch<Stats>("/api/admin/stats")
        .then(setStats)
        .catch(() => setStats(null))
        .finally(() => {
          inFlight = false;
        });
    };
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    return () => clearInterval(timer);
  }, [isAdmin]);

  // Extra refetch each time the panel opens so the list is never stale.
  useEffect(() => {
    if (!open || !isAdmin) return;
    apiFetch<Stats>("/api/admin/stats")
      .then(setStats)
      .catch(() => setStats(null));
  }, [open, isAdmin]);

  const notifs: Notif[] = [];
  if (isAdmin && stats) {
    if (stats.pendingReview)
      notifs.push({ id: "review", category: "attention", icon: AlertTriangle, title: `${stats.pendingReview} applications awaiting review`, detail: "Credentials to check and shortlist decisions to record." });
    if (stats.deadlinesThisWeek)
      notifs.push({ id: "deadline", category: "attention", icon: AlertTriangle, title: `${stats.deadlinesThisWeek} job deadlines this week`, detail: "Postings closing within 7 days." });
    if (stats.incompleteProfiles)
      notifs.push({ id: "incomplete", category: "updates", icon: FileText, title: `${stats.incompleteProfiles} incomplete applicant profiles`, detail: "Applicants who haven't finished their PDS." });
    if (stats.failedLogins24h)
      notifs.push({ id: "logins", category: "system", icon: AlertTriangle, title: `${stats.failedLogins24h} failed logins (24h)`, detail: "Possible brute-force attempts detected." });
  }

  const count = notifs.length;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground" aria-label="Notifications">
          <Bell className="size-[18px]" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-[#e9ebdf] ring-2 ring-background">
              {count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1rem)] p-1">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="font-semibold tracking-tight">Notifications</span>
          <span className="text-[11px] font-normal text-muted-foreground">
            {count > 0 ? `${count} new` : "You're up to date"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {count === 0 ? (
          <div className="px-3 py-8 text-center">
            <span className="mx-auto mb-2 grid size-12 place-items-center rounded-none border border-border bg-secondary text-primary/60">
              <Bell className="size-5" />
            </span>
            <p className="text-sm font-medium text-foreground">No new notifications</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Recruitment updates and deadlines will appear here.
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifs.map((n) => {
              const Icon = n.icon;
              const tone =
                n.category === "attention"
                  ? "bg-warning/10 text-warning-ink"
                  : n.category === "updates"
                  ? "bg-primary/10 text-primary"
                  : "bg-secondary text-muted-foreground";
              return (
                <div
                  key={n.id}
                  className="mx-1 my-0.5 flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-secondary"
                >
                  <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-none border ${tone}`}>
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium tracking-tight text-foreground">{n.title}</p>
                    {n.detail && <p className="mt-0.5 text-xs text-muted-foreground">{n.detail}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
