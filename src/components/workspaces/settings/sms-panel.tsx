"use client";

// ============================================================================
// SMS Panel — Administration → SMS Gateway
//
// Lets admins:
//   1. See which SMS provider is active (mock / Android gateway / Semaphore),
//      whether it is configured, and what it costs.
//   2. Send a test SMS to any Philippine mobile number.
//   3. Review the last 25 send attempts (the `sms_logs` audit trail).
//
// Providers (set via env, see src/lib/sms.ts):
//   mock     — dev default; every send is logged, nothing leaves the box.
//   android  — self-hosted open-source gateway (sms-gate.app or textbee.dev)
//              on a spare Android phone + office SIM → FREE at scale.
//   semaphore— Philippine SMS API (~₱0.60/SMS) for production deliverability.
//
// Visual register (minimalist restyle): flat bordered bg-card config panels
// with token inks, guide stat tiles (plain foreground figures), and ONE
// bordered bg-card ledger sheet for the send log (hairline rows, quiet row
// index, muted hover tint). No Reveal entrances, no ghost numerals.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatDateTime } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ErrorState } from "@/components/primitives/workspace";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  RefreshCw,
  CheckCircle2,
  XCircle,
  MinusCircle,
  FlaskConical,
  Smartphone,
  CreditCard,
} from "lucide-react";

type ProviderInfo = {
  id: "mock" | "android" | "semaphore";
  label: string;
  configured: boolean;
  cost: string;
  setup: string;
};

type SmsLogRow = {
  id: number;
  to: string;
  message: string;
  provider: string;
  status: string;
  providerRef: string | null;
  error: string | null;
  relatedType: string | null;
  relatedId: number | null;
  createdAt: string;
};

type SmsStatus = {
  provider: ProviderInfo;
  stats: { total: number; sent: number; failed: number; skipped: number; last24h: number };
  logs: SmsLogRow[];
};

const PROVIDER_ICON: Record<ProviderInfo["id"], typeof Smartphone> = {
  mock: FlaskConical,
  android: Smartphone,
  semaphore: CreditCard,
};

