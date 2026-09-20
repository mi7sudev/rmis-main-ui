"use client";

import { useState } from "react";
import { useSession } from "@/components/session-provider";
import { useNav } from "@/components/nav-provider";
import { navForRole, homeViewForRole, ROLE_LABELS } from "@/config/navigation";
import type { NavItem, NavSection } from "@/config/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { LogOut, ChevronRight, PanelLeftClose, type LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import type { Role } from "@/lib/roles";

// ============================================================================
// Desktop nav rail — two states (every signed-in workspace: admin, evaluator,
// and applicant — the public frontpage renders no rail at all, so it is
// untouched by this behavior):
//
//   collapsed (default, w-16) — icon-only rail. An INVISIBLE click layer
//     covers the whole rail (z-0, under the interactive children) so clicking
//     anywhere "empty" expands it — same gesture as ChatGPT / z.ai. No
//     collapse affordance is rendered in this state: the rail itself IS the
//     way back in.
//   expanded (w-64) — full labels + section headers + an explicit
//     "Collapse sidebar" button (PanelLeftClose) in the header. Nav clicks
//     keep the rail open.
//
// The choice persists in localStorage (rmis.rail-expanded) so the workspace
// reopens the way the user left it. Keyboard users are unaffected: every nav
// item, the theme toggle, and the account menu stay directly focusable in
// both states; the expand layer is aria-hidden + tabIndex -1 (mouse-only
// sugar on top of an already fully keyboard-navigable rail).
// ============================================================================

const RAIL_EXPANDED_KEY = "rmis.rail-expanded";

