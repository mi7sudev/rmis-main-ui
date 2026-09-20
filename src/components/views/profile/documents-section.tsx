// =============================================================================
// RMIS — Profile View: Documents Section + DocumentRow (premium scope)
// Soft panels on the premium canvas; rounded dashed dropzone
// (border-primary/35 → blue on hover/drag); subtle elevation. STORAGE-ONLY:
// every row is a plain uploaded attachment — no extraction states, no AI
// artifacts.
// ==============================================================================

"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { EmptyState } from "@/components/primitives/workspace";
import { formatDateTime } from "@/lib/client";
import {
  FileStack,
  FileText,
  CloudUpload,
  Trash2,
  Loader2,
} from "lucide-react";
import {
  DocumentItem,
  CATEGORIES,
  CATEGORY_LABEL,
  formatFileSize,
} from "./types";
import { SectionHeader } from "./form-fields";

// Section 7 is STORAGE-ONLY by design: every upload here is kept purely as an
// attachment for HR verification. AI extraction + profile auto-fill is owned
// exclusively by the PDS Upload · Auto-Extraction strip on the profile page.

export function DocumentsSection({
  documents,
  onUpload,
  onDelete,
}: {
  documents: DocumentItem[];
  onUpload: (file: File, category: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  // GOVERNMENT RULE: the category is NOT pre-selected (not even "PDS") — the
  // applicant must explicitly choose it BEFORE any upload (click or drag).
  // Silent defaults filed documents under the wrong category for HR screening.
  const [category, setCategory] = useState("");
  const [categoryMissing, setCategoryMissing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    if (!category) {
      setCategoryMissing(true);
      toast.error("Please select a document category before uploading.");
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        await onUpload(file, category);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Supporting Documents"
        description="Upload certificates, transcripts, COEs, and other attachments — stored for HR verification only. To auto-fill your profile, use the PDS Upload · Auto-Extraction tool above."
        icon={FileStack}
      />

      {/* Upload area */}
      <section className="pui-card space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label className="font-semibold text-foreground">
                <span>
                  Document Category
                  <span className="ml-0.5 text-danger-ink">*</span>
                </span>
              </Label>
              <Select
                value={category || undefined}
                onValueChange={(v) => {
                  setCategory(v);
                  setCategoryMissing(false);
                }}
              >
                <SelectTrigger
                  className={`w-full ${
                    categoryMissing
                      ? "border-destructive focus-visible:ring-destructive"
                      : ""
                  }`}
                >
                  <SelectValue placeholder="Select a category…" />
                </SelectTrigger>
                <SelectContent className="premium max-h-80">
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categoryMissing ? (
                <p className="text-xs font-medium text-danger-ink">
                  Select a document category before uploading.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Choose the category that best describes the document — required before uploading.
                </p>
              )}
            </div>
          </div>
          <div
            role="button"
            tabIndex={0}
            aria-label={uploading ? "Uploading documents" : "Upload documents — click or drop files"}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-xl border-[1.5px] border-dashed p-8 text-center transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              dragging
                ? "border-primary bg-primary/10 ring-2 ring-primary/25"
                : "border-primary/40 bg-card hover:border-primary hover:bg-primary/5"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xlsx,.xls,.xlsm"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Uploading…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary transition-colors">
                  <CloudUpload className="h-7 w-7" strokeWidth={1.6} />
                </div>
                <p className="text-sm font-semibold text-primary">
                  Click to upload or drag &amp; drop
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, PNG, JPG, GIF, WEBP, DOC, DOCX, XLSX, XLS — max 10MB each
                </p>
              </div>
            )}
          </div>
      </section>

      {/* Document list */}
      {documents.length === 0 ? (
        <div className="pui-card p-4 sm:p-6">
          <EmptyState
            title="No documents uploaded yet"
            description="Upload your supporting documents above — these are stored for HR verification. To auto-fill your profile from a PDS or resume, use the PDS Upload · Auto-Extraction tool at the top of the page."
            icon={<FileStack className="h-7 w-7" />}
          />
        </div>
      ) : (
        <div className="pui-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Uploaded Documents
            </h3>
            {selectedIds.size > 0 && (
              <span className="text-xs text-muted-foreground">
                {selectedIds.size} selected
              </span>
            )}
          </div>
          <div className="pui-scroll sm:max-h-[480px] sm:overflow-y-auto p-3 sm:pr-2">
            <div className="space-y-2 pr-1">
              {documents.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  selected={selectedIds.has(doc.id)}
                  onToggle={() => toggleSelect(doc.id)}
                  onDelete={() => onDelete(doc.id)}
                />
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function DocumentRow({
  doc,
  selected,
  onToggle,
  onDelete,
}: {
  doc: DocumentItem;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const isImage = doc.mimeType.startsWith("image/");

  async function handleDelete() {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors ${
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border/70 hover:border-primary/30 hover:bg-secondary/50"
      }`}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => onToggle()}
        className="relative shrink-0 before:absolute before:-inset-2.5 before:content-[''] data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
        aria-label={selected ? "Deselect" : "Select"}
      />

      <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/10">
        {isImage ? (
          <img
            src={`/api/files/${doc.filePath}`}
            alt={doc.originalName}
            className="h-full w-full object-cover"
          />
        ) : (
          <FileText className="h-4 w-4 text-primary" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {doc.originalName}
          </p>
          <span className="pui-chip inline-flex shrink-0 items-center bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {CATEGORY_LABEL[doc.category] || doc.category}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="pui-chip inline-flex items-center border border-border/70 bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            Uploaded
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatFileSize(doc.size)}
          </span>
          <span className="text-[11px] text-muted-foreground">
            • {formatDateTime(doc.createdAt)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={handleDelete}
          disabled={deleting}
          className="size-11 sm:size-8 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-danger-ink"
          title="Delete document"
        >
          {deleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
