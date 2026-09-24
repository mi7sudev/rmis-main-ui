// ============================================================================
// RMIS 2.0 — Navigation configuration
// Organized around the recruitment lifecycle & user work areas, not database
// tables. Drives the global nav rail + command palette.
// ============================================================================

import type { Role } from "@/lib/roles";
import type { View } from "@/components/nav-provider";
import {
  LayoutGrid,
  Briefcase,
  Users,
  BarChart3,
  LineChart,
  Settings,
  Inbox,
  ClipboardCheck,
  Home,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  view: View;
  icon: LucideIcon;
  hint?: string; // short descriptor shown in rail tooltip / command palette
};

export type NavSection = {
  label: string;
  items: NavItem[];
};

// ---- Administrator: operations-focused ------------------------------------
export const ADMIN_NAV: NavSection[] = [
  {
    label: "Operations",
    items: [
      { label: "Command Center", view: "operations", icon: LayoutGrid, hint: "Recruitment status & attention" },
    ],
  },
  {
    label: "Recruitment",
    items: [
      { label: "Jobs", view: "recruitment", icon: Briefcase, hint: "Open positions & postings" },
      { label: "Candidates", view: "candidates", icon: Users, hint: "All applicants" },
      { label: "Review", view: "review-queue", icon: ClipboardCheck, hint: "Review queue & shortlisting" },
    ],
  },
  {
    label: "Insights",
    items: [
      { label: "Analytics", view: "analytics", icon: BarChart3, hint: "Pipeline overview & insights" },
      { label: "Reports", view: "reports", icon: LineChart, hint: "Trends, funnels & audit feed" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Settings", view: "settings", icon: Settings, hint: "Users, audit & notices" },
    ],
  },
];

// ---- Evaluator: review-focused --------------------------------------------
export const EVALUATOR_NAV: NavSection[] = [
  {
    label: "My Work",
    items: [
      { label: "Review Queue", view: "review-queue", icon: Inbox, hint: "Applications to review" },
      { label: "Analytics", view: "analytics", icon: BarChart3, hint: "Pipeline overview & insights" },
    ],
  },
  {
    label: "Browse",
    items: [
      { label: "Candidates", view: "candidates", icon: Users, hint: "Applicant records" },
      { label: "Jobs", view: "recruitment", icon: Briefcase, hint: "Positions & postings" },
    ],
  },
];

// ---- Applicant: portal -----------------------------------------------------
// NOTE: "Positions" is deliberately NOT a sidebar item — the applicant reaches
// the jobs board from the homepage ("View All" on the Open Positions rail and
// the empty-state CTA). The `jobs` VIEW stays routed (deep links + View All
// still work); it just isn't listed in the rail / mobile drawer / palette.
export const APPLICANT_NAV: NavSection[] = [
  {
    label: "Portal",
    items: [
      { label: "Home", view: "home", icon: Home, hint: "Your applications" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Profile", view: "profile", icon: ShieldCheck, hint: "PDS & documents" },
    ],
  },
];

export function navForRole(role: string | undefined | null): NavSection[] {
  const r = String(role);
  if (r === "APPLICANT") return APPLICANT_NAV;
  if (r === "EVALUATOR") return EVALUATOR_NAV;
  if (r === "ADMIN") return ADMIN_NAV;
  return [];
}

// Home view per role (logo click + post-login redirect)
export function homeViewForRole(role: string | undefined | null): View {
  const r = String(role);
  if (r === "APPLICANT") return "home";
  if (r === "EVALUATOR") return "review-queue";
  if (r === "ADMIN") return "operations";
  return "jobs";
}

export const ROLE_LABELS: Record<Role, string> = {
  APPLICANT: "Applicant",
  EVALUATOR: "Evaluator",
  ADMIN: "Administrator",
};

// Flatten all nav items for a role (used by command palette + breadcrumb)
export function flatNav(role: string | undefined | null): NavItem[] {
  return navForRole(role).flatMap((s) => s.items);
}