function readExpanded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(RAIL_EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeExpanded(v: boolean) {
  try {
    window.localStorage.setItem(RAIL_EXPANDED_KEY, v ? "1" : "0");
  } catch {
    /* private mode — persistence is best-effort */
  }
}

function initials(first?: string | null, last?: string | null): string {
  const a = (first || "").trim().charAt(0);
  const b = (last || "").trim().charAt(0);
  return (a + b).toUpperCase() || "?";
}

// ---- Brand mark — logo only (no wordmark). MIRDC-mark.png is the single
// official emblem (cropped from the two-up MIRDC.png source, outer white
// knocked out to alpha), so it can be sized far larger than the two-up file
// ever allowed. It sits directly on the sidebar canvas in light mode; dark
// mode keeps a parchment plate because the mark's black quadrants would
// vanish on the obsidian rail.
function BrandMark({ expanded }: { expanded: boolean }) {
  const { navigate } = useNav();
  const { user } = useSession();
  return (
    <button
      onClick={() => navigate(homeViewForRole(user?.role))}
      aria-label="RMIS home"
      className="relative z-10 shrink-0 transition-opacity hover:opacity-90"
    >
      {/* flex + items-center: the chip must be a flex container. Tailwind's
          preflight makes <img> display:block, and an INLINE wrapper around a
          block image gets fragmented by the browser — the background
          then paints as two empty line-box strips (24px each) above/below the
          logo, while the image overflows the fragments sideways. That was the
          "horizontal line through the logo" artifact on the collapsed dark
          rail. The site-header chip already uses this exact pattern.
          Plate: transparent in light — the logo shares the sidebar's white;
          dark keeps the parchment plate (the mark is black-on-transparent,
          and inverting it would distort the brand blue/red). */}
      <span className="flex shrink-0 items-center rounded-none bg-transparent p-1 dark:bg-parchment">
        <img
          src="/MIRDC-mark.png"
          alt="MIRDC"
          className={`w-auto object-contain ${expanded ? "h-14" : "h-10"}`}
        />
      </span>
    </button>
  );
}

// ---- Nav item button — icon-only (collapsed, tooltip) or icon+label --------
function RailItem({ item, expanded }: { item: NavItem; expanded: boolean }) {
  const { view, navigate } = useNav();
  const active = view === item.view;
  const Icon: LucideIcon = item.icon;

  const button = (
    <button
      onClick={() => navigate(item.view)}
      aria-current={active ? "page" : undefined}
      className={
        expanded
          ? `relative flex min-h-11 w-full items-center gap-2.5 rounded-none px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            }`
          : `group relative grid size-12 place-items-center rounded-none transition-colors ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            }`
      }
    >
      {expanded && active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-none bg-primary-foreground"
        />
      )}
      <Icon
        className={`size-[18px] shrink-0 transition-transform group-hover:translate-x-px ${
          active ? "text-primary-foreground" : ""
        }`}
      />
      {expanded && <span className="truncate">{item.label}</span>}
    </button>
  );

  // Tooltips are only for the icon-only state — labels make them noise.
  if (expanded) return button;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {item.label}
          {item.hint && (
            <span className="ml-1.5 font-normal text-muted-foreground">
              · {item.hint}
            </span>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---- Desktop rail ----------------------------------------------------------
export function NavRail() {
  const { user } = useSession();
  const sections = navForRole(user?.role);
  const role = String(user?.role ?? "") as Role;
  // Expanding rail is workspace behavior for EVERY signed-in role (admin,
  // evaluator, applicant) — same ChatGPT/z.ai gesture everywhere. The rail
  // only mounts inside AuthedShell, so the logged-out frontpage is unaffected.
  const canExpand = Boolean(user);
  const [expanded, setExpanded] = useState(readExpanded);
  const isOpen = canExpand && expanded;

  const expand = () => {
    setExpanded(true);
    writeExpanded(true);
  };
  const collapse = () => {
    setExpanded(false);
    writeExpanded(false);
  };

  // Click anywhere on the collapsed rail expands it — EXCEPT when the click
  // lands on an interactive child (nav item, brand, theme, account): those
  // keep their own behavior. A click handler on the aside itself is the only
  // reliable way to catch the rail's empty areas (the nav container's
  // transparent regions sit above any underlay), and the closest() guard
  // keeps every existing control working untouched.
  function onRailClick(e: React.MouseEvent<HTMLElement>) {
    if (!canExpand || expanded) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, [role='menuitem']")) return;
    expand();
  }

  return (
    <aside
      onClick={onRailClick}
      title={canExpand && !expanded ? "Click to expand" : undefined}
      className={`hidden md:flex sticky top-0 z-30 h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-3 transition-[width] duration-200 ease-out ${
        isOpen ? "w-64 items-stretch" : "w-16 items-center"
      } ${canExpand && !expanded ? "cursor-pointer" : ""}`}
      aria-label="Primary sidebar"
    >
      {/* No expand overlay needed — see onRailClick. And per the requirement,
          NO close affordance exists in the collapsed state: the rail itself
          is the way back in. */}

      {/* Header — brand row; the collapse button lives here and is rendered
          ONLY while expanded (the requirement: no close affordance cluttering
          the collapsed rail). */}
      <div
        className={`relative z-10 flex w-full items-center ${
          isOpen ? "gap-1 px-2" : "flex-col"
        }`}
      >
        <BrandMark expanded={isOpen} />
        {isOpen && (
          <button
            onClick={collapse}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className="ml-auto grid size-9 shrink-0 place-items-center text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          >
            <PanelLeftClose className="size-[18px]" />
          </button>
        )}
      </div>

      <div
        className={`mt-2 h-px shrink-0 bg-sidebar-border ${
          isOpen ? "w-full" : "w-8"
        }`}
      />

      <nav
        className={`relative z-10 flex-1 overflow-y-auto py-2 ${
          isOpen ? "w-full px-2" : "flex flex-col items-center gap-1"
        }`}
        aria-label="Primary"
      >
        {sections.map((section: NavSection) => (
          <div
            key={section.label}
            className={isOpen ? "mb-3" : "flex flex-col items-center gap-1"}
          >
            {isOpen && (
              <p className="kicker px-2 pb-1.5 pt-1 text-sidebar-foreground/70">
                {section.label}
              </p>
            )}
            <div className={isOpen ? "space-y-0.5" : "flex flex-col items-center gap-1"}>
              {section.items.map((item) => (
                <RailItem key={item.view} item={item} expanded={isOpen} />
              ))}
            </div>
            {!isOpen && (
              <div className="my-1 h-px w-8 rounded-none bg-sidebar-border/60" />
            )}
          </div>
        ))}
      </nav>

      {/* Bottom cluster — theme + account, above the click-to-open layer */}
      <div className="relative z-10 flex w-full flex-col items-center">
        {isOpen ? (
          <div className="mb-1 flex w-full items-center justify-between px-3">
            <span className="text-sm font-medium text-sidebar-foreground">
              Theme
            </span>
            <ThemeToggle variant="ghost" className="text-sidebar-foreground" />
          </div>
        ) : (
          <ThemeToggle variant="ghost" className="mb-1 text-sidebar-foreground" />
        )}
        <RailUserButton expanded={isOpen} />
      </div>
    </aside>
  );
}

// ---- User button (bottom of rail) -----------------------------------------
function RailUserButton({ expanded }: { expanded: boolean }) {
  const { user, refresh } = useSession();
  const { navigate } = useNav();
  if (!user) return null;
  const role = String(user.role) as Role;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;

  async function logout() {
    // Deliberately NOT apiFetch: logout must proceed to the sign-in view even
    // when the network/endpoint fails — a thrown error would strand the user.
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await refresh();
    navigate("signin");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`transition-colors hover:bg-sidebar-accent ${
            expanded
              ? "flex min-h-12 w-full items-center gap-2.5 px-3 py-2 text-left"
              : "grid size-12 place-items-center"
          }`}
          aria-label="Account menu"
        >
          <Avatar className="size-8 shrink-0 ring-1 ring-foreground/25">
            <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
              {initials(user.firstName, user.lastName)}
            </AvatarFallback>
          </Avatar>
          {expanded && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-sidebar-foreground">
                {name}
              </span>
              <span className="block truncate text-[11px] font-medium text-sidebar-foreground/70">
                {ROLE_LABELS[role]}
              </span>
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={expanded ? "top" : "right"}
        align={expanded ? "start" : "end"}
        className="w-60"
      >
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
          <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">
            {ROLE_LABELS[role]}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
          <LogOut className="mr-2 size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- Mobile drawer (sheet from left) --------------------------------------
export function MobileNav({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user, refresh } = useSession();
  const { view, navigate } = useNav();
  const sections = navForRole(user?.role);

  async function logout() {
    // Same contract as the desktop rail: never let a failed endpoint strand
    // the user — always proceed to the sign-in view.
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await refresh();
    navigate("signin");
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-[280px] flex-col border-r border-border p-0">
        <SheetHeader className="flex h-16 flex-row items-center gap-2.5 border-b border-border px-4 space-y-0">
          <span className="shrink-0 rounded-none bg-transparent p-1 dark:bg-parchment">
            <img src="/MIRDC-mark.png" alt="MIRDC" className="h-10 w-auto object-contain" />
          </span>
          <SheetTitle className="sr-only">RMIS</SheetTitle>
        </SheetHeader>
        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Primary mobile">
          {sections.map((section) => (
            <div key={section.label} className="mb-4">
              <p className="kicker px-2 pb-1.5 pt-1 text-muted-foreground">
                {section.label}
              </p>
              <div className="space-y-1">
                {section.items.map((item) => {
                  const active = view === item.view;
                  const Icon: LucideIcon = item.icon;
                  return (
                    <button
                      key={item.view}
                      onClick={() => {
                        navigate(item.view);
                        onOpenChange(false);
                      }}
                      className={`relative flex min-h-12 w-full items-center gap-2.5 rounded-none px-3 py-2.5 text-sm font-medium transition-colors ${
                        active ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {active && <span aria-hidden className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-none bg-primary-foreground" />}
                      <Icon className={`size-[18px] shrink-0 ${active ? "text-primary-foreground" : "text-muted-foreground"}`} />
                      <span className="truncate">{item.label}</span>
                      {active && <ChevronRight className="ml-auto size-4 shrink-0 text-primary-foreground/70" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ===== Account section — parity with the desktop rail's user button.
             Previously the mobile drawer had NO sign-out affordance, trapping
             mobile users in their session. ===== */}
        {user && (
          <div className="border-t border-border bg-secondary/60 px-2 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center gap-2.5 px-1.5">
              <Avatar className="size-9">
                <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
                  {initials(user.firstName, user.lastName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight text-foreground">
                  {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.username}
                </p>
                <p className="truncate text-[11px] font-medium leading-tight text-muted-foreground">
                  {ROLE_LABELS[String(user.role) as Role]}
                </p>
              </div>
              <ThemeToggle variant="ghost" />
            </div>
            <button
              onClick={logout}
              className="flex min-h-12 w-full items-center gap-2.5 rounded-none px-2.5 py-2 text-sm font-semibold text-danger-ink transition-colors hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-destructive"
            >
              <LogOut className="size-[18px] shrink-0" />
              Sign out
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