export function SmsPanel() {
  const [data, setData] = useState<SmsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await apiFetch<SmsStatus>("/api/admin/sms");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load SMS status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function sendTest() {
    if (!to.trim()) {
      toast.error("Enter a mobile number first");
      return;
    }
    setSending(true);
    try {
      const result = await apiFetch<{ status: string; provider: string; to?: string; error?: string }>(
        "/api/admin/sms",
        {
          method: "POST",
          body: JSON.stringify({ to: to.trim(), message: message.trim() || undefined }),
        }
      );
      if (result.status === "sent") {
        toast.success(`Test SMS sent to ${result.to} via ${result.provider}`);
      } else if (result.status === "mock") {
        toast.info(`Mock provider active — send logged (no real SMS). ${result.to}`);
      } else if (result.status === "skipped") {
        toast.warning("Number could not be normalized — nothing sent");
      } else {
        toast.error(`Send failed: ${result.error ?? "unknown error"}`);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <SmsPanelSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { provider, stats, logs } = data;
  const Icon = PROVIDER_ICON[provider.id] ?? MessageSquare;

  return (
    <div>
      {/* ---- Provider status — a distinct config zone: keeps its own
          bordered panel with token inks (OUTSIDE the ledger sheet) ---- */}
        <section>
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            SMS Gateway
          </p>
          <div className="mt-2 border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <p className="text-sm font-semibold tracking-tight text-foreground">{provider.label}</p>
                <Badge variant={provider.configured ? "default" : "secondary"}>
                  {provider.configured ? "Configured" : "Not configured"}
                </Badge>
                {provider.id === "mock" && <Badge variant="outline">Dev mode</Badge>}
                {provider.id === "android" && provider.configured && (
                  <Badge variant="outline" className="border-success/40 text-success-ink">
                    Free
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{provider.cost}</p>
              {!provider.configured && (
                <p className="mt-2 border border-dashed p-2.5 text-xs text-muted-foreground">
                  {provider.setup}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={load} aria-label="Refresh SMS status">
              <RefreshCw className="size-4" /> Refresh
            </Button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Total sends" value={stats.total} />
            <StatTile label="Sent" value={stats.sent} />
            <StatTile label="Failed" value={stats.failed} />
            <StatTile label="Last 24h" value={stats.last24h} />
          </div>
          </div>
        </section>

      {/* ---- Test send ---- */}
        <section>
          <p className="mt-6 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Test send
          </p>
          <div className="mt-2 border border-border bg-card p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="sms-test-to">Mobile number</Label>
              <Input
                id="sms-test-to"
                inputMode="tel"
                placeholder="09171234567"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">PH format — 09… or +639…</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sms-test-msg">Message (optional)</Label>
              <Textarea
                id="sms-test-msg"
                rows={3}
                placeholder="Defaults to the standard RMIS test message…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={640}
              />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={sendTest} disabled={sending} className="min-w-36">
              {sending ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {sending ? "Sending…" : "Send test SMS"}
            </Button>
          </div>
          </div>
        </section>

      {/* ---- Recent sends — the ledger sheet: ONE bordered bg-card surface
          with hairline rows, quiet row index, muted hover tint. Hairline
          toolbar above carries the section micro-label + N sends count. ---- */}
        <section>
          {/* Hairline toolbar — section micro-label + N sends count */}
          <div className="flex items-baseline justify-between border-b border-border pb-3">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Recent activity
            </p>
            <p className="text-sm font-semibold tabular-nums tracking-tight text-foreground">
              {logs.length} {logs.length === 1 ? "send" : "sends"}
            </p>
          </div>
          <div className="mt-3 overflow-hidden border border-border bg-card">
          {logs.length === 0 ? (
            <p className="flex min-h-[192px] items-center p-6 text-sm text-muted-foreground">
              No SMS has been sent yet. Sends are triggered automatically when an
              application is submitted or its status changes.
            </p>
          ) : (
            <div className="max-h-96 overflow-x-auto overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 pl-4 pr-2">
                      #
                    </TableHead>
                    <TableHead className="w-10" aria-hidden />
                    <TableHead>To</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="hidden sm:table-cell">Provider</TableHead>
                    <TableHead className="hidden md:table-cell">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((row, i) => (
                    <TableRow
                      key={row.id}
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
                        <StatusIcon status={row.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm font-medium tabular-nums text-foreground">
                        {row.to}
                      </TableCell>
                      {/* Wide min-width so the message shows more text at
                          desktop widths; the line keeps truncate + title. */}
                      <TableCell className="min-w-64 max-w-md">
                        <p className="truncate text-sm text-foreground" title={row.message}>
                          {row.message}
                        </p>
                        {row.error && (
                          <p className="truncate text-xs text-destructive" title={row.error}>
                            {row.error}
                          </p>
                        )}
                      </TableCell>
                      {/* flex-wrap: on narrow allocations the #ref drops under
                          the pill instead of squeezing/clipping it. */}
                      <TableCell className="hidden sm:table-cell">
                        <span className="flex w-fit flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <Badge variant="outline">{row.provider}</Badge>
                          {row.relatedType && row.relatedType !== "test" && (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              #{row.relatedId}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-sm tabular-nums text-muted-foreground md:table-cell">
                        {formatDateTime(row.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          </div>
        </section>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  // Guide stat tile: bordered bg-card cell, uppercase micro-label, plain
  // foreground figure — no ghost index, no tone-tinted numerals.
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

function StatusIcon({ status }: { status: string }) {
  if (status === "sent") {
    return <CheckCircle2 className="size-4 text-success" aria-label="sent" />;
  }
  if (status === "failed") {
    return <XCircle className="size-4 text-danger-ink" aria-label="failed" />;
  }
  if (status === "mock") {
    return <FlaskConical className="size-4 text-muted-foreground" aria-label="mock" />;
  }
  return <MinusCircle className="size-4 text-muted-foreground" aria-label="skipped" />;
}

// Mirrors the quiet layout: hairline toolbar (micro-label + count) →
// provider panel → stat tile grid → test-send panel → ledger sheet
// placeholder rows with a leftmost "#" column. Raw bg-muted pulse divs.
function SmsPanelSkeleton() {
  return (
    <div>
      {/* Hairline toolbar skeleton (micro-label + count) */}
      <div className="flex items-baseline justify-between border-b border-border pb-3">
        <div className="h-3.5 w-24 animate-pulse bg-muted" />
        <div className="h-4 w-20 animate-pulse bg-muted" />
      </div>
      <div className="mt-4 border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse bg-muted" />
            <div className="h-3 w-64 animate-pulse bg-muted" />
          </div>
          <div className="h-8 w-24 animate-pulse bg-muted" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="border border-border bg-card p-4">
              <div className="h-2.5 w-16 animate-pulse bg-muted" />
              <div className="mt-2 h-6 w-10 animate-pulse bg-muted" />
            </div>
          ))}
        </div>
      </div>

      {/* Test send skeleton */}
      <div className="mt-6 h-3 w-20 animate-pulse bg-muted" />
      <div className="mt-2 border border-border bg-card p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <div className="h-12 w-full animate-pulse bg-muted" />
          </div>
          <div className="space-y-2">
            <div className="h-24 w-full animate-pulse bg-muted" />
          </div>
        </div>
      </div>

      {/* Recent activity — hairline toolbar + ledger skeleton */}
      <div className="mt-6 flex items-baseline justify-between border-b border-border pb-3">
        <div className="h-3.5 w-28 animate-pulse bg-muted" />
        <div className="h-4 w-16 animate-pulse bg-muted" />
      </div>
      <div className="mt-3 border border-border bg-card">
        <div className="bg-muted/50 px-3 py-2.5">
          <div className="h-3 w-40 animate-pulse bg-muted" />
        </div>
        <div className="divide-y divide-border">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-3">
              <div className="h-3.5 w-6 shrink-0 animate-pulse bg-muted" />
              <div className="size-4 animate-pulse bg-muted" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-3 w-36 animate-pulse bg-muted" />
                <div className="h-3 w-64 animate-pulse bg-muted" />
              </div>
              <div className="hidden h-3 w-24 animate-pulse bg-muted sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
