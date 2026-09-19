import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, err, handleApi } from "@/lib/api";
import { requireAdminFromReq } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getSmsProviderInfo,
  sendSms,
  normalizePhMobile,
} from "@/lib/sms";

// ============================================================================
// GET /api/admin/sms — SMS gateway status + recent send log (ADMIN only).
//   → { provider: { id, label, configured, cost, setup },
//       stats: { total, sent, failed, skipped, last24h },
//       logs: SmsLogRow[] }
//
// POST /api/admin/sms — send a TEST sms through the active provider.
//   body: { to: string, message?: string }
//   → { status, provider, providerRef?, error?, to }
//   Every attempt is persisted to sms_logs (relatedType: "test").
// ============================================================================

const testSchema = z.object({
  to: z.string().min(7),
  message: z.string().max(640).optional(),
});

export const GET = handleApi(async (req: NextRequest) => {
  await requireAdminFromReq(req);

  const provider = getSmsProviderInfo();

  const logs = await db.smsLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  const [total, sent, failed, skipped] = await Promise.all([
    db.smsLog.count(),
    db.smsLog.count({ where: { status: "sent" } }),
    db.smsLog.count({ where: { status: "failed" } }),
    db.smsLog.count({ where: { status: "skipped" } }),
  ]);
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const last24h = await db.smsLog.count({ where: { createdAt: { gte: since } } });

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
    return err("A valid mobile number is required", 400, parsed.error.flatten());
  }
  const { to, message } = parsed.data;

  const normalized = normalizePhMobile(to);
  if (!normalized) {
    return err(
      "Not a valid Philippine mobile number. Use 09XXXXXXXXX or +639XXXXXXXXX.",
      400
    );
  }

  const result = await sendSms({
    to,
    message:
      message ??
      "DOST-MIRDC RMIS: This is a test message from the SMS gateway. Please disregard.",
    related: { type: "test", id: 0 },
  });

  return ok(result, result.status === "failed" ? 502 : 200);
});
