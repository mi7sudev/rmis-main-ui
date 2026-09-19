// ============================================================================
// sms.ts — provider-agnostic SMS sender for RMIS notifications.
//
// ANSWER TO "is there a free SMS sender?": yes — three tiers, all supported
// here behind one interface (switch via the SMS_PROVIDER env var):
//
//   1. "mock" (default, dev)      — FREE forever. No external service: every
//                                    send is logged to the `sms_logs` table
//                                    so the whole flow is testable end-to-end.
//   2. "android" (self-hosted)    — FREE at scale. An open-source Android app
//                                    (SMS Gateway for Android — sms-gate.app,
//                                    or textbee.dev) turns any spare Android
//                                    phone + office SIM into a REST gateway.
//                                    Cost = the SIM's load (₱0 with an
//                                    unlimited-text promo). Best fit for a
//                                    government office that already has a SIM.
//   3. "semaphore" (PH provider)  — PAID per SMS (~₱0.60–0.80, free signup
//                                    credits). Direct connections to Globe/
//                                    Smart — the most reliable deliverability
//                                    for production. Drop-in when ready.
//
// CONFIG (env vars, see .env.example):
//   SMS_PROVIDER=mock|android|semaphore
//   # android (sms-gate.app):
//   SMS_GATEWAY_URL=http://<office-pc-ip>:8080
//   SMS_GATEWAY_API_KEY=<key from the app>
//   # android (textbee.dev mode — optional alternative):
//   SMS_GATEWAY_MODE=textbee
//   SMS_GATEWAY_DEVICE_ID=<device id from textbee dashboard>
//   # semaphore:
//   SEMAPHORE_API_KEY=<key>
//   SEMAPHORE_SENDER_NAME=RMIS        (optional registered sender name)
//
// Design rules:
//   - sendSms() NEVER throws — callers fire it after their own success path
//     and a provider outage must never break an application submission or a
//     status update. Results are always persisted to `sms_logs`.
//   - PH number normalization: 0917… / +63917… / 63917… / 917… → E.164.
// ============================================================================

import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Provider resolution
// ---------------------------------------------------------------------------

export type SmsProviderId = "mock" | "android" | "semaphore";

export type SmsProviderInfo = {
  id: SmsProviderId;
  label: string;
  /** true when the provider's required env vars are present */
  configured: boolean;
  /** free tier description for the admin panel */
  cost: string;
  /** one-line setup instructions */
  setup: string;
};

export function getSmsProviderId(): SmsProviderId {
  const v = (process.env.SMS_PROVIDER ?? "mock").toLowerCase();
  if (v === "android" || v === "semaphore") return v;
  return "mock";
}

export function getSmsProviderInfo(): SmsProviderInfo {
  switch (getSmsProviderId()) {
    case "android":
      return {
        id: "android",
        label: "Android SMS Gateway (self-hosted)",
        configured: androidConfigured(),
        cost: "Free — only the SIM's load (₱0 with unli-text promo)",
        setup:
          "Install the open-source SMS Gateway app (sms-gate.app) on a spare Android phone with the office SIM, then set SMS_GATEWAY_URL + SMS_GATEWAY_API_KEY.",
      };
    case "semaphore":
      return {
        id: "semaphore",
        label: "Semaphore (Philippine SMS API)",
        configured: !!process.env.SEMAPHORE_API_KEY,
        cost: "₱0.60–0.80 per SMS (free signup credits)",
        setup: "Sign up at semaphore.co, get an API key, set SEMAPHORE_API_KEY.",
      };
    default:
      return {
        id: "mock",
        label: "Mock (development)",
        configured: true,
        cost: "Free — messages are logged, not sent",
        setup:
          "Dev default. Set SMS_PROVIDER=android or semaphore to send real SMS.",
      };
  }
}

function androidConfigured(): boolean {
  if (!process.env.SMS_GATEWAY_URL) return false;
  // textbee needs a device id instead of an API key
  if (textbeeMode()) return !!process.env.SMS_GATEWAY_DEVICE_ID;
  return !!process.env.SMS_GATEWAY_API_KEY;
}

function textbeeMode(): boolean {
  return (process.env.SMS_GATEWAY_MODE ?? "").toLowerCase() === "textbee";
}

