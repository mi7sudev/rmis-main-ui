// ============================================================================
// email.ts — provider-agnostic EMAIL sender for RMIS notifications.
//
// Mirrors the design of sms.ts (same contract, same audit story):
//
//   1. "mock" (default, dev) — FREE forever. No external service: every send
//      is logged to the `email_logs` table so the whole flow (shortlist
//      notice included) is testable end-to-end and auditable in the admin
//      Email panel.
//   2. "resend" — production-grade HTTP API. Free tier (100 emails/day),
//      no SDK needed — plain fetch. Set RESEND_API_KEY + (optional)
//      EMAIL_FROM. Perfect fit: shortlist notices are low-volume, so the
//      free tier realistically costs ₱0 for this office.
//
// CONFIG (env vars):
//   EMAIL_PROVIDER=mock|resend
//   # resend:
//   RESEND_API_KEY=<key from resend.com>
//   EMAIL_FROM="DOST-MIRDC Recruitment <recruitment@mirdc.gov.ph>"
//
// Design rules (identical to sms.ts):
//   - sendEmail() NEVER throws — callers fire it after their own success
//     path and a provider outage must never break a status update.
//     Results are always persisted to `email_logs`.
//   - Templates: the SHORTLIST notice is the flagship (rich HTML + text);
//     every other status change gets a simple, honest plain-text notice.
// ============================================================================

import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

export type EmailProviderId = "mock" | "resend";

export type EmailProviderInfo = {
  id: EmailProviderId;
  label: string;
  /** true when the provider's required env vars are present */
  configured: boolean;
  /** cost description for the admin panel */
  cost: string;
  /** one-line setup instructions */
  setup: string;
};

export function getEmailProviderId(): EmailProviderId {
  const v = (process.env.EMAIL_PROVIDER ?? "mock").toLowerCase();
  if (v === "resend" && process.env.RESEND_API_KEY) return "resend";
  return "mock";
}

export function getEmailProviderInfo(): EmailProviderInfo {
  switch (getEmailProviderId()) {
    case "resend":
      return {
        id: "resend",
        label: "Resend (HTTP API)",
        configured: !!process.env.RESEND_API_KEY,
        cost: "Free tier — 100 emails/day, 3,000/month (₱0 at RMIS volume)",
        setup:
          "Sign up at resend.com, verify your sending domain, set RESEND_API_KEY and EMAIL_FROM.",
      };
    default:
      return {
        id: "mock",
        label: "Mock (development)",
        configured: true,
        cost: "Free — emails are logged, not sent",
        setup:
          "Dev default. Set EMAIL_PROVIDER=resend + RESEND_API_KEY to send real email.",
      };
  }
}

const DEFAULT_FROM =
  process.env.EMAIL_FROM ?? "DOST-MIRDC Recruitment <onboarding@resend.dev>";

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type SendEmailInput = {
  to: string | null | undefined;
  subject: string;
  /** plain-text body — always required (email clients + deliverability) */
  text: string;
  /** optional HTML body (inline styles only — no external assets) */
  html?: string;
  /** optional linkage for the audit trail, e.g. { type: "application", id: 12 } */
  related?: { type: string; id: number };
  /**
   * Optional file attachments (base64 content). Only the ACTIVE provider
   * receives the bytes — email_logs persists metadata (name + size) only,
   * never the file content (PII / DB-size discipline).
   */
  attachments?: EmailAttachment[];
};

/** A single email attachment. `content` is base64-encoded file bytes. */
export type EmailAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

