import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq } from "@/lib/auth";
import ZAI from "z-ai-web-dev-sdk";

// =============================================================================
// POST /api/applicant/profile/ai-feedback — AI PROFILE COACH
// The applicant portal sends a compact, bounded digest of the profile's fill
// state (counts + short title samples). The server validates it, asks the LLM
// for a structured coaching response, and returns strict JSON:
//   { score, headline, tips[3], nextActions[3] }
// `nextActions` are constrained to a FIXED vocabulary so the client can map
// them to one-tap navigation targets. No profile data is stored by this route.
// =============================================================================

// Fixed vocabulary the LLM must pick nextActions from (client maps these to
// section navigation — free-form actions would be unactionable).
const ALLOWED_ACTIONS = [
  "Complete Personal Information",
  "Add an Education entry",
  "Add a Work Experience entry",
  "Add a Training entry",
  "Add an Eligibility entry",
  "Add an Award entry",
  "Upload a supporting document",
] as const;

const sectionDigest = z.object({
  count: z.number().int().min(0).max(50),
  samples: z.array(z.string().max(90)).max(5).default([]),
});

const digestSchema = z.object({
  personal: z.object({
    filled: z.number().int().min(0).max(30),
    total: z.number().int().min(0).max(30),
    missing: z.array(z.string().max(40)).max(12),
  }),
  education: sectionDigest,
  work: sectionDigest,
  training: sectionDigest,
  eligibility: sectionDigest,
  awards: sectionDigest,
  documents: z.object({ count: z.number().int().min(0).max(100) }),
  isProfileComplete: z.boolean(),
});

type AiFeedback = {
  score: number;
  headline: string;
  tips: string[];
  nextActions: string[];
};

// Tolerant JSON extraction — LLMs occasionally wrap JSON in ```fences or
// prefix it with prose; find the first {...} block and parse that.
function extractJson(raw: string): AiFeedback | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Per-applicant throttle (in-memory, single-process dev deployment) — the
// coach is an on-demand analysis, not an ambient call; 1 request / 20s is
// generous for humans and harsh on scripts.
const THROTTLE_MS = 20_000;
const lastCallAt = new Map<string, number>();

export const POST = handleApi(async (req: NextRequest) => {
  const user = await requireApplicantFromReq(req);
  const applicantKey = user.id;

  const now = Date.now();
  const last = lastCallAt.get(applicantKey) ?? 0;
  if (now - last < THROTTLE_MS) {
    return err("The AI coach is warming up — try again in a few seconds.", 429);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err("Invalid request body", 400);
  }
  const parsed = digestSchema.safeParse(body);
  if (!parsed.success) {
    return err("Invalid profile digest", 400);
  }
  const d = parsed.data;

  lastCallAt.set(applicantKey, now);

  const system = [
    "You are the RMIS Career Coach — an AI assistant inside a Philippine government recruitment portal (DOST-MIRDC).",
    "You analyze an applicant's profile completeness digest and coach them to strengthen it for job applications.",
    "Rules:",
    "- Reply with STRICT JSON only — no prose, no markdown fences.",
    '- Shape: {"score": <integer 0-100>, "headline": <one encouraging sentence, max 90 chars>, "tips": [<exactly 3 strings, each max 140 chars>], "nextActions": [<exactly 3 strings, each max 60 chars>]}',
    `- Every nextActions item MUST be verbatim from this list: ${JSON.stringify(ALLOWED_ACTIONS)}.`,
    "- score: your honest assessment of application-readiness (completeness + quality signals), not a copy of the completion percentage.",
    "- Be specific (reference their actual entries when relevant), professional, warm — never condescending.",
    "- If the profile is already strong, say so and suggest polish (e.g. details, documents).",
  ].join("\n");

  const userPrompt = [
    "Profile digest:",
    `- Personal Information: ${d.personal.filled}/${d.personal.total} core fields filled${d.personal.missing.length ? `; missing: ${d.personal.missing.join(", ")}` : ""}`,
    `- Education: ${d.education.count} entr${d.education.count === 1 ? "y" : "ies"}${d.education.samples.length ? ` (${d.education.samples.join("; ")})` : ""}`,
    `- Work Experience: ${d.work.count} entr${d.work.count === 1 ? "y" : "ies"}${d.work.samples.length ? ` (${d.work.samples.join("; ")})` : ""}`,
    `- Training: ${d.training.count} entr${d.training.count === 1 ? "y" : "ies"}${d.training.samples.length ? ` (${d.training.samples.join("; ")})` : ""}`,
    `- Eligibility: ${d.eligibility.count} entr${d.eligibility.count === 1 ? "y" : "ies"}${d.eligibility.samples.length ? ` (${d.eligibility.samples.join("; ")})` : ""}`,
    `- Awards: ${d.awards.count} entr${d.awards.count === 1 ? "y" : "ies"}${d.awards.samples.length ? ` (${d.awards.samples.join("; ")})` : ""}`,
    `- Supporting Documents: ${d.documents.count} uploaded`,
    `- Marked complete: ${d.isProfileComplete ? "yes" : "no"}`,
  ].join("\n");

  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: system },
        { role: "user", content: userPrompt },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const feedback = extractJson(raw);
    if (!feedback || typeof feedback.score !== "number" || !Array.isArray(feedback.tips)) {
      console.error("[AI-COACH] Unparseable LLM response:", raw.slice(0, 400));
      return err("The AI coach could not analyze your profile right now. Please try again.", 502);
    }
    // Sanitize: clamp score, cap arrays, drop any action outside the fixed
    // vocabulary (a hallucinated action would render a dead button).
    const safeActions = (Array.isArray(feedback.nextActions) ? feedback.nextActions : [])
      .filter((a): a is string => typeof a === "string")
      .map((a) => (ALLOWED_ACTIONS as readonly string[]).find((v) => v === a))
      .filter((v): v is string => !!v)
      .slice(0, 3);
    const safeTips = (Array.isArray(feedback.tips) ? feedback.tips : [])
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .slice(0, 3);
    return ok({
      score: Math.max(0, Math.min(100, Math.round(feedback.score))),
      headline: typeof feedback.headline === "string" && feedback.headline.trim()
        ? feedback.headline.trim().slice(0, 120)
        : "Here's how to strengthen your profile.",
      tips: safeTips,
      nextActions: safeActions,
    });
  } catch (e) {
    console.error("[AI-COACH] LLM call failed:", e instanceof Error ? e.message : e);
    return err("The AI coach is unavailable right now. Please try again later.", 502);
  }
});