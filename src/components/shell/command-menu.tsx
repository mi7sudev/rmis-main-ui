"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { useNav } from "@/components/nav-provider";
import { flatNav } from "@/config/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { apiFetch, fullName } from "@/lib/client";
import { Briefcase, Users, ArrowRight, ChevronRight, type LucideIcon } from "lucide-react";

type AppRow = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
};
type JobRow = {
  id: number;
  title: string | null;
  position?: { positionTitle: string | null } | null;
};

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user } = useSession();
  const { navigate } = useNav();
  const navItems = flatNav(user?.role);
  const [applicants, setApplicants] = useState<AppRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);

  // Load searchable entities when the palette opens (admin/evaluator only).
  useEffect(() => {
    if (!open) return;
    if (!user || String(user.role) === "APPLICANT") return;
    let cancelled = false;
    (async () => {
      try {
        const [a, j] = await Promise.all([
          apiFetch<{ data: AppRow[] } | AppRow[]>("/api/admin/applicants?pageSize=50").catch(() => ({ data: [] })),
          apiFetch<JobRow[] | { data: JobRow[] }>("/api/jobs?limit=50").catch(() => []),
        ]);
        if (cancelled) return;
        const aData = Array.isArray(a) ? a : a.data ?? [];
        const jData = Array.isArray(j) ? j : j.data ?? [];
        setApplicants(aData);
        setJobs(jData);
      } catch {
        /* ignore — palette still shows navigation */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const canSearchEntities = user && String(user.role) !== "APPLICANT";

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search applicants, positions, or navigate…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {navItems.map((item) => {
            const Icon: LucideIcon = item.icon;
            return (
              <CommandItem
                key={item.view}
                value={`${item.label} ${item.hint ?? ""} navigation go to`}
                onSelect={() => {
                  navigate(item.view);
                  onOpenChange(false);
                }}
                className="rounded-xl"
              >
                <Icon className="mr-2 size-4 text-primary/70" />
                <span>{item.label}</span>
                {item.hint && (
                  <span className="ml-1 text-xs text-muted-foreground">· {item.hint}</span>
                )}
                <ChevronRight className="ml-auto size-4 text-muted-foreground/50" />
              </CommandItem>
            );
          })}
        </CommandGroup>

        {canSearchEntities && jobs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Positions">
              {jobs.slice(0, 12).map((j) => {
                const title = j.title || j.position?.positionTitle || "Untitled Position";
                return (
                  <CommandItem
                    key={j.id}
                    value={`position ${title} job ${j.id}`}
                    onSelect={() => {
                      navigate("job", { id: String(j.id) });
                      onOpenChange(false);
                    }}
                    className="rounded-xl"
                  >
                    <Briefcase className="mr-2 size-4 text-primary/70" />
                    <span className="truncate">{title}</span>
                    <span className="ml-auto text-xs text-muted-foreground">Job #{j.id}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {canSearchEntities && applicants.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Applicants">
              {applicants.slice(0, 12).map((a) => (
                <CommandItem
                  key={a.id}
                  value={`applicant ${fullName(a)} ${a.emailAddress ?? ""} ${a.id}`}
                  onSelect={() => {
                    navigate("candidate", { id: String(a.id) });
                    onOpenChange(false);
                  }}
                  className="rounded-xl"
                >
                  <Users className="mr-2 size-4 text-primary/70" />
                  <span className="truncate">{fullName(a)}</span>
                  <span className="ml-auto text-xs text-muted-foreground">#{a.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Quick actions">
          <CommandItem
            value="sign out logout"
            onSelect={() => {
              // Deliberately NOT apiFetch: fire-and-forget — navigation must
              // happen even if the logout endpoint is unreachable.
              fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then(() => {
                navigate("signin");
                window.location.reload();
              });
            }}
            className="rounded-xl text-destructive data-[selected=true]:text-destructive"
          >
            <ArrowRight className="mr-2 size-4 text-destructive/70" />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