export type SendEmailResult = {
  attempted: boolean;
  status: "sent" | "failed" | "mock" | "skipped";
  provider: EmailProviderId;
  providerRef?: string;
  error?: string;
  to?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Fire an email through the active provider. Never throws. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = getEmailProviderId();
  const to = (input.to ?? "").trim();

  // Unreachable/absent address — record the skip so admins can see why an
  // applicant got no email.
  if (!to || !EMAIL_RE.test(to)) {
    await logEmail({
      to: to || "(none)",
      subject: input.subject,
      bodyText: input.text,
      bodyHtml: input.html ?? null,
      provider,
      status: "skipped",
      error: "No valid email address on record",
      relatedType: input.related?.type,
      relatedId: input.related?.id,
      attachmentsMeta: attachmentsMeta(input.attachments),
    }).catch(() => {});
    return { attempted: false, status: "skipped", provider };
  }

  let result: { ok: boolean; ref?: string; error?: string; status: "sent" | "failed" | "mock" };
  try {
    switch (provider) {
      case "resend":
        result = await sendViaResend(
          to,
          input.subject,
          input.text,
          input.html,
          input.attachments
        );
        break;
      default:
        // mock: nothing is delivered — attachment metadata is still logged
        // below so the audit trail shows what WOULD have been sent.
        result = { ok: true, status: "mock", ref: "mock" };
    }
  } catch (e) {
    result = {
      ok: false,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  await logEmail({
    to,
    subject: input.subject,
    bodyText: input.text,
    bodyHtml: input.html ?? null,
    provider,
    status: result.status,
    providerRef: result.ref,
    error: result.error,
    relatedType: input.related?.type,
    relatedId: input.related?.id,
    attachmentsMeta: attachmentsMeta(input.attachments),
  }).catch(() => {});

  return {
    attempted: true,
    status: result.status,
    provider,
    providerRef: result.ref,
    error: result.error,
    to,
  };
}

/** JSON metadata persisted to email_logs.attachments — name + size only. */
function attachmentsMeta(attachments?: EmailAttachment[]): string | null {
  if (!attachments || attachments.length === 0) return null;
  try {
    return JSON.stringify(
      attachments.map((a) => ({
        name: a.filename,
        bytes: Math.floor((a.content.length * 3) / 4),
      }))
    );
  } catch {
    return null;
  }
}

async function logEmail(row: {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  provider: EmailProviderId;
  status: string;
  providerRef?: string;
  error?: string;
  relatedType?: string;
  relatedId?: number;
  attachmentsMeta?: string | null;
}) {
  await db.emailLog.create({
    data: {
      to: row.to,
      subject: row.subject,
      bodyText: row.bodyText,
      bodyHtml: row.bodyHtml,
      provider: row.provider,
      status: row.status,
      providerRef: row.providerRef,
      error: row.error,
      relatedType: row.relatedType,
      relatedId: row.relatedId,
      attachments: row.attachmentsMeta ?? null,
    },
  });
}

// --- Driver: Resend (HTTP API — no SDK) ------------------------------------

async function sendViaResend(
  to: string,
  subject: string,
  text: string,
  html?: string,
  attachments?: EmailAttachment[]
): Promise<{ ok: boolean; ref?: string; error?: string; status: "sent" | "failed" }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, status: "failed", error: "RESEND_API_KEY not set" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      from: DEFAULT_FROM,
      to: [to],
      subject,
      text,
      ...(html ? { html } : {}),
      ...(attachments && attachments.length > 0
        ? {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content: a.content,
              ...(a.contentType ? { content_type: a.contentType } : {}),
            })),
          }
        : {}),
    }),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: "failed",
      error: `resend ${res.status}: ${await safeBody(res)}`,
    };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, status: "sent", ref: data?.id };
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** Shared shell for HTML emails — inline styles only, renders anywhere. */
function htmlShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f2;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f2;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e4e4e0;">
        <tr><td style="background:#000000;padding:20px 28px;">
          <span style="color:#1591DC;font-size:13px;font-weight:bold;letter-spacing:2px;">DOST-MIRDC</span>
          <span style="color:#ffffff;font-size:13px;margin-left:10px;">Recruitment Management &amp; Information System</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#000000;">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #e4e4e0;">
          <p style="margin:0;font-size:11px;line-height:1.6;color:#6b6b69;">
            This is an automated message from the DOST-Metals Industry Research and Development Center
            Recruitment Management &amp; Information System. Please do not reply directly to this email.
            Sign in to RMIS to track your application.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * THE shortlist email — the moment an evaluator shortlists an application,
 * the applicant receives this. It makes the new offline hand-off explicit:
 * succeeding steps happen face-to-face and HR will contact them.
 */
