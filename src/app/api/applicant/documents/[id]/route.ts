import { NextRequest } from "next/server";
import { ok, err, handleApi } from "@/lib/api";
import { requireApplicantFromReq, getApplicantIdForUser } from "@/lib/auth";
import { uploadDir } from "@/lib/env";
import { auditLog } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import fs from "fs/promises";
import path from "path";

const UPLOAD_ROOT = uploadDir();

// Filesystem-only document deletion (see route.ts in this folder for the
// full discussion of why document metadata is NOT in the production DB).

export const DELETE = handleApi(async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const user = await requireApplicantFromReq(req);
  const applicantId = await getApplicantIdForUser(parseInt(user.id, 10));
  if (!applicantId) return err("Applicant profile not found", 404);
  const { id } = await params;

  const applicantDir = path.join(UPLOAD_ROOT, String(applicantId));
  const metaPath = path.join(applicantDir, `${id}.meta.json`);
  const metaRaw = await fs.readFile(metaPath, "utf-8").catch(() => null);
  if (!metaRaw) return err("Not found", 404);

  const meta = JSON.parse(metaRaw) as { filePath?: string; fileName?: string; category?: string };
  if (meta.filePath) {
    try {
      await fs.unlink(path.join(process.cwd(), meta.filePath));
    } catch {
      // file already gone — that's fine
    }
  }
  try {
    await fs.unlink(metaPath);
  } catch {
    // ignore
  }

  // Audit: applicant deleted a document
  await auditLog({
    userId: user.id,
    userLabel: user.name ? `${user.name} (${user.email})` : user.email,
    userRole: user.role,
    action: "DOCUMENT_DELETED",
    entityType: "document",
    entityId: id,
    description: `Deleted ${meta.category ?? "document"}: ${meta.fileName ?? id}`,
    ipAddress: getClientIp(req),
  });

  return ok({ deleted: true });
});
