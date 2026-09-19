"use client";

// ============================================================================
// RMIS 2.0 — Settings Workspace
// A separate administration area — NOT mixed into operations.
//
// Layout: settings-style two-column with a left sub-nav (Users & Roles /
// Audit Log / SMS / Email) and a right content panel. Each panel is a clean
// re-implementation of the legacy admin views (admin-users.tsx,
// admin-audit-log.tsx) using the same API contracts but rebuilt on the new
// design system primitives.
//
// Sub-section is controlled by `initial` prop (or `params.tab` for deep-links
// from the Command Center). Values: "users" | "audit" | "sms" | "email".
//
// Visual register (minimalist restyle): quiet compact header, a quiet sub-nav
// tab strip, and flat bordered bg-card sheets with token inks
// (text-foreground / text-muted-foreground), hairline row dividers and the
// primitive's muted row-hover tint. Guide stat tiles carry the audit counts.
// No editorial hero, no Reveal entrances, no ghost numerals, no gold accents.
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNav } from "@/components/nav-provider";
import { useSession } from "@/components/session-provider";
import {
  apiFetch,
  formatDate,
  formatDateTime,
  fullName,
} from "@/lib/client";
import {
  EmptyState,
  ErrorState,
  FilterBar,
} from "@/components/primitives/workspace";
import { humanizeName } from "@/lib/humanize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { SmsPanel } from "@/components/workspaces/settings/sms-panel";
import { EmailPanel } from "@/components/workspaces/settings/email-panel";
import type { Role } from "@/lib/roles";
import type { Paginated } from "@/lib/validation";
import {
  Users,
  UserPlus,
  Search,
  Pencil,
  Power,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  ShieldCheck,
  History,
  LogIn,
  LogOut,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  MessageSquare,
  Mail,
} from "lucide-react";

// =========================================================================
// Section union + normalization
// =========================================================================
type Section = "users" | "audit" | "sms" | "email";

function normalizeSection(value: string | undefined): Section {
  if (!value) return "users";
  const v = value.toLowerCase();
  if (v === "users" || v === "admin-users") return "users";
  // "positions" / "admin-positions" deep-links fall through to Users — the
  // Position records & MQR manager was removed from Settings; position
  // requirements are now owned entirely by the job posting form (Recruitment).
  if (v === "positions" || v === "admin-positions") return "users";
  if (v === "audit" || v === "admin-audit-log") return "audit";
  if (v === "sms" || v === "notifications" || v === "admin-sms") return "sms";
  if (v === "email" || v === "admin-email") return "email";
  return "users";
}