export function emailShortlisted(firstName: string | null, positionTitle: string): {
  subject: string;
  text: string;
  html: string;
} {
  const name = firstName ? firstName : "Applicant";
  const subject = `You have been shortlisted — ${positionTitle} (DOST-MIRDC)`;
  const text = [
    `Hi ${name},`,
    ``,
    `Good news! You have been SHORTLISTED for the position of ${positionTitle} at DOST-MIRDC.`,
    ``,
    `What happens next — face-to-face:`,
    `Succeeding steps of the recruitment process will be conducted in person. Our HR team will contact you through your mobile number and this email address to schedule your visit.`,
    ``,
    `When you come, please bring ORIGINAL copies of your credentials:`,
    `- Educational records (diploma, Transcript of Records)`,
    `- Training certificates`,
    `- Civil Service eligibility / professional license (if applicable)`,
    `- Certificates of employment and other supporting documents`,
    ``,
    `You can track your application status by signing in to RMIS.`,
    ``,
    `— DOST-MIRDC Human Resources (automated notice, do not reply)`,
  ].join("\n");

  const li = (t: string) =>
    `<li style="margin:0 0 6px;color:#000000;font-size:14px;line-height:1.6;">${t}</li>`;
  const html = htmlShell(
    `Congratulations, ${esc(name)} — you&#39;ve been shortlisted!`,
    `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#000000;">
      Your application for the position of
      <strong style="color:#1591DC;">${esc(positionTitle)}</strong>
      at DOST-MIRDC has been <strong>SHORTLISTED</strong> after our initial
      review of your credentials.
    </p>
    <div style="margin:0 0 18px;border-left:3px solid #1591DC;background:#f0f7fc;padding:12px 16px;">
      <p style="margin:0;font-size:14px;line-height:1.7;color:#000000;">
        <strong>What happens next is face-to-face.</strong> Our HR team will
        contact you through your mobile number and this email address to
        schedule your visit.
      </p>
    </div>
    <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#000000;">
      When you come, please bring ORIGINAL copies of:
    </p>
    <ul style="margin:0 0 18px;padding-left:22px;">
      ${li("Educational records (diploma, Transcript of Records)")}
      ${li("Training certificates")}
      ${li("Civil Service eligibility / professional license (if applicable)")}
      ${li("Certificates of employment and other supporting documents")}
    </ul>
    <a href="#" style="display:inline-block;background:#1591DC;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 22px;">
      Sign in to RMIS to track your application
    </a>`
  );

  return { subject, text, html };
}

/**
 * THE under-review email — the moment an evaluator takes an application up for
 * review (the explicit "Review" action), the applicant receives this notice.
 * Honest scope: credentials are being evaluated, no decision has been made,
 * no action is required from the applicant.
 */
export function emailUnderReview(firstName: string | null, positionTitle: string): {
  subject: string;
  text: string;
  html: string;
} {
  const name = firstName ? firstName : "Applicant";
  const subject = `Your application is under review — ${positionTitle} (DOST-MIRDC)`;
  const text = [
    `Hi ${name},`,
    ``,
    `Update on your application for the position of ${positionTitle} at DOST-MIRDC:`,
    ``,
    `Your application is now UNDER REVIEW. Our recruitment team is currently`,
    `evaluating your credentials, background and documents.`,
    ``,
    `What this means for you:`,
    `- No action is needed from you right now.`,
    `- We will notify you of the outcome of the review.`,
    `- If you are shortlisted, you will receive a separate email with the`,
    `  face-to-face next steps (HR will contact you to schedule your visit).`,
    ``,
    `You can track your application status by signing in to RMIS.`,
    ``,
    `— DOST-MIRDC Human Resources (automated notice, do not reply)`,
  ].join("\n");

  const li = (t: string) =>
    `<li style="margin:0 0 6px;color:#000000;font-size:14px;line-height:1.6;">${t}</li>`;
  const html = htmlShell(
    `Your application is under review`,
    `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#000000;">
      Hi ${esc(name)}, your application for the position of
      <strong style="color:#1591DC;">${esc(positionTitle)}</strong>
      at DOST-MIRDC is now <strong>UNDER REVIEW</strong>.
    </p>
    <div style="margin:0 0 18px;border-left:3px solid #1591DC;background:#f0f7fc;padding:12px 16px;">
      <p style="margin:0;font-size:14px;line-height:1.7;color:#000000;">
        Our recruitment team is currently evaluating your credentials,
        background and documents. You will be notified of the outcome.
      </p>
    </div>
    <p style="margin:0 0 8px;font-size:14px;font-weight:bold;color:#000000;">
      What this means for you:
    </p>
    <ul style="margin:0 0 18px;padding-left:22px;">
      ${li("No action is needed from you right now.")}
      ${li("If you are shortlisted, you will receive a separate email with the face-to-face next steps.")}
      ${li("HR will contact you directly to schedule any in-person visit.")}
    </ul>
    <a href="#" style="display:inline-block;background:#1591DC;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 22px;">
      Sign in to RMIS to track your application
    </a>`
  );

  return { subject, text, html };
}

