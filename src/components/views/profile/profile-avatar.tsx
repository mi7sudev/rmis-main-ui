"use client";

// =============================================================================
// RMIS — Profile View: ProfileAvatar (square photo/initials avatar block)
// Shows the applicant's profile photo (extracted from the PDS 1×1 or manually
// uploaded) with initials as fallback. Clicking it opens a file picker so the
// applicant can upload a photo when their PDS didn't carry one (or it wasn't
// extracted). Uploads land as a PROFILE_PICTURE document — only the latest
// one displays (replace semantics, enforced server-side).
// =============================================================================

import { useRef, useState } from "react";
import { Camera, Loader2, User } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/client";
import type { DocumentUploadResponse } from "@/lib/wire";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB
const ACCEPTED_PHOTO_MIMES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export function ProfileAvatar({
  photoUrl,
  initials,
  name,
  onPhotoChanged,
}: {
  photoUrl: string | null;
  initials: string;
  name: string;
  /** Called after a successful upload so the parent can refresh documents. */
  onPhotoChanged: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    if (!ACCEPTED_PHOTO_MIMES.includes(file.type)) {
      toast.error("Please choose a PNG, JPG, or WEBP image.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("Image too large (max 5MB).");
      return;
    }
    setUploading(true);
    try {
      // apiFetch skips Content-Type for FormData — browser sets the boundary.
      const fd = new FormData();
      fd.append("file", file);
      fd.append("category", "PROFILE_PICTURE");
      await apiFetch<DocumentUploadResponse>("/api/applicant/documents", {
        method: "POST",
        body: fd,
      });
      toast.success("Profile photo updated.");
      onPhotoChanged();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Failed to upload photo. Please try again."
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={uploading}
      title="Click to upload your profile photo"
      aria-label={`Upload profile photo for ${name}`}
      className={`group relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-[12px] text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-70 sm:size-[72px] ${
        photoUrl
          ? "bg-secondary ring-1 ring-border"
          : "border border-input bg-secondary/60 text-muted-foreground hover:border-primary/50 hover:text-primary"
      }`}
    >
      {uploading ? (
        <Loader2 className="size-5 animate-spin text-primary" />
      ) : photoUrl ? (
        <img
          src={photoUrl}
          alt={`${name} — profile photo`}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        initials || <User className="size-6" strokeWidth={1.5} />
      )}
      {/* Hover affordance — camera overlay hinting the photo is replaceable */}
      {!uploading && (
        <span
          aria-hidden
          className="absolute inset-0 hidden place-items-center bg-black/55 text-white group-hover:grid"
        >
          <Camera className="size-4" strokeWidth={2} />
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </button>
  );
}
