"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { useNav } from "@/components/nav-provider";
import { flatNav, homeViewForRole } from "@/config/navigation";
import { Button } from "@/components/ui/button";
import { CommandMenu } from "@/components/shell/command-menu";
import { NotificationCenter } from "@/components/shell/notifications";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { navForRole } from "@/config/navigation";
import { Menu, Search, ChevronRight, type LucideIcon } from "lucide-react";

// Resolve a breadcrumb { workspace, current } from the nav config.
function useBreadcrumb() {
  const { user } = useSession();
  const { view } = useNav();
  const items = flatNav(user?.role);
  const sections = navForRole(user?.role);
  let workspace = "Workspace";
  let current = "";
  for (const s of sections) {
    const found = s.items.find((i) => i.view === view);
    if (found) {
      workspace = s.label;
      current = found.label;
      break;
    }
  }
  if (!current) {
    if (view === "job") current = "Job";
    else if (view === "candidate") current = "Candidate";
    else if (view === "evaluator-review") current = "Review";
    else if (view === "jobs") {
      // Jobs board is not a sidebar item anymore (applicant reaches it via
      // the homepage "View All") — keep a proper label instead of "Overview".
      const r = String(user?.role ?? "");
      return { workspace: r === "APPLICANT" ? "Portal" : "Recruitment", current: "Positions" };
    } else if (view === "signin" || view === "signup") current = "Welcome";
    else current = "Overview";
  }
  return { workspace, current };
}

export function WorkspaceHeader({ onMenuClick }: { onMenuClick: () => void }) {
  const { user } = useSession();
  const { navigate } = useNav();
  const { workspace, current } = useBreadcrumb();
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md sm:px-5">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>

      {/* Breadcrumb — “>” momentum motif */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        <button
          onClick={() => navigate(homeViewForRole(user?.role))}
          className="hidden rounded-none px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:block"
        >
          {workspace}
        </button>
        <ChevronRight aria-hidden className="hidden size-3.5 text-muted-foreground/50 sm:block" />
        <span className="truncate font-semibold tracking-[-0.01em] text-foreground">{current}</span>
      </nav>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          onClick={() => setSearchOpen(true)}
          className="hidden h-11 gap-2 rounded-none border border-border bg-transparent px-3.5 text-muted-foreground hover:bg-accent hover:text-foreground sm:flex"
          aria-label="Search"
        >
          <Search className="size-4" />
          <span className="text-sm">Search</span>
          <kbd className="ml-1 inline-flex h-5 items-center rounded-none border border-border bg-secondary px-1.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </Button>
        <Button variant="ghost" size="icon" className="sm:hidden text-muted-foreground" onClick={() => setSearchOpen(true)} aria-label="Search">
          <Search className="size-[18px]" />
        </Button>
        <NotificationCenter open={notifOpen} onOpenChange={setNotifOpen} />
      </div>

      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