// =========================================================================
// SettingsWorkspace (main export)
// =========================================================================
export function SettingsWorkspace({ initial }: { initial?: string }) {
  const { params, navigate } = useNav();

  // Derive the active section from the URL `params.tab` (deep-link) when
  // present; otherwise fall back to the `initial` prop (legacy view name).
  // Clicking a sub-nav link calls `navigate("settings", { tab: ... })`, which
  // keeps the URL in sync so refresh and back-button work.
  const section = normalizeSection(params.tab ?? initial);

  function go(next: Section) {
    if (next === section) return;
    navigate("settings", { tab: next });
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] 2xl:max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8">
      {/* ===== Compact header — quiet overline + semibold title (guide
          pattern). Sits ABOVE the sub-nav tab strip. ===== */}
      <header className="mb-6 border-b border-border pb-4">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Settings
        </p>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">
          Administration
        </h1>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        {/* LEFT — sub-nav */}
        <nav
          aria-label="Settings sections"
          className="flex flex-col gap-1 lg:sticky lg:top-4 lg:self-start"
        >
          <SubNavLink
            active={section === "users"}
            onClick={() => go("users")}
            icon={<Users className="size-4" />}
            label="Users & Roles"
            hint="Accounts, roles, access"
          />
          <SubNavLink
            active={section === "audit"}
            onClick={() => go("audit")}
            icon={<History className="size-4" />}
            label="Audit Log"
            hint="Activity trail"
          />
          <SubNavLink
            active={section === "sms"}
            onClick={() => go("sms")}
            icon={<MessageSquare className="size-4" />}
            label="SMS Gateway"
            hint="Notifications & test sends"
          />
          <SubNavLink
            active={section === "email"}
            onClick={() => go("email")}
            icon={<Mail className="size-4" />}
            label="Email Notices"
            hint="Shortlist email & outbox"
          />
        </nav>

        {/* RIGHT — active panel (renders plain on tab switch — no entrance
            animation). */}
        <div className="min-w-0">
          {section === "users" && <UsersPanel />}
          {section === "audit" && <AuditPanel />}
          {section === "sms" && <SmsPanel />}
          {section === "email" && <EmailPanel />}
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// Sub-nav link
// =========================================================================
function SubNavLink({
  active,
  onClick,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={[
        "flex min-h-11 items-start gap-3 px-3 py-2.5 text-left transition-colors",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      ].join(" ")}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

// =========================================================================
// USERS PANEL
// =========================================================================
const USERS_PAGE_SIZE = 15;

type UserRow = {
  id: string;
  email: string;
  username: string;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  emailVerified: string | null;
  createdAt: string;
  applicant: { id: string; isProfileComplete: boolean } | null;
};

type RoleFilter = "ALL" | "APPLICANT" | "EVALUATOR" | "ADMIN";
const ROLE_OPTIONS: RoleFilter[] = ["ALL", "APPLICANT", "EVALUATOR", "ADMIN"];

function UsersPanel() {
  const { user: currentUser } = useSession();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter / search state
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<UserRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Debounce search (350ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [roleFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (roleFilter !== "ALL") params.set("role", roleFilter);
      if (search) params.set("q", search);
      params.set("page", String(page));
      params.set("pageSize", String(USERS_PAGE_SIZE));
      const res = await apiFetch<Paginated<UserRow>>(
        `/api/admin/users?${params.toString()}`,
      );
      setUsers(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [roleFilter, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));

  async function handleToggleActive(user: UserRow) {
    setTogglingId(user.id);
    try {
      if (user.isActive) {
        await apiFetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
        toast.success(`${humanizeName(fullName(user) || user.username)} disabled`);
      } else {
        await apiFetch(`/api/admin/users/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: true }),
        });
        toast.success(`${humanizeName(fullName(user) || user.username)} re-enabled`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update user");
    } finally {
      setTogglingId(null);
      setConfirmDisable(null);
    }
  }

  async function handleDelete(user: UserRow) {
    setDeletingId(user.id);
    try {
      await apiFetch(`/api/admin/users/${user.id}?hard=1`, { method: "DELETE" });
      toast.success(`${humanizeName(fullName(user) || user.username)} permanently deleted`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete user");
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  }

  return (
    <div>
      {/* Hairline toolbar — section micro-label + N accounts (left) + Create
          User action (right). border-b + pb-3 gives the hairline rhythm. */}
      <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex items-baseline gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Users &amp; roles
          </p>
          <p className="text-sm font-semibold tabular-nums tracking-tight text-foreground">
            {total} {total === 1 ? "account" : "accounts"}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <UserPlus className="size-4" /> Create User
        </Button>
      </div>

      {/* Filter bar */}
      <FilterBar className="mt-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, email, or username..."
            className="pl-9"
            aria-label="Search users"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(v) => setRoleFilter(v as RoleFilter)}
        >
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by role">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <SelectValue placeholder="Filter by role" />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((r) => (
              <SelectItem key={r} value={r}>
                {r === "ALL"
                  ? "All roles"
                  : r === "ADMIN"
                    ? "Administrators"
                    : r === "EVALUATOR"
                      ? "Evaluators"
                      : "Applicants"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Body */}
      <div className="mt-4">
        {loading ? (
          <UsersTableSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : users.length === 0 ? (
          <div className="border border-dashed border-border bg-card">
            <EmptyState
              icon={<Users className="size-10" />}
              title="No users found"
              description={
                search || roleFilter !== "ALL"
                  ? "Try adjusting your filters or search query."
                  : "Create your first user to get started."
              }
              action={
                !search && roleFilter === "ALL" ? (
                  <Button size="sm" onClick={() => setCreateOpen(true)}>
                    <UserPlus className="size-4" /> Create User
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            {/* Ledger sheet — ONE bordered bg-card surface (token inks,
                hairline row dividers, primitive muted row-hover tint).
                Leftmost "#" column is a quiet row index. */}
            <div className="max-h-[60vh] overflow-auto border border-border bg-card lg:h-[65vh] lg:max-h-[65vh]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 pl-4 pr-2">
                      #
                    </TableHead>
                    <TableHead className="min-w-[200px]">
                      Name
                    </TableHead>
                    <TableHead className="min-w-[220px]">
                      Email
                    </TableHead>
                    <TableHead>
                      Role
                    </TableHead>
                    <TableHead>
                      Status
                    </TableHead>
                    <TableHead className="min-w-[110px]">
                      Created
                    </TableHead>
                    <TableHead className="text-right pr-4">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u, i) => {
                    const canDelete =
                      currentUser?.id !== u.id && u.role !== "ADMIN";
                    return (
                      <TableRow
                        key={u.id}
                        className={!u.isActive ? "opacity-60" : undefined}
                      >
                        <TableCell className="w-12 pl-4 pr-2">
                          <span
                            aria-hidden
                            className="text-xs tabular-nums text-muted-foreground/60"
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">
                              {humanizeName(fullName(u) || u.username)}
                            </span>
                            {!u.isActive && (
                              <span className="text-[10px] font-semibold uppercase text-destructive">
                                Disabled
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-normal break-words">
                          <span className="block text-sm text-muted-foreground">
                            {u.email}
                          </span>
                        </TableCell>
                        <TableCell>
                          <RoleBadge role={u.role} />
                        </TableCell>
                        <TableCell>
                          <UserStatusBadge isActive={u.isActive} />
                        </TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">
                          {formatDate(u.createdAt)}
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditing(u)}
                              className="size-9 text-muted-foreground hover:text-foreground"
                              aria-label={`Edit ${fullName(u) || u.username}`}
                              title="Edit user"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            {u.isActive ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setConfirmDisable(u)}
                                disabled={togglingId === u.id}
                                className="size-9 text-muted-foreground hover:text-destructive"
                                aria-label="Disable user"
                                title="Disable user"
                              >
                                {togglingId === u.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Power className="size-4" />
                                )}
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleToggleActive(u)}
                                disabled={togglingId === u.id}
                                className="size-9 text-muted-foreground hover:text-foreground"
                                aria-label="Enable user"
                                title="Enable user"
                              >
                                {togglingId === u.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Power className="size-4" />
                                )}
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setConfirmDelete(u)}
                                disabled={deletingId === u.id}
                                className="size-9 text-muted-foreground hover:text-destructive"
                                aria-label="Delete user"
                                title="Delete user"
                              >
                                {deletingId === u.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={USERS_PAGE_SIZE}
              label="users"
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {/* Dialogs */}
      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
      />
      <EditUserDialog
        user={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />

      {/* Disable confirm */}
      <AlertDialog
        open={!!confirmDisable}
        onOpenChange={(o) => !o && setConfirmDisable(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable user account?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDisable && (
                <>
                  <span className="font-medium text-foreground">
                    {humanizeName(fullName(confirmDisable) || confirmDisable.username)}
                  </span>{" "}
                  ({confirmDisable.email}) will no longer be able to sign in. You
                  can re-enable the account at any time.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirmDisable && handleToggleActive(confirmDisable)
              }
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {togglingId === confirmDisable?.id ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Disable User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && (
                <>
                  You are about to{" "}
                  <span className="font-semibold text-destructive">
                    permanently delete
                  </span>{" "}
                  <span className="font-medium text-foreground">
                    {humanizeName(fullName(confirmDelete) || confirmDelete.username)}
                  </span>{" "}
                  ({confirmDelete.email}). This cannot be undone. Applicant
                  profile data, applications, and assessments submitted by this
                  person will remain for records compliance.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deletingId === confirmDelete?.id ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : null}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- UsersPanel helpers ----------
function UserStatusBadge({ isActive }: { isActive: boolean }) {
  // Mode-tuned semantic chips: success-ink / danger-ink on their washes.
  return isActive ? (
    <Badge className="gap-1 border-success/40 bg-success/10 text-success-ink hover:bg-success/10">
      <CheckCircle2 className="size-3" /> Active
    </Badge>
  ) : (
    <Badge className="gap-1 border-destructive/40 bg-destructive/10 text-danger-ink hover:bg-destructive/10">
      <XCircle className="size-3" /> Disabled
    </Badge>
  );
}

function RoleBadge({ role }: { role: Role }) {
  // Role pills are DATA (kept per the style guide) but on semantic tokens
  // only: neutral (applicant), primary (evaluator), foreground-on-secondary
  // (administrator) — the gold heritage accent is retired.
  const meta: Record<Role, { label: string; cls: string; dot: string }> = {
    APPLICANT: {
      label: "Applicant",
      cls: "border-border bg-secondary text-muted-foreground",
      dot: "bg-muted-foreground",
    },
    EVALUATOR: {
      label: "Evaluator",
      cls: "border-primary/40 bg-primary/10 text-info-ink",
      dot: "bg-primary",
    },
    ADMIN: {
      label: "Administrator",
      cls: "border-foreground/25 bg-secondary text-foreground",
      dot: "bg-foreground",
    },
  };
  const m = meta[role];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-medium ${m.cls}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function UsersTableSkeleton() {
  // Mirrors the ledger sheet: header band + hairline-parted placeholder rows
  // with a leftmost "#" column. Raw bg-muted pulse divs.
  return (
    <div className="border border-border bg-card">
      <div className="bg-muted/50 px-4 py-3.5">
        <div className="h-3 w-40 animate-pulse bg-muted" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="h-3.5 w-6 shrink-0 animate-pulse bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-44 animate-pulse bg-muted" />
              <div className="h-3 w-56 animate-pulse bg-muted" />
            </div>
            <div className="h-5 w-24 animate-pulse bg-muted" />
            <div className="hidden h-5 w-20 animate-pulse bg-muted sm:block" />
            <div className="hidden h-3 w-20 animate-pulse bg-muted sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Create User Dialog ----------
function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("APPLICANT");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setEmail("");
    setUsername("");
    setPassword("");
    setRole("APPLICANT");
    setFirstName("");
    setLastName("");
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const usernameValid = username.trim().length >= 3;
  const passwordValid = password.length >= 6;
  const formValid = emailValid && usernameValid && passwordValid;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid) {
      toast.error("Please fix the form errors before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          username: username.trim(),
          password,
          role,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
        }),
      });
      toast.success("User created successfully");
      reset();
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Create New User</DialogTitle>
          <DialogDescription>
            Create a new account. An applicant profile is auto-created for the
            APPLICANT role.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={submit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="cu-email" className="text-sm font-medium text-foreground">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cu-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                autoComplete="off"
              />
              {email && !emailValid && (
                <p className="text-xs text-destructive">
                  Enter a valid email address.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="cu-username"
                className="text-sm font-medium text-foreground"
              >
                Username <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cu-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="min. 3 characters"
                required
                autoComplete="off"
              />
              {username && !usernameValid && (
                <p className="text-xs text-destructive">
                  Username must be at least 3 characters.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="cu-password"
                className="text-sm font-medium text-foreground"
              >
                Password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cu-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="min. 6 characters"
                required
                autoComplete="new-password"
              />
              {password && !passwordValid && (
                <p className="text-xs text-destructive">
                  Password must be at least 6 characters.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cu-role" className="text-sm font-medium text-foreground">
                Role <span className="text-destructive">*</span>
              </Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="cu-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="APPLICANT">Applicant</SelectItem>
                  <SelectItem value="EVALUATOR">Evaluator</SelectItem>
                  <SelectItem value="ADMIN">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="cu-first"
                  className="text-sm font-medium text-foreground"
                >
                  First Name
                </Label>
                <Input
                  id="cu-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="cu-last"
                  className="text-sm font-medium text-foreground"
                >
                  Last Name
                </Label>
                <Input
                  id="cu-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!formValid || submitting}>
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create User
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Edit User Dialog ----------
function EditUserDialog({
  user,
  onOpenChange,
  onSaved,
}: {
  user: UserRow | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState<Role>("APPLICANT");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [resetPassword, setResetPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Sync form when user changes
  useEffect(() => {
    if (user) {
      setRole(user.role);
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setEmail(user.email);
      setIsActive(user.isActive);
      setResetPassword(false);
      setPassword("");
    }
  }, [user]);

  const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const passwordValid = !resetPassword || password.length >= 6;
  const formValid = emailValid && passwordValid;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !formValid) {
      toast.error("Please fix the form errors before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        role,
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        isActive,
      };
      // Email only sent if changed.
      if (email && email !== user.email) body.email = email.trim().toLowerCase();
      // Password only sent if resetPassword toggled.
      if (resetPassword && password) body.password = password;
      await apiFetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success("User updated successfully");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit User</DialogTitle>
          <DialogDescription>
            {user && (
              <>
                Update account details for{" "}
                <span className="font-medium text-foreground">
                  {humanizeName(fullName(user) || user.username)}
                </span>
                .
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={submit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="eu-email" className="text-sm font-medium text-foreground">
                Email
              </Label>
              <Input
                id="eu-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
              />
              {email && !emailValid && (
                <p className="text-xs text-destructive">
                  Enter a valid email address.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eu-role" className="text-sm font-medium text-foreground">
                Role
              </Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger id="eu-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="APPLICANT">Applicant</SelectItem>
                  <SelectItem value="EVALUATOR">Evaluator</SelectItem>
                  <SelectItem value="ADMIN">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="eu-first"
                  className="text-sm font-medium text-foreground"
                >
                  First Name
                </Label>
                <Input
                  id="eu-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="eu-last"
                  className="text-sm font-medium text-foreground"
                >
                  Last Name
                </Label>
                <Input
                  id="eu-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between border border-border bg-secondary/60 p-3">
              <div>
                <div className="text-sm font-medium text-foreground">
                  Account Status
                </div>
                <div className="text-xs text-muted-foreground">
                  {isActive ? "User can sign in" : "User is disabled"}
                </div>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            {/* Password reset */}
            <div className="space-y-2 border border-border bg-secondary/60 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">
                    Reset Password
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Set a new password for this user
                  </div>
                </div>
                <Switch checked={resetPassword} onCheckedChange={setResetPassword} />
              </div>
              {resetPassword && (
                <div className="space-y-1.5">
                  <Label
                    htmlFor="eu-password"
                    className="text-sm font-medium text-foreground"
                  >
                    New Password
                  </Label>
                  <Input
                    id="eu-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="min. 6 characters"
                    autoComplete="new-password"
                    required={resetPassword}
                  />
                  {password && !passwordValid && (
                    <p className="text-xs text-destructive">
                      Password must be at least 6 characters.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="pt-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!formValid || submitting}>
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================
// AUDIT LOG PANEL
// =========================================================================
const AUDIT_PAGE_SIZE = 50;

type AuditLogRow = {
  id: number;
  timestamp: string;
  user_id: string | null;
  user_label: string | null;
  user_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  ip_address: string | null;
};

type AuditLogResponse = Paginated<AuditLogRow> & {
  actions: string[];
  summary: {
    totalEvents: number;
    onPage: number;
    topActions: { action: string; count: number }[];
    byRole: { role: string; count: number }[];
  };
};

// ---- Local ACTION_META registry ----
type ActionTone = "success" | "danger" | "info" | "neutral" | "primary" | "warning";

const ACTION_TONE_CLS: Record<ActionTone, { bg: string; text: string }> = {
  success: { bg: "border-success/40 bg-success/10", text: "text-success-ink" },
  danger: { bg: "border-destructive/40 bg-destructive/10", text: "text-danger-ink" },
  info: { bg: "border-info-ink/40 bg-info-ink/10", text: "text-info-ink" },
  neutral: { bg: "border-border bg-secondary", text: "text-muted-foreground" },
  primary: { bg: "border-primary/40 bg-primary/10", text: "text-info-ink" },
  warning: { bg: "border-warning/40 bg-warning/10", text: "text-warning-ink" },
};

const ACTION_META: Record<string, { label: string; tone: ActionTone }> = {
  LOGIN_SUCCESS: { label: "Login", tone: "success" },
  LOGIN_FAILED: { label: "Login Failed", tone: "danger" },
  LOGOUT: { label: "Logout", tone: "neutral" },
  APPLICATION_SUBMITTED: { label: "Applied", tone: "info" },
  APPLICATION_STATUS_CHANGED: { label: "Status Changed", tone: "info" },
  ASSESSMENT_SUBMITTED: { label: "Assessed", tone: "info" },
  JOB_POSTING_CREATED: { label: "Job Created", tone: "primary" },
  JOB_POSTING_UPDATED: { label: "Job Updated", tone: "primary" },
  POSITION_CREATED: { label: "Position Created", tone: "primary" },
  POSITION_UPDATED: { label: "Position Updated", tone: "primary" },
  DOCUMENT_UPLOADED: { label: "Doc Uploaded", tone: "warning" },
  DOCUMENT_DELETED: { label: "Doc Deleted", tone: "danger" },
  PROFILE_UPDATED: { label: "Profile Updated", tone: "info" },
  USER_CREATED: { label: "User Created", tone: "info" },
  USER_UPDATED: { label: "User Updated", tone: "neutral" },
  USER_DISABLED: { label: "User Disabled", tone: "danger" },
  USER_ROLE_CHANGED: { label: "Role Changed", tone: "warning" },
};

function getActionMeta(action: string): { label: string; tone: ActionTone } {
  return (
    ACTION_META[action] ?? {
      label: action
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      tone: "neutral",
    }
  );
}

// audit_logs.user_label is stored as "username (email)" — split it so the
// USER column can stack the name over the email instead of truncating one
// combined line. Falls back to the raw label when the pattern doesn't match.
function splitAuditUserLabel(
  label: string | null,
): { name: string | null; email: string | null } {
  if (!label) return { name: null, email: null };
  const m = label.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (m) return { name: m[1].trim() || label, email: m[2].trim() || null };
  return { name: label, email: null };
}

function AuditPanel() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [summary, setSummary] = useState<AuditLogResponse["summary"] | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(AUDIT_PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (actionFilter !== "ALL") params.set("action", actionFilter);
      const data = await apiFetch<AuditLogResponse>(
        `/api/admin/audit-logs?${params.toString()}`,
      );
      setRows(data.data);
      setTotal(data.total);
      setActions(data.actions);
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [page, search, actionFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));

  return (
    <div>
      {/* Hairline toolbar — section micro-label + N events (left). border-b
          + pb-3 gives the hairline rhythm. The filter bar sits below. */}
      <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex items-baseline gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Audit trail
          </p>
          <p className="text-sm font-semibold tabular-nums tracking-tight text-foreground">
            {total} {total === 1 ? "event" : "events"}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <FilterBar className="mt-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by description, user, or action…"
            className="pl-9"
            aria-label="Search audit log"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          className="shrink-0"
          aria-label="Refresh audit log"
        >
          <RefreshCw className="size-4" /> Refresh
        </Button>
        <Select
          value={actionFilter}
          onValueChange={(v) => {
            setActionFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by action">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {actions.map((a) => (
              <SelectItem key={a} value={a}>
                {getActionMeta(a).label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {/* Summary tiles — guide stat tiles: bordered bg-card cells with an
          uppercase micro-label and a plain foreground figure. */}
      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryTile label="Total events" value={summary.totalEvents} />
          <SummaryTile
            label="Applicant (page)"
            value={
              summary.byRole.find((r) => r.role === "APPLICANT")?.count ?? 0
            }
          />
          <SummaryTile
            label="Evaluator (page)"
            value={
              summary.byRole.find((r) => r.role === "EVALUATOR")?.count ?? 0
            }
          />
          <SummaryTile
            label="Admin (page)"
            value={summary.byRole.find((r) => r.role === "ADMIN")?.count ?? 0}
          />
        </div>
      )}

      {/* Body */}
      <div className="mt-4">
        {loading ? (
          <AuditTableSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : rows.length === 0 ? (
          <div className="border border-dashed border-border bg-card">
            <EmptyState
              icon={<History className="size-10" />}
              title="No audit events found"
              description={
                search || actionFilter !== "ALL"
                  ? "No events match your current filters. Try clearing them."
                  : "No audit events have been recorded yet."
              }
            />
          </div>
        ) : (
          <>
            {/* Ledger sheet — same register as the users/positions tables:
                bordered bg-card surface, quiet row index, primitive muted
                row-hover tint. */}
            <div className="max-h-[60vh] overflow-auto border border-border bg-card lg:h-[65vh] lg:max-h-[65vh]">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 pl-4 pr-2">
                      #
                    </TableHead>
                    <TableHead className="min-w-[150px]">
                      When
                    </TableHead>
                    <TableHead>
                      User
                    </TableHead>
                    <TableHead>
                      Role
                    </TableHead>
                    <TableHead className="min-w-[150px]">
                      Action
                    </TableHead>
                    <TableHead className="min-w-[260px]">
                      Description
                    </TableHead>
                    <TableHead className="min-w-[90px] pr-4">
                      IP Address
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => {
                    const meta = getActionMeta(r.action);
                    const { name: userName, email: userEmail } =
                      splitAuditUserLabel(r.user_label);
                    const actionTone = ACTION_TONE_CLS[meta.tone];
                    const roleTone = r.user_role
                      ? ACTION_TONE_CLS[
                          r.user_role === "ADMIN"
                            ? "primary"
                            : r.user_role === "EVALUATOR"
                              ? "info"
                              : "neutral"
                        ]
                      : null;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="w-12 pl-4 pr-2">
                          <span
                            aria-hidden
                            className="text-xs tabular-nums text-muted-foreground/60"
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                          {formatDateTime(r.timestamp)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-foreground">
                              {userName ? humanizeName(userName) : "—"}
                            </span>
                            {(userEmail || r.user_id) && (
                              <span className="text-xs text-muted-foreground">
                                {userEmail ?? `ID: ${r.user_id}`}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {r.user_role && roleTone ? (
                            <Badge
                              variant="secondary"
                              className={`${roleTone.bg} ${roleTone.text}`}
                            >
                              {r.user_role}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`${actionTone.bg} ${actionTone.text} font-medium`}
                          >
                            {meta.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <span className="block max-w-[420px] text-sm text-foreground">
                            {r.description || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap pr-4 font-mono text-xs tabular-nums text-muted-foreground">
                          {r.ip_address || "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={AUDIT_PAGE_SIZE}
              label="events"
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  // Guide stat tile: bordered bg-card cell, uppercase micro-label, plain
  // foreground figure — no icon chip, no ghost index, no tinted numeral.
  return (
    <div className="border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}

function AuditTableSkeleton() {
  // Mirrors the ledger sheet: header band + hairline-parted placeholder rows
  // with a leftmost "#" column. Raw bg-muted pulse divs.
  return (
    <div className="border border-border bg-card">
      <div className="bg-muted/50 px-4 py-3.5">
        <div className="h-3 w-32 animate-pulse bg-muted" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="h-3.5 w-6 shrink-0 animate-pulse bg-muted" />
            <div className="h-3 w-32 animate-pulse bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-36 animate-pulse bg-muted" />
              <div className="h-3 w-52 animate-pulse bg-muted" />
            </div>
            <div className="hidden h-5 w-24 animate-pulse bg-muted sm:block" />
            <div className="hidden h-3 w-24 animate-pulse bg-muted md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================================================
// Shared pagination footer
// =========================================================================
function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  label,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  label: string;
  onPageChange: (p: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-xs text-muted-foreground">
        Showing{" "}
        <span className="font-medium text-foreground">
          {start}–{end}
        </span>{" "}
        of <span className="font-medium text-foreground">{total}</span> {label}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft className="size-4" /> Previous
        </Button>
        <span className="text-xs tabular-nums text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Next <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
