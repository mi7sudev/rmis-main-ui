// =============================================================================
// RMIS — Profile View: shared form primitives (premium scope)
// Canonical field stack: Label (text-[13px] font-medium) + Input/Select +
// helper (text-xs muted) + error (text-danger-ink). Entity cards are
// title-first (icon tile + heading + meta grid) with a soft hover lift.
// Geometry (radii/shadows) comes from the `.premium` scope in globals.css —
// every section renders inside it, so primitives stay token-driven here.
// ==============================================================================

"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Sparkles, Pencil, Trash2, Loader2, CircleAlert } from "lucide-react";

// -----------------------------------------------------------------------------
// DocChip — "pre-filled from document" marker (AI extraction provenance)
// -----------------------------------------------------------------------------
export function DocChip() {
  return (
    <span
      className="pui-chip inline-flex items-center gap-1 border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-info-ink"
      title="This field was pre-filled from an uploaded document. Please verify."
    >
      <Sparkles className="size-2.5" /> AI
    </span>
  );
}

// -----------------------------------------------------------------------------
// FieldStack — the canonical field wrapper: label + control + hint/helper + error
// Precedence: error (red, actionable) > hint (amber, live guidance — the
// reference form's "150% of Contract Value" slot) > helper (muted context).
// -----------------------------------------------------------------------------
export function FieldStack({
  label,
  required,
  fromExtraction,
  helper,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  fromExtraction?: boolean;
  helper?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Label
          htmlFor={htmlFor}
          className="text-[13px] font-medium leading-tight text-foreground"
        >
          {label}
          {required && <span className="ml-0.5 text-danger-ink/80" aria-hidden>*</span>}
          {required && <span className="sr-only"> (required)</span>}
        </Label>
        {fromExtraction && <DocChip />}
      </div>
      {children}
      {error ? (
        <p className="flex items-start gap-1 text-xs font-medium leading-relaxed text-danger-ink">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-[11px] font-semibold leading-relaxed text-warning-ink">{hint}</p>
      ) : (
        helper && <p className="text-xs text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// SectionHeader — enterprise section head: restrained square icon container,
// 24px semibold title, muted supporting line, action slot on the right.
// No gradient, no accent bar — hierarchy from typography and alignment alone.
// -----------------------------------------------------------------------------
export function SectionHeader({
  title,
  description,
  meta,
  icon: Icon,
  action,
}: {
  title: string;
  description?: string;
  /** Inline time estimate, e.g. "Approx 5 min" — rendered after the title. */
  meta?: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex items-start gap-3.5">
        <div
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-[10px] border border-border bg-card text-primary"
        >
          <Icon className="size-[18px]" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[24px]">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
          {meta && (
            <p className="mt-0.5 text-xs font-medium text-muted-foreground/80">{meta}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// FieldGroupHead — in-dialog group header (reference "fb-head" grammar):
// primary icon + 15px semibold title over a hairline that runs to the edge.
// -----------------------------------------------------------------------------
export function FieldGroupHead({
  title,
  icon: Icon,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="size-5 shrink-0 text-primary" strokeWidth={1.5} />
      <h4 className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
        {title}
      </h4>
      <span aria-hidden className="h-px min-w-6 flex-1 bg-border/80" />
    </div>
  );
}

// -----------------------------------------------------------------------------
// EntityCard — premium list item: icon tile, title-first header, meta grid,
// hover lift, edit/delete footer. `fromExtraction` shows the AI chip.
// -----------------------------------------------------------------------------
export function EntityCard({
  icon: Icon,
  title,
  subtitle,
  rows,
  fromExtraction,
  onEdit,
  onDelete,
}: {
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  subtitle?: string | null;
  rows: Array<{ label: string; value: string | null }>;
  fromExtraction?: boolean;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const visibleRows = rows.filter((r) => (r.value ?? "").trim().length > 0);
  async function handleDelete() {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  }
  return (
    <div
      className={`pui-card pui-card-interactive p-4 sm:p-5 ${
        fromExtraction ? "border-primary/45 ring-1 ring-inset ring-primary/15" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <div
            aria-hidden
            className="pui-tile grid size-9 shrink-0 place-items-center bg-secondary text-muted-foreground"
          >
            <Icon className="size-4" strokeWidth={1.5} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
              {title || "Untitled entry"}
            </h3>
            {fromExtraction && (
              <span
                className="pui-chip inline-flex items-center gap-1 border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-info-ink"
                title="Extracted from your uploaded document — please verify."
              >
                <Sparkles className="size-2.5" /> AI filled
              </span>
            )}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {visibleRows.length > 0 && (
        <dl className="mt-3 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleRows.map((r, idx) => (
            <div key={idx} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground/80">
                {r.label}
              </dt>
              <dd className="whitespace-pre-line break-words text-sm font-medium leading-snug text-foreground">
                {r.value || <span className="text-muted-foreground/40">—</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-3.5 flex items-center justify-end gap-1.5 border-t border-border/60 pt-3">
        <Button
          onClick={onEdit}
          variant="ghost"
          size="sm"
          className="h-9 rounded-md px-3 text-muted-foreground hover:bg-primary/10 hover:text-primary"
        >
          <Pencil className="size-3.5" /> Edit
        </Button>
        <Button
          onClick={handleDelete}
          variant="ghost"
          size="sm"
          disabled={deleting}
          className="h-9 rounded-md px-3 text-muted-foreground hover:bg-destructive/10 hover:text-danger-ink"
          aria-label={`Delete ${title || "entry"}`}
        >
          {deleting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          Delete
        </Button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// FieldWithExtraction — canonical field + AI highlight for extracted values
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
  hint,
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
  hint?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <FieldStack
      label={label}
      required={required}
      fromExtraction={fromExtraction}
      helper={helper}
      hint={hint}
      error={error}
      htmlFor={id}
    >
      <Input
        id={id}
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
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
  hint,
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
  hint?: string;
  error?: string;
}) {
  return (
    <div className={className}>
      <FieldStack
        label={label}
        required={required}
        helper={helper}
        hint={hint}
        error={error}
      >
        <Input
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
        />
      </FieldStack>
    </div>
  );
}

// -----------------------------------------------------------------------------
// SuffixField — input with an in-field unit token (reference "USD ▾" grammar)
// -----------------------------------------------------------------------------
export function SuffixField({
  label,
  suffix,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  disabled,
  helper,
  hint,
  error,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helper?: string;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <FieldStack
      label={label}
      required={required}
      helper={helper}
      hint={hint}
      error={error}
      htmlFor={id}
    >
      <div className="relative">
        <Input
          id={id}
          type={type}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          className="pr-14"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold tracking-wide text-muted-foreground"
        >
          {suffix}
        </span>
      </div>
    </FieldStack>
  );
}

// -----------------------------------------------------------------------------
// TextareaField — canonical multiline field (tinted canvas via premium scope)
// -----------------------------------------------------------------------------
export function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  required,
  disabled,
  rows = 4,
  helper,
  hint,
  error,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  rows?: number;
  helper?: string;
  hint?: string;
  error?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <FieldStack
        label={label}
        required={required}
        helper={helper}
        hint={hint}
        error={error}
        htmlFor={id}
      >
        <Textarea
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={rows}
          aria-invalid={error ? true : undefined}
        />
      </FieldStack>
    </div>
  );
}

// -----------------------------------------------------------------------------
// YesNoField — inline radio pair (reference "Yes / No" grammar). Replaces the
// old pattern of binary questions rendered as dropdown selects: radios show
// both options at a glance — the enterprise-form convention for declarations.
// -----------------------------------------------------------------------------
export function YesNoField({
  label,
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
  name,
  required,
  disabled,
  helper,
  hint,
  error,
  fromExtraction,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  yesLabel?: string;
  noLabel?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  helper?: string;
  hint?: string;
  error?: string;
  fromExtraction?: boolean;
}) {
  const id = useId();
  const options = [
    { val: "No", label: noLabel },
    { val: "Yes", label: yesLabel },
  ];
  return (
    <FieldStack
      label={label}
      required={required}
      fromExtraction={fromExtraction}
      helper={helper}
      hint={hint}
      error={error}
    >
      <RadioGroup
        id={id}
        value={value || "No"}
        onValueChange={onChange}
        disabled={disabled}
        name={name}
        aria-label={label}
        className="flex flex-row items-center gap-6 pt-1"
      >
        {options.map((o) => (
          <Label
            key={o.val}
            htmlFor={`${id}-${o.val}`}
            className="flex cursor-pointer items-center gap-2 text-sm font-normal text-foreground"
          >
            <RadioGroupItem id={`${id}-${o.val}`} value={o.val} />
            {o.label}
          </Label>
        ))}
      </RadioGroup>
    </FieldStack>
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
  hint,
  error,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  fromExtraction?: boolean;
  helper?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <FieldStack
      label={label}
      required={required}
      fromExtraction={fromExtraction}
      helper={helper}
      hint={hint}
      error={error}
    >
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger
          aria-invalid={error ? true : undefined}
          className={`w-full ${fromExtraction ? "border-primary" : ""}`}
        >
          <SelectValue placeholder={placeholder || "Select…"} />
        </SelectTrigger>
        <SelectContent className="premium max-h-80">
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
      <Label className="text-[13px] font-medium text-foreground">{label}</Label>
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
    <div className="pui-card flex items-center gap-3 p-3.5">
      <div className={`pui-tile grid size-9 shrink-0 place-items-center ${bg} ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold tracking-[-0.01em] text-foreground">
          {value}
        </div>
        <div className="text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}