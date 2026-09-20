"use client";

// =============================================================================
// RMIS — Profile View: AI Profile Coach (premium scope)
// An on-demand AI analysis of the applicant's profile. The client builds a
// compact, bounded digest (counts + short title samples — no raw personal
// data beyond entry titles), POSTs it to /api/applicant/profile/ai-feedback,
// and renders the structured coaching result: readiness score, headline,
// three tips, and up to three one-tap actions mapped to section navigation.
// =============================================================================

import { useState } from "react";
import { apiFetch } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/primitives/workspace";
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  CircleAlert,
} from "lucide-react";
import type { Profile, SectionId } from "./types";

type AiFeedback = {
  score: number;
  headline: string;
  tips: string[];
  nextActions: string[];
};

type CoachState = "idle" | "loading" | "done" | "error";

// Fixed action vocabulary — MUST mirror ALLOWED_ACTIONS in the API route.
const ACTION_TARGETS: Record<string, SectionId> = {
  "Complete Personal Information": "personal",
  "Add an Education entry": "education",
  "Add a Work Experience entry": "work",
  "Add a Training entry": "training",
  "Add an Eligibility entry": "eligibility",
  "Add an Award entry": "awards",
  "Upload a supporting document": "documents",
};

// Core personal fields surfaced to the coach (labels only — values never
// leave the client).
const PERSONAL_FIELD_LABELS: Array<[keyof Profile, string]> = [
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["emailAddress", "Email address"],
  ["mobileNumber", "Mobile number"],
  ["birthDate", "Date of birth"],
  ["gender", "Gender"],
  ["civilStatus", "Civil status"],
  ["presentAddress", "Present address"],
  ["city", "City"],
  ["province", "Province"],
];

function buildDigest(profile: Profile, personalFilled: number, personalTotal: number) {
  const missing = PERSONAL_FIELD_LABELS.filter(
    ([k]) => !String(profile[k] ?? "").trim()
  ).map(([, label]) => label);
  const samples = (arr: Array<Record<string, unknown>>, key: string) =>
    arr
      .map((item) => String(item[key] ?? "").trim())
      .filter((v) => v.length > 0)
      .slice(0, 5);
  return {
    personal: {
      filled: personalFilled,
      total: personalTotal,
      missing: missing.slice(0, 12),
    },
    education: {
      count: profile.educations.length,
      samples: samples(profile.educations as unknown as Array<Record<string, unknown>>, "course"),
    },
    work: {
      count: profile.workExperiences.length,
      samples: samples(profile.workExperiences as unknown as Array<Record<string, unknown>>, "positionTitle"),
    },
    training: {
      count: profile.trainings.length,
      samples: samples(profile.trainings as unknown as Array<Record<string, unknown>>, "titleOfTraining"),
    },
    eligibility: {
      count: profile.eligibilities.length,
      samples: samples(profile.eligibilities as unknown as Array<Record<string, unknown>>, "eligibilityTitle"),
    },
    awards: {
      count: profile.awards.length,
      samples: samples(profile.awards as unknown as Array<Record<string, unknown>>, "recognitionDetails"),
    },
    documents: { count: profile.documents.length },
    isProfileComplete: profile.isProfileComplete,
  };
}

export function AiCoachCard({
  profile,
  personalFilled,
  personalTotal,
  onNavigate,
}: {
  profile: Profile;
  /** Core personal fields already filled (counted client-side). */
  personalFilled: number;
  personalTotal: number;
  /** Called when the applicant taps an AI-suggested next action. */
  onNavigate: (section: SectionId) => void;
}) {
  const [state, setState] = useState<CoachState>("idle");
  const [result, setResult] = useState<AiFeedback | null>(null);
  const [error, setError] = useState<string>("");

  async function analyze() {
    setState("loading");
    setError("");
    try {
      const res = await apiFetch<AiFeedback>("/api/applicant/profile/ai-feedback", {
        method: "POST",
        body: JSON.stringify(buildDigest(profile, personalFilled, personalTotal)),
      });
      setResult(res);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI coach is unavailable right now.");
      setState("error");
    }
  }

  const scoreTone =
    result && result.score >= 75
      ? "text-success-ink bg-success/10 border-success/25"
      : result && result.score >= 45
        ? "text-warning-ink bg-warning/10 border-warning/25"
        : "text-danger-ink bg-destructive/10 border-destructive/25";

  return (
    <div className="pui-card relative overflow-hidden p-4">
      {/* Faint aurora wash — the one place the AI identity gets color */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(420px 140px at 100% 0%, color-mix(in oklab, var(--primary) 10%, transparent), transparent 70%)",
        }}
      />
      <div className="relative">
        <div className="flex items-start gap-3">
          <div
            aria-hidden
            className="pui-tile grid size-9 shrink-0 place-items-center bg-gradient-to-br from-primary/20 via-primary/10 to-transparent text-primary ring-1 ring-inset ring-primary/25"
          >
            <Sparkles className="size-4" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold tracking-[-0.01em] text-foreground">
              AI Profile Coach
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {result
                ? result.headline
                : "Get a readiness score and smart tips to strengthen your application."}
            </p>
          </div>
          {result && (
            <span
              className={`pui-chip shrink-0 border px-2 py-1 text-xs font-extrabold tabular-nums ${scoreTone}`}
              aria-label={`AI readiness score: ${result.score} out of 100`}
            >
              {result.score}
            </span>
          )}
        </div>

        {state === "idle" && (
          <Button onClick={() => void analyze()} size="sm" className="mt-3 w-full">
            <Sparkles className="size-3.5" /> Analyze my profile
          </Button>
        )}

        {state === "loading" && (
          <div className="mt-3 space-y-2" aria-live="polite" aria-busy="true">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-primary" />
              Analyzing your profile…
            </div>
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-11/12 rounded-full" />
            <Skeleton className="h-3 w-4/5 rounded-full" />
          </div>
        )}

        {state === "error" && (
          <div className="mt-3">
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-danger-ink">
              <CircleAlert className="mt-px size-3.5 shrink-0" />
              {error}
            </p>
            <Button
              onClick={() => void analyze()}
              variant="outline"
              size="sm"
              className="mt-2 w-full"
            >
              <RotateCcw className="size-3.5" /> Try again
            </Button>
          </div>
        )}

        {state === "done" && result && (
          <div className="mt-3 space-y-3">
            {result.tips.length > 0 && (
              <ul className="space-y-1.5">
                {result.tips.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-xs leading-relaxed text-foreground">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" strokeWidth={2} />
                    <span className="min-w-0">{tip}</span>
                  </li>
                ))}
              </ul>
            )}
            {result.nextActions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Suggested next steps
                </p>
                {result.nextActions.map((action) => {
                  const target = ACTION_TARGETS[action];
                  return (
                    <button
                      key={action}
                      type="button"
                      onClick={() => target && onNavigate(target)}
                      className="group flex w-full items-center justify-between gap-2 rounded-lg border border-border/70 bg-secondary/50 px-3 py-2 text-left text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                    >
                      <span className="min-w-0">{action}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </button>
                  );
                })}
              </div>
            )}
            <Button
              onClick={() => void analyze()}
              variant="ghost"
              size="sm"
              className="h-8 w-full text-muted-foreground"
            >
              <RotateCcw className="size-3" /> Re-analyze
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}