// ---------------------------------------------------------------------------
// PH mobile normalization — 0917… / +63917… / 63917… / 917… → E.164 + local
// ---------------------------------------------------------------------------

export function normalizePhMobile(
  raw: string | bigint | number | null | undefined
): { e164: string; local: string } | null {
  if (raw === null || raw === undefined) return null;
  let digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return null;
  // 639171234567 → 9171234567 ; +639… arrives as 639…
  if (digits.startsWith("63") && digits.length === 12) digits = digits.slice(2);
  // 9171234567 (missing leading 0)
  if (digits.length === 10 && digits.startsWith("9")) digits = "0" + digits;
  // 917… (7-digit local remainder without area code) — covered above when 10.
  if (digits.length === 12 && digits.startsWith("09"))
    digits = digits.slice(1); // rare double-zero artifacts
  // canonical local: 09171234567 (11 digits)
  if (digits.length !== 11 || !digits.startsWith("0")) return null;
  if (!/^09\d{9}$/.test(digits)) return null;
  return { local: digits, e164: "+63" + digits.slice(1) };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type SendSmsInput = {
  /** raw recipient (bigint from DB, "09…", "+639…") */
  to: string | bigint | number | null | undefined;
  message: string;
  /** optional linkage for the audit trail, e.g. { type: "application", id: 12 } */
  related?: { type: string; id: number };
};

export type SendSmsResult = {
  attempted: boolean;
  status: "sent" | "failed" | "mock" | "skipped";
  provider: SmsProviderId;
  providerRef?: string;
  error?: string;
  /** null when the number could not be normalized (skipped before sending) */
  to?: string;
};

/** Fire an SMS through the active provider. Never throws. */
export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const provider = getSmsProviderId();
  const normalized = normalizePhMobile(input.to);

  // Unreachable/absent number — record the skip so admins can see why
  // an applicant got no SMS.
  if (!normalized) {
    await logSms({
      to: input.to != null ? String(input.to) : "(none)",
      message: input.message,
      provider,
      status: "skipped",
      error: "No valid PH mobile number on record",
      relatedType: input.related?.type,
      relatedId: input.related?.id,
    }).catch(() => {});
    return { attempted: false, status: "skipped", provider };
  }

  let result: { ok: boolean; ref?: string; error?: string; status: "sent" | "failed" | "mock" };
  try {
    switch (provider) {
      case "android":
        result = await sendViaAndroidGateway(normalized.e164, input.message);
        break;
      case "semaphore":
        result = await sendViaSemaphore(normalized.local, input.message);
        break;
      default:
        result = { ok: true, status: "mock", ref: "mock" };
    }
  } catch (e) {
    result = {
      ok: false,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    };
  }

  await logSms({
    to: normalized.local,
    message: input.message,
    provider,
    status: result.status,
    providerRef: result.ref,
    error: result.error,
    relatedType: input.related?.type,
    relatedId: input.related?.id,
  }).catch(() => {});

  return {
    attempted: true,
    status: result.status,
    provider,
    providerRef: result.ref,
    error: result.error,
    to: normalized.local,
  };
}

async function logSms(row: {
  to: string;
  message: string;
  provider: SmsProviderId;
  status: string;
  providerRef?: string;
  error?: string;
  relatedType?: string;
  relatedId?: number;
}) {
  await db.smsLog.create({
    data: {
      to: row.to,
      message: row.message,
      provider: row.provider,
      status: row.status,
      providerRef: row.providerRef,
      error: row.error,
      relatedType: row.relatedType,
      relatedId: row.relatedId,
    },
  });
}

// --- Driver: SMS Gateway for Android (sms-gate.app) / textbee.dev ----------

