// =============================================================================
// RMIS — Profile View: shared form primitives (Accenture language)
// Mode-aware canvas (light :root / dark .dark token sheets) · electric blue
// #1591DC · royal-gold reserved for kickers. Canonical field stack lives
// here: Label (font-semibold text-sm) + Input/Select + helper (text-xs
// muted) + error (text-danger-ink) — every section inherits it. Sharp 0px
// corners everywhere; zero shadows.
// ==============================================================================

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Sparkles, Pencil, Trash2, Loader2 } from "lucide-react";

// -----------------------------------------------------------------------------
// DocChip — "pre-filled from document" marker (sharp primary-tinted chip)
// -----------------------------------------------------------------------------
function DocChip() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-none border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-info-ink"
      title="This field was pre-filled from an uploaded document. Please verify."
    >
      <Sparkles className="size-2.5" /> Doc
    </span>
  );
}

// -----------------------------------------------------------------------------
// FieldStack — the canonical field wrapper: label + control + helper + error
// -----------------------------------------------------------------------------
function FieldStack({
  label,
  required,
  fromExtraction,
  helper,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  fromExtraction?: boolean;
  helper?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="items-center font-semibold text-foreground">
        <span>
          {label}
          {required && <span className="ml-0.5 text-danger-ink">*</span>}
        </span>
        {fromExtraction && <DocChip />}
      </Label>
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger-ink">{error}</p>
      ) : (
        helper && <p className="text-xs text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// SectionHeader — icon chip + bold sentence-case title (+ optional action)
// -----------------------------------------------------------------------------
export function SectionHeader({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between sm:pb-5">
      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-none bg-primary/10 text-primary sm:size-11">
          <Icon className="size-5" strokeWidth={1.5} />
        </div>
        <div>
          <h2 className="text-xl font-medium tracking-[-0.01em] text-foreground sm:text-2xl">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

// -----------------------------------------------------------------------------
// EntityCard — flat bordered item card (sharp corners, border-hover only)
// -----------------------------------------------------------------------------
export function EntityCard({
  fromExtraction,
  onEdit,
  onDelete,
  rows,
}: {
  fromExtraction?: boolean;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  rows: Array<{ label: string; value: string | null }>;
}) {
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  }
  return (
    <div
      className={`group rounded-none border bg-card p-4 transition-colors duration-200 ${
        fromExtraction ? "border-primary/60" : "border-border hover:border-primary/60"
      }`}
    >
      {fromExtraction && (
        <span className="mb-3 inline-flex items-center gap-1 rounded-none border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-info-ink">
          <Sparkles className="size-3" /> From document — verify
        </span>
      )}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r, idx) => (
          <div
            key={idx}
            className="flex flex-col gap-0.5 py-1 sm:flex-row sm:items-start sm:gap-2"
          >
            <dt className="shrink-0 kicker text-muted-foreground sm:w-28">
              {r.label}
            </dt>
            <dd className="whitespace-pre-line break-words text-sm font-medium text-foreground">
              {r.value || <span className="text-muted-foreground/40">—</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-center justify-end gap-1 border-t border-border pt-3">
        <Button
          onClick={onEdit}
          variant="ghost"
          size="icon"
          className="size-11 sm:size-8 rounded-none text-muted-foreground hover:bg-primary/10 hover:text-primary"
          aria-label="Edit"
        >
          <Pencil className="size-4" strokeWidth={1.5} />
        </Button>
        <Button
          onClick={handleDelete}
          variant="ghost"
          size="icon"
          disabled={deleting}
          className="size-11 sm:size-8 rounded-none text-muted-foreground hover:bg-destructive/10 hover:text-danger-ink"
          aria-label="Delete"
        >
          {deleting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" strokeWidth={1.5} />
          )}
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// FieldWithExtraction — canonical field + blue highlight for extracted values
// -----------------------------------------------------------------------------
export function FieldWithExtraction({
  label,
  value,
  fromExtraction,
  onChange,
  type = "text",
  placeholder,
  required,
  helper,
  error,
}: {
  label: string;
  value: string;
  fromExtraction: boolean;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  helper?: string;
  error?: string;
}) {
  return (
    <FieldStack
      label={label}
      required={required}
      fromExtraction={fromExtraction}
      helper={helper}
      error={error}
    >
      <Input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={fromExtraction ? "border-primary" : undefined}
      />
    </FieldStack>
  );
}

// -----------------------------------------------------------------------------
// FormField — canonical text field
// -----------------------------------------------------------------------------
export function FormField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  disabled,
  className,
  helper,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  helper?: string;
  error?: string;
}) {
  return (
    <div className={className}>
      <FieldStack label={label} required={required} helper={helper} error={error}>
        <Input
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      </FieldStack>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SelectField — canonical select field
// -----------------------------------------------------------------------------
export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  fromExtraction,
  helper,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  fromExtraction?: boolean;
  helper?: string;
  error?: string;
}) {
  return (
    <FieldStack
      label={label}
      fromExtraction={fromExtraction}
      helper={helper}
      error={error}
    >
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger
          className={`w-full ${fromExtraction ? "border-primary" : ""}`}
        >
          <SelectValue placeholder={placeholder || "Select…"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldStack>
  );
}

// -----------------------------------------------------------------------------
// RefInput — compact canonical field (character references)
// -----------------------------------------------------------------------------
export function RefInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label className="font-semibold text-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// StatTile — flat stat tile with square icon block
// -----------------------------------------------------------------------------
export function StatTile({
  label,
  value,
  icon,
  color,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-none border border-border bg-card p-3.5">
      <div className={`grid size-9 shrink-0 place-items-center rounded-none ${bg} ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="stat-numeral text-xl text-foreground">
          {value}
        </div>
        <div className="kicker text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}
