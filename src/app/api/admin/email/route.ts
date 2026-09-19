import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, handleApi } from "@/lib/api";
import { requireAdminFromReq } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEmailProviderInfo, sendEmail } from "@/lib/email";

// ============================================================================
// GET /api/admin/email — email provider status + recent send log (ADMIN only).
//   → { provider: { id, label, configured, cost, setup },
//       stats: { total, sent, failed, skipped, last24h },
//       logs: EmailLogRow[] }
//
// POST /api/admin/email — send a TEST email through the active provider.
//   body: { to: string, subject?: string, message?: string }
//   → { status, provider, providerRef?, error?, to }
//   Every attempt is persisted to email_logs (relatedType: "test").
//
// The shortlist notices evaluators trigger are logged here too, so the
// "applicant will receive email" guarantee is auditable in dev (mock driver)
// and in production (resend).
// ============================================================================

const testSchema = z.object({
  to: z.string().min(5),
  subject: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
});

export const GET = handleApi(async (req: NextRequest) => {
  await requireAdminFromReq(req);

  const provider = getEmailProviderInfo();

  const logs = await db.emailLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  const [total, sent, failed, skipped] = await Promise.all([
    db.emailLog.count(),
    db.emailLog.count({ where: { status: "sent" } }),
    db.emailLog.count({ where: { status: "failed" } }),
    db.emailLog.count({ where: { status: "skipped" } }),
  ]);
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const last24h = await db.emailLog.count({ where: { createdAt: { gte: since } } });

  return ok({
    provider,
    stats: { total, sent, failed, skipped, last24h },
    logs,
  });
});

export const POST = handleApi(async (req: NextRequest) => {
  await requireAdminFromReq(req);

  const parsed = testSchema.safeParse(await req.json());
  if (!parsed.success) {
    return err("A valid email address is required", 400, parsed.error.flatten());
  }
  const { to, subject, message } = parsed.data;

  const result = await sendEmail({
    to,
    subject:
      subject ??
      "DOST-MIRDC RMIS — test email",
    text:
      message ??
      "This is a test email from the DOST-MIRDC RMIS email gateway. Please disregard.",
    related: { type: "test", id: 0 },
  });

  return ok(result, result.status === "failed" ? 502 : 200);
});