async function sendViaAndroidGateway(
  e164: string,
  message: string
): Promise<{ ok: boolean; ref?: string; error?: string; status: "sent" | "failed" }> {
  const base = process.env.SMS_GATEWAY_URL?.replace(/\/$/, "");
  if (!base) return { ok: false, status: "failed", error: "SMS_GATEWAY_URL not set" };

  if (textbeeMode()) {
    const deviceId = process.env.SMS_GATEWAY_DEVICE_ID;
    if (!deviceId) return { ok: false, status: "failed", error: "SMS_GATEWAY_DEVICE_ID not set" };
    const res = await fetch(`${base}/api/v1/gateways/${deviceId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.SMS_GATEWAY_API_KEY ?? "" },
      body: JSON.stringify({ message, phoneNumbers: [e164] }),
    });
    if (!res.ok) return { ok: false, status: "failed", error: `textbee ${res.status}: ${await safeBody(res)}` };
    const data = (await res.json().catch(() => ({}))) as { data?: { _id?: string } };
    return { ok: true, status: "sent", ref: data?.data?._id };
  }

  // Default: SMS Gateway for Android (sms-gate.app) REST API
  const key = process.env.SMS_GATEWAY_API_KEY;
  if (!key) return { ok: false, status: "failed", error: "SMS_GATEWAY_API_KEY not set" };
  const res = await fetch(`${base}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `ApiKey ${key}` },
    body: JSON.stringify({ message, phoneNumbers: [e164] }),
  });
  if (!res.ok) return { ok: false, status: "failed", error: `gateway ${res.status}: ${await safeBody(res)}` };
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, status: "sent", ref: data?.id };
}

// --- Driver: Semaphore (Philippine SMS provider) ---------------------------

async function sendViaSemaphore(
  localNumber: string,
  message: string
): Promise<{ ok: boolean; ref?: string; error?: string; status: "sent" | "failed" }> {
  const apikey = process.env.SEMAPHORE_API_KEY;
  if (!apikey) return { ok: false, status: "failed", error: "SEMAPHORE_API_KEY not set" };
  const body: Record<string, string> = { apikey, number: localNumber, message };
  const sender = process.env.SEMAPHORE_SENDER_NAME;
  if (sender) body.sendername = sender;
  const res = await fetch("https://api.semaphore.co/api/v4/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: "failed", error: `semaphore ${res.status}: ${await safeBody(res)}` };
  const data = (await res.json().catch(() => [])) as { message_id?: string; status?: string }[];
  const first = Array.isArray(data) ? data[0] : undefined;
  if (first?.status && /failed|error/i.test(first.status)) {
    return { ok: false, status: "failed", error: first.status, ref: first.message_id };
  }
  return { ok: true, status: "sent", ref: first?.message_id };
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Notification templates (kept ≤ 2 GSM-7 segments where possible)
// ---------------------------------------------------------------------------

export function smsApplicationReceived(firstName: string | null, positionTitle: string): string {
  const name = firstName ? `Hi ${firstName}` : "Hi";
  return (
    `DOST-MIRDC Recruitment: ${name}, your application for ${positionTitle} has been received. ` +
    `Track its status by signing in to RMIS. This is an automated message — do not reply.`
  );
}

export function smsStatusChanged(
  firstName: string | null,
  positionTitle: string,
  status: string,
  reason?: string | null
): string {
  const name = firstName ? `Hi ${firstName}` : "Hi";
  const base =
    `DOST-MIRDC Recruitment: ${name}, the status of your application for ${positionTitle} ` +
    `is now ${status.toUpperCase()}.`;
  const reasonLine = reason ? ` Note: ${reason}` : "";
  const tail = ` Sign in to RMIS for details. This is an automated message — do not reply.`;
  return (base + reasonLine + tail).slice(0, 640);
}

// ---------------------------------------------------------------------------
// Flow-level helpers (used by API routes) — swallow everything by contract.
// ---------------------------------------------------------------------------

export async function notifyApplicationSubmitted(opts: {
  mobile: string | bigint | number | null | undefined;
  firstName: string | null;
  positionTitle: string;
  applicationId: number;
}): Promise<SendSmsResult> {
  return sendSms({
    to: opts.mobile,
    message: smsApplicationReceived(opts.firstName, opts.positionTitle),
    related: { type: "application", id: opts.applicationId },
  });
}

export async function notifyApplicationStatusChanged(opts: {
  mobile: string | bigint | number | null | undefined;
  firstName: string | null;
  positionTitle: string;
  status: string;
  reason?: string | null;
  applicationId: number;
}): Promise<SendSmsResult> {
  return sendSms({
    to: opts.mobile,
    message: smsStatusChanged(opts.firstName, opts.positionTitle, opts.status, opts.reason),
    related: { type: "application", id: opts.applicationId },
  });
}
