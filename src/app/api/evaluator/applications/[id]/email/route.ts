import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { ok, err, handleApi } from "@/lib/api";
import { requireEvaluatorFromReq } from "@/lib/auth";
import { auditLog } from "@/lib/audit-log";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  findApplicationApplicantId,
  findApplicationJobId,
  loadJobPostingPosition,
} from "@/lib/applicant-data";
import {
  emailApplicationDirectMessage,
  type EmailAttachment,
} from "@/lib/email";

// ============================================================================
// DIRECT EMAIL — free-form follow-up from the recruitment team (evaluator /
// administrator) to an applicant, composed on the application record.
//
//   GET  /api/evaluator/applications/:id/email
//     → { directEmails: EmailRow[] }  (audit-backed, email_logs)
//
//   POST /api/evaluator/applications/:id/email
//     body: JSON { subject?: string, message: string }
//        or multipart/form-data { subject?, message, attachments?: File[] }
//     → { email: SendEmailResult }
//
// Design rules:
//   • Recipient is ALWAYS resolved from the applicant record server-side —
//     the client can never point RMIS at an arbitrary address (no spam relay).
//   • Related as relatedType "application-direct" so these renders stay
//     cleanly separated from the automated MOM notices (which are matched by
//     subject prefix on relatedType "application").
//   • No stage guard: follow-ups are legitimate at ANY stage (document
//     requests before review, schedule clarifications after shortlisting…).
//   • sendEmail() never throws; a provider outage cannot fail this route's
//     status semantics — the attempt is logged either way.
//   • Per-user rate limit: 20 direct emails / 10 minutes.
//   • Attachments: allowlisted document/image types only, ≤5 MB per file,
//     ≤10 MB total, ≤3 files. Only metadata (name + size) is persisted to
//     email_logs — the bytes go to the active provider only.
// ============================================================================

const directEmailSchema = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  message: z.string().trim().min(1, "Message is required").max(5000),
});

/** Per-user direct-email quota. */
const DIRECT_EMAIL_LIMIT = 20;
const DIRECT_EMAIL_WINDOW_MS = 10 * 60 * 1000;

// --- Attachment policy ------------------------------------------------------

const MAX_FILES = 3;
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per file
const MAX_TOTAL_BYTES = 10 * 1024 * 1024; // 10 MB per email

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt",
  "png", "jpg", "jpeg", "webp",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

/** Flatten paths, drop control chars, cap length (keep the extension). */
function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? "attachment";
  const clean = base.replace(/[\x00-\x1f\x7f]/g, "").trim();
  return (clean.length > 120 ? clean.slice(-120) : clean) || "attachment";
}

/**
 * Validate + encode uploaded attachments to base64 for the email stack.
 * Returns either the encoded list or a human-readable rejection reason.
 */
async function buildAttachments(
  files: File[]
): Promise<{ attachments?: EmailAttachment[]; error?: string }> {
  if (files.length === 0) return { attachments: undefined };

  if (files.length > MAX_FILES) {
    return { error: `Too many attachments — maximum ${MAX_FILES} files per email.` };
  }

  let total = 0;
  const out: EmailAttachment[] = [];
  for (const f of files) {
    const filename = sanitizeFilename(f.name || "attachment");
    const ext = fileExtension(filename);
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return {
        error: `"${filename}" has a file type that is not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}.`,
      };
    }
    if (f.size > MAX_FILE_BYTES) {
      return { error: `"${filename}" is larger than 5 MB.` };
    }
    total += f.size;
    if (total > MAX_TOTAL_BYTES) {
      return { error: "Attachments exceed the 10 MB total limit for one email." };
    }
    const contentType =
      f.type && f.type !== "application/octet-stream" ? f.type : MIME_BY_EXTENSION[ext];
    const bytes = Buffer.from(await f.arrayBuffer());
    out.push({
      filename,
      content: bytes.toString("base64"),
      contentType: contentType ?? MIME_BY_EXTENSION[ext],
    });
  }
  return { attachments: out };
}

export const GET = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  await requireEvaluatorFromReq(req);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return err("Invalid id", 400);

  const rows = await db.emailLog.findMany({
    where: { relatedType: "application-direct", relatedId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      subject: true,
      status: true,
      to: true,
      createdAt: true,
      attachments: true,
    },
  });

  return ok({ directEmails: rows });
});

export const POST = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const user = await requireEvaluatorFromReq(req);
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (isNaN(id)) return err("Invalid id", 400);

  // JSON (text-only, backward compatible) or multipart (with attachments).
  let subjectRaw: unknown;
  let messageRaw: unknown;
  let attachments: EmailAttachment[] | undefined;

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return err("Could not read the submitted form.", 400);
    }
    subjectRaw = form.get("subject") ?? undefined;
    messageRaw = form.get("message");
    const files = form
      .getAll("attachments")
      .filter((v): v is File => v instanceof File && v.size > 0);
    const built = await buildAttachments(files);
    if (built.error) return err(built.error, 400);
    attachments = built.attachments;
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return err("A message is required", 400);
    }
    subjectRaw = (body as { subject?: unknown })?.subject;
    messageRaw = (body as { message?: unknown })?.message;
  }

  const parsed = directEmailSchema.safeParse({
    ...(subjectRaw !== undefined ? { subject: subjectRaw } : {}),
    message: messageRaw,
  });
  if (!parsed.success) {
    return err("A subject (optional) and message are required", 400, parsed.error.flatten());
  }
  const { subject, message } = parsed.data;

  // Abuse guard — free-form sends are the one channel HR controls fully.
  const limit = consumeRateLimit(
    `${user.id}:direct-email`,
    DIRECT_EMAIL_LIMIT,
    DIRECT_EMAIL_WINDOW_MS
  );
  if (!limit.allowed) {
    const mins = Math.ceil((limit.retryAfterMs ?? 0) / 60000);
    return err(`Too many direct emails — try again in ${mins} minute${mins === 1 ? "" : "s"}.`, 429);
  }

  const app = await db.application.findUnique({ where: { id } });
  if (!app) return err("Application not found", 404);

  const applicantId = await findApplicationApplicantId(id);
  const applicant = applicantId != null
    ? await db.applicant.findUnique({
        where: { id: applicantId },
        select: { id: true, firstName: true, emailAddress: true },
      })
    : null;
  if (!applicant) return err("Applicant not found for this application", 404);

  const jobId = await findApplicationJobId(id);
  const position = jobId != null ? await loadJobPostingPosition(jobId) : null;
  const positionTitle =
    position?.positionTitle ??
    (jobId != null
      ? (await db.jobPosting.findUnique({ where: { id: jobId }, select: { briefDescription: true } }))
          ?.briefDescription ?? null
      : null) ??
    `application #${id}`;

  const result = await emailApplicationDirectMessage({
    email: applicant.emailAddress,
    firstName: applicant.firstName,
    positionTitle,
    applicationId: id,
    subject,
    message,
    attachments,
  });

  await auditLog({
    userId: user.id,
    userLabel: user.name ? `${user.name} (${user.email})` : user.email,
    userRole: user.role,
    action: "DIRECT_EMAIL_SENT",
    entityType: "application",
    entityId: id,
    description: `Direct email sent for application ${id} (${positionTitle}) to ${result.to ?? "(no address)"}${attachments?.length ? ` with ${attachments.length} attachment${attachments.length === 1 ? "" : "s"}` : ""} — ${result.status}`,
    ipAddress: getClientIp(req),
  });

  return ok({ email: result }, result.status === "failed" ? 502 : 200);
});