/** Generic status-change notice for every other evaluator/admin decision. */
export function emailStatusChanged(
  firstName: string | null,
  positionTitle: string,
  status: string,
  reason?: string | null
): { subject: string; text: string; html: string } {
  const name = firstName ? firstName : "Applicant";
  const label = status.replace(/_/g, " ").toUpperCase();
  const subject = `Application update — ${positionTitle} (DOST-MIRDC)`;
  const text = [
    `Hi ${name},`,
    ``,
    `The status of your application for ${positionTitle} at DOST-MIRDC is now: ${label}.`,
    reason ? `` : null,
    reason ? `Note from the recruitment team: ${reason}` : null,
    ``,
    `Sign in to RMIS to view the full details of your application.`,
    ``,
    `— DOST-MIRDC Human Resources (automated notice, do not reply)`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const html = htmlShell(
    `Application update`,
    `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#000000;">
      Hi ${esc(name)}, the status of your application for
      <strong>${esc(positionTitle)}</strong> is now:
    </p>
    <p style="margin:0 0 14px;">
      <span style="display:inline-block;background:#1591DC;color:#ffffff;font-size:14px;font-weight:bold;padding:8px 18px;letter-spacing:1px;">${esc(label)}</span>
    </p>
    ${
      reason
        ? `<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#000000;"><strong>Note:</strong> ${esc(reason)}</p>`
        : ""
    }
    <p style="margin:0;font-size:14px;line-height:1.7;color:#000000;">
      Sign in to RMIS to view the full details of your application.
    </p>`
  );

  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// Flow-level helpers (used by API routes) — swallow everything by contract.
// ---------------------------------------------------------------------------

export async function emailApplicationShortlisted(opts: {
  email: string | null | undefined;
  firstName: string | null;
  positionTitle: string;
  applicationId: number;
}): Promise<SendEmailResult> {
  const t = emailShortlisted(opts.firstName, opts.positionTitle);
  return sendEmail({
    to: opts.email,
    subject: t.subject,
    text: t.text,
    html: t.html,
    related: { type: "application", id: opts.applicationId },
  });
}

export async function emailApplicationStatusChanged(opts: {
  email: string | null | undefined;
  firstName: string | null;
  positionTitle: string;
  status: string;
  reason?: string | null;
  applicationId: number;
}): Promise<SendEmailResult> {
  const key = opts.status.trim().replace(/\s+/g, "_").toUpperCase();
  // The shortlist moment gets the flagship template; the explicit review
  // start gets the dedicated under-review notice; everything else is a plain
  // status notice.
  if (key === "SHORTLISTED") {
    return emailApplicationShortlisted({
      email: opts.email,
      firstName: opts.firstName,
      positionTitle: opts.positionTitle,
      applicationId: opts.applicationId,
    });
  }
  if (key === "UNDER_REVIEW") {
    const t = emailUnderReview(opts.firstName, opts.positionTitle);
    return sendEmail({
      to: opts.email,
      subject: t.subject,
      text: t.text,
      html: t.html,
      related: { type: "application", id: opts.applicationId },
    });
  }
  const t = emailStatusChanged(opts.firstName, opts.positionTitle, opts.status, opts.reason);
  return sendEmail({
    to: opts.email,
    subject: t.subject,
    text: t.text,
    html: t.html,
    related: { type: "application", id: opts.applicationId },
  });
}

// ---------------------------------------------------------------------------
// MOM (2026-09-03) recruitment-flow notices — steps 4 & 5.
// The system's involvement ENDS at notification: the regret letter goes to
// declined/not-shortlisted applicants; interview invitations and skills-exam
// notices go to shortlisted applicants. Everything after the send is
// face-to-face and offline — no in-system scheduling or scoring exists.
// Subject prefixes double as dedup keys for bulk sends (see regrets route).
// ---------------------------------------------------------------------------

export type InterviewDetails = {
  /** e.g. "Tuesday, 15 September 2026" — null when HR leaves it blank */
  date: string | null;
  /** e.g. "10:00 AM" — null when HR leaves it blank */
  time: string | null;
  venue: string | null;
  /** optional HR contact line, e.g. "Ms. Ervie / (02) 8123-4567" */
  contact?: string | null;
  /** optional free-text notes shown to the applicant */
  notes?: string | null;
};

/** STEP 4 — the automated regret letter (declined or not shortlisted). */
export function emailRegretLetter(firstName: string | null, positionTitle: string): {
  subject: string;
  text: string;
  html: string;
} {
  const name = firstName ? firstName : "Applicant";
  const subject = `Application regret — ${positionTitle} (DOST-MIRDC)`;
  const text = [
    `Hi ${name},`,
    ``,
    `Thank you for applying for the position of ${positionTitle} at DOST-MIRDC`,
    `and for the time and effort you put into your application.`,
    ``,
    `After a careful review of all applications received, we regret to inform`,
    `you that your application was not shortlisted for this position.`,
    ``,
    `This decision does not diminish your qualifications — competition for`,
    `government positions is often very strong. We encourage you to apply for`,
    `future vacancies that match your credentials.`,
    ``,
    `Sign in to RMIS to view your application record.`,
    ``,
    `— DOST-MIRDC Human Resources (automated notice, do not reply)`,
  ].join("\n");

  const html = htmlShell(
    `Thank you for your application`,
    `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#000000;">
      Hi ${esc(name)}, thank you for applying for the position of
      <strong>${esc(positionTitle)}</strong> at DOST-MIRDC and for the time
      and effort you put into your application.
    </p>
    <div style="margin:0 0 18px;border-left:3px solid #B45309;background:#faf5ef;padding:12px 16px;">
      <p style="margin:0;font-size:14px;line-height:1.7;color:#000000;">
        After a careful review of all applications received, we regret to
        inform you that your application was <strong>not shortlisted</strong>
        for this position.
      </p>
    </div>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#000000;">
      This decision does not diminish your qualifications — competition for
      government positions is often very strong. We encourage you to apply for
      future vacancies that match your credentials.
    </p>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#000000;">
      Sign in to RMIS to view your application record.
    </p>`
  );

  return { subject, text, html };
}

/** STEP 5a — interview invitation (shortlisted applicants). */
export function emailInterviewInvitation(
  firstName: string | null,
  positionTitle: string,
  details: InterviewDetails
): { subject: string; text: string; html: string } {
  const name = firstName ? firstName : "Applicant";
  const subject = `Interview invitation — ${positionTitle} (DOST-MIRDC)`;
  const contactLine = details.contact ? `For questions or rescheduling, contact: ${details.contact}.` : null;
  const text = [
    `Hi ${name},`,
    ``,
    `Congratulations — you have been SHORTLISTED for the position of`,
    `${positionTitle} at DOST-MIRDC. We are pleased to invite you to an interview:`,
    ``,
    `  Date:  ${details.date}`,
    `  Time:  ${details.time}`,
    `  Venue: ${details.venue}`,
    ``,
    `Please bring a valid government-issued ID. You may also be asked to`,
    `present the ORIGINAL copies of your credentials.`,
    contactLine ? `` : null,
    contactLine ? contactLine : null,
    details.notes ? `` : null,
    details.notes ? `Note: ${details.notes}` : null,
    ``,
    `Sign in to RMIS to view your application record.`,
    ``,
    `— DOST-MIRDC Human Resources (automated notice, do not reply)`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const row = (label: string, value: string) =>
    `<tr>` +
    `<td style="padding:4px 14px 4px 0;font-size:14px;color:#6b6b69;white-space:nowrap;vertical-align:top;">${label}</td>` +
    `<td style="padding:4px 0;font-size:14px;font-weight:bold;color:#000000;">${esc(value)}</td>` +
    `</tr>`;
  const html = htmlShell(
    `You're invited to an interview`,
    `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#000000;">
      Hi ${esc(name)} — congratulations! You have been
      <strong style="color:#1591DC;">SHORTLISTED</strong> for the position of
      <strong>${esc(positionTitle)}</strong> at DOST-MIRDC. We are pleased to
      invite you to an interview:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#f0f7fc;border-left:3px solid #1591DC;">
      ${row("Date:", details.date ?? "TBA")}
      ${row("Time:", details.time ?? "TBA")}
      ${row("Venue:", details.venue ?? "TBA")}
    </table>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#000000;">
      Please bring a <strong>valid government-issued ID</strong>. You may also
      be asked to present the <strong>ORIGINAL copies</strong> of your
      credentials.
    </p>
    ${contactLine ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#000000;">${esc(contactLine)}</p>` : ""}
    ${details.notes ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#000000;"><strong>Note:</strong> ${esc(details.notes)}</p>` : ""}
    <p style="margin:0;font-size:14px;line-height:1.7;color:#000000;">
      Sign in to RMIS to view your application record.
    </p>`
  );

  return { subject, text, html };
}

/** STEP 5b — skills-examination notice (shortlisted applicants). */
export function emailSkillsExamNotice(
  firstName: string | null,
  positionTitle: string,
  details: InterviewDetails & { examType?: string | null }
): { subject: string; text: string; html: string } {
  const name = firstName ? firstName : "Applicant";
  const examLabel = details.examType?.trim() || "Skills examination";
  const subject = `Skills examination notice — ${positionTitle} (DOST-MIRDC)`;
  const contactLine = details.contact ? `For questions, contact: ${details.contact}.` : null;
  const text = [
    `Hi ${name},`,
    ``,
    `As part of the selection process for the position of ${positionTitle}`,
    `at DOST-MIRDC, you are scheduled to take a ${examLabel}:`,
    ``,
    `  Date:  ${details.date}`,
    `  Time:  ${details.time}`,
    `  Venue: ${details.venue}`,
    ``,
    `Please bring a valid government-issued ID and a pen. Kindly arrive at`,
    `least 15 minutes before your schedule.`,
    contactLine ? `` : null,
    contactLine ? contactLine : null,
    details.notes ? `` : null,
    details.notes ? `Note: ${details.notes}` : null,
    ``,
    `Sign in to RMIS to view your application record.`,
    ``,
    `— DOST-MIRDC Human Resources (automated notice, do not reply)`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const row = (label: string, value: string) =>
    `<tr>` +
    `<td style="padding:4px 14px 4px 0;font-size:14px;color:#6b6b69;white-space:nowrap;vertical-align:top;">${label}</td>` +
    `<td style="padding:4px 0;font-size:14px;font-weight:bold;color:#000000;">${esc(value)}</td>` +
    `</tr>`;
  const html = htmlShell(
    `Skills examination notice`,
    `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#000000;">
      Hi ${esc(name)} — as part of the selection process for the position of
      <strong>${esc(positionTitle)}</strong> at DOST-MIRDC, you are scheduled
      to take a <strong>${esc(examLabel)}</strong>:
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#f0f7fc;border-left:3px solid #1591DC;">
      ${row("Date:", details.date ?? "TBA")}
      ${row("Time:", details.time ?? "TBA")}
      ${row("Venue:", details.venue ?? "TBA")}
    </table>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#000000;">
      Please bring a <strong>valid government-issued ID and a pen</strong>.
      Kindly arrive at least 15 minutes before your schedule.
    </p>
    ${contactLine ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#000000;">${esc(contactLine)}</p>` : ""}
    ${details.notes ? `<p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#000000;"><strong>Note:</strong> ${esc(details.notes)}</p>` : ""}
    <p style="margin:0;font-size:14px;line-height:1.7;color:#000000;">
      Sign in to RMIS to view your application record.
    </p>`
  );

  return { subject, text, html };
}

// -- Flow-level senders (same swallow-everything contract as above) ---------

/** STEP 4½ — DIRECT EMAIL: free-form follow-up composed by HR/evaluator. */
export function emailDirectMessage(
  firstName: string | null,
  positionTitle: string,
  message: string
): { subject: string; text: string; html: string } {
  const name = firstName ? firstName : "Applicant";
  const subject = `Update on your application — ${positionTitle} (DOST-MIRDC)`;
  const text = [
    `Hi ${name},`,
    ``,
    `Regarding your application for ${positionTitle} at DOST-MIRDC:`,
    ``,
    message,
    ``,
    `— DOST-MIRDC Human Resources`,
  ].join("\n");

  const html = htmlShell(
    `A message from the recruitment team`,
    `
    <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#000000;">
      Hi ${esc(name)} — regarding your application for
      <strong style="color:#1591DC;">${esc(positionTitle)}</strong> at
      DOST-MIRDC:
    </p>
    <div style="margin:0 0 18px;border-left:3px solid #1591DC;background:#f0f7fc;padding:12px 16px;">
      <p style="margin:0;font-size:14px;line-height:1.7;color:#000000;">${esc(
        message
      ).replace(/\n/g, "<br>")}</p>
    </div>
    <p style="margin:0;font-size:14px;line-height:1.7;color:#000000;">
      — DOST-MIRDC Human Resources
    </p>`
  );

  return { subject, text, html };
}

export async function emailApplicationDirectMessage(opts: {
  email: string | null | undefined;
  firstName: string | null;
  positionTitle: string;
  applicationId: number;
  /** HR-written subject; falls back to the standard template subject. */
  subject?: string;
  message: string;
  /** Optional attachments (already validated + base64-encoded by the route). */
  attachments?: EmailAttachment[];
}): Promise<SendEmailResult> {
  const t = emailDirectMessage(opts.firstName, opts.positionTitle, opts.message);
  return sendEmail({
    to: opts.email,
    subject: opts.subject?.trim() ? opts.subject.trim() : t.subject,
    text: opts.subject?.trim() ? `${opts.subject.trim()}\n\n${t.text}` : t.text,
    html: t.html,
    related: { type: "application-direct", id: opts.applicationId },
    attachments: opts.attachments,
  });
}

export async function emailApplicationRegret(opts: {
  email: string | null | undefined;
  firstName: string | null;
  positionTitle: string;
  applicationId: number;
}): Promise<SendEmailResult> {
  const t = emailRegretLetter(opts.firstName, opts.positionTitle);
  return sendEmail({
    to: opts.email,
    subject: t.subject,
    text: t.text,
    html: t.html,
    related: { type: "application", id: opts.applicationId },
  });
}

export async function emailApplicationInterviewInvite(opts: {
  email: string | null | undefined;
  firstName: string | null;
  positionTitle: string;
  applicationId: number;
  details: InterviewDetails;
}): Promise<SendEmailResult> {
  const t = emailInterviewInvitation(opts.firstName, opts.positionTitle, opts.details);
  return sendEmail({
    to: opts.email,
    subject: t.subject,
    text: t.text,
    html: t.html,
    related: { type: "application", id: opts.applicationId },
  });
}

export async function emailApplicationSkillsExam(opts: {
  email: string | null | undefined;
  firstName: string | null;
  positionTitle: string;
  applicationId: number;
  details: InterviewDetails & { examType?: string | null };
}): Promise<SendEmailResult> {
  const t = emailSkillsExamNotice(opts.firstName, opts.positionTitle, opts.details);
  return sendEmail({
    to: opts.email,
    subject: t.subject,
    text: t.text,
    html: t.html,
    related: { type: "application", id: opts.applicationId },
  });
}
