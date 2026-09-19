"use client";

// ============================================================================
// JobDeleteDialog — confirmation for hard-deleting a job posting.
// ----------------------------------------------------------------------------
// Shared by RecruitmentList (row action) and JobWorkspace (header action).
// The server refuses a plain DELETE when the posting has linked applications
// (DELETE /api/jobs/[id] returns 409 + count); the client always shows the
// count-aware warning up-front and confirms with `?scope=all` so the user
// explicitly acknowledges the cascade. Applications carry PDS snapshots —
// the copy makes that loss unmistakable before the destructive call.
// ============================================================================

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import { appCount, type JobRow } from "@/lib/hooks/use-admin-data";
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

export function JobDeleteDialog({
  job,
  open,
  onOpenChange,
  onDeleted,
}: {
  /** Target posting; null renders nothing (also the closed state). */
  job: JobRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Called after a successful delete (parent reloads / navigates away). */
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  if (!job) return null;

  const title = job.title || job.position?.positionTitle || "Untitled Position";
  const count = appCount(job);

  const confirmCopy =
    count != null && count > 0
      ? `This will permanently remove "${title}" and its ${count} linked application${count === 1 ? "" : "s"} — including their PDS snapshots and evaluation history. This action cannot be undone.`
      : `This will permanently remove "${title}" from Recruitment, along with any applications linked to it. This action cannot be undone.`;

  async function confirmDelete() {
    if (!job || deleting) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/jobs/${job.id}?scope=all`, { method: "DELETE" });
      toast.success(`Job posting deleted: ${title}`);
      onOpenChange(false);
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete job posting");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="size-4 shrink-0 text-danger-ink" />
            Delete job posting?
          </AlertDialogTitle>
          <AlertDialogDescription>{confirmCopy}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            className="bg-destructive text-white hover:bg-[#B80525]"
            onClick={(e) => {
              e.preventDefault(); // keep the dialog open while the request runs
              void confirmDelete();
            }}
          >
            {deleting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
