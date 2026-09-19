"use client";

// ============================================================================
// CreatableCombobox — the "scalable dropdown" used by the job forms.
// ----------------------------------------------------------------------------
// A searchable combobox whose option list never has to be final: a fixed
// "Add new …" action sits below the results, flipping the popover into a
// small inline create form. The parent decides what creation means —
// persisting a new Position master row (POST /api/admin/positions), or
// simply extending a free-text option list (position types, divisions) —
// and resolves with the value that should become selected.
//
// Used by JobFormDialog (recruitment-list) and JobEditDialog (job-workspace)
// for the three scalable fields: Position, Position Type, Division/Department.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ComboOption = {
  value: string;
  label: string;
  /** Secondary line rendered under the label (e.g. an item number). */
  hint?: string | null;
};

type CreatableComboboxProps = {
  id?: string;
  options: ComboOption[];
  /** Current selection; empty string = nothing selected. */
  value: string;
  onSelect: (value: string) => void;
  /**
   * Create a brand-new option from a typed label. Resolve with the value the
   * new option should be selected as, or null to keep the popover open
   * (surfacing the failure via toast is the parent's job).
   */
  onCreate: (label: string) => Promise<string | null>;
  /**
   * Called INSTEAD of onSelect after a successful create — lets parents skip
   * side effects that only make sense when picking an existing option
   * (e.g. syncing qualification fields from a position master row).
   */
  onCreated?: (value: string) => void;
  /** When set, renders a top "clear" item that selects "". */
  noneLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Footer action label, e.g. "Add new position". */
  addLabel?: string;
  /** Heading inside the inline create panel. */
  createTitle?: string;
  createPlaceholder?: string;
  /** Max length enforced on the typed label (mirrors the API column max). */
  maxLength?: number;
  disabled?: boolean;
};

export function CreatableCombobox({
  id,
  options,
  value,
  onSelect,
  onCreate,
  onCreated,
  noneLabel,
  placeholder = "Select an option",
  searchPlaceholder = "Search…",
  addLabel = "Add new option",
  createTitle,
  createPlaceholder = "Type a name…",
  maxLength = 200,
  disabled,
}: CreatableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const draftRef = useRef<HTMLInputElement | null>(null);

  // Selected display: option lookup first; fall back to the raw value so a
  // stored-but-not-listed selection (e.g. editing an old record) still reads.
  const selected = options.find((o) => o.value === value);
  const display = selected ? selected.label : value || "";

  // Seed the create panel with whatever the user had typed in search.
  function startCreating() {
    setDraft(query.trim().slice(0, maxLength));
    setCreating(true);
  }

  async function submitCreate() {
    const label = draft.trim();
    if (!label || busy) return;
    setBusy(true);
    try {
      const created = await onCreate(label);
      if (created != null) {
        setCreating(false);
        setDraft("");
        setQuery("");
        if (onCreated) onCreated(created);
        else onSelect(created);
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  }

  // Focus the create input whenever the create panel appears.
  useEffect(() => {
    if (creating) draftRef.current?.focus();
  }, [creating]);

  function choose(v: string) {
    onSelect(v);
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setCreating(false);
          setQuery("");
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          id={id}
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between px-3 font-normal",
            !display && "text-muted-foreground",
          )}
        >
          <span className="min-w-0 truncate">
            {display || placeholder}
          </span>
          <ChevronDown
            className={cn(
              "ml-2 size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[14rem] p-0"
        // Scroll fix: Radix's modal Dialog locks document scrolling via
        // react-remove-scroll, which preventDefaults ANY wheel/touchmove whose
        // target sits outside the dialog node — including this popover, which
        // Radix portals to <body>. Result: the dropdown's own scrollbar could
        // not be scrolled while the job form dialog was open.
        // Stopping propagation at capture phase keeps the document-level
        // preventDefault from ever firing, so the browser's native wheel
        // scrolling of the CommandList works again (Lenis is bypassed too,
        // which is exactly what we want for an overlay dropdown).
        onWheelCapture={(e) => e.stopPropagation()}
        onTouchMoveCapture={(e) => e.stopPropagation()}
        data-lenis-prevent
      >
        {creating ? (
          /* ---- Inline create panel ---- */
          <div className="p-2">
            {createTitle ? (
              <p className="px-1 pb-2 kicker text-muted-foreground">
                {createTitle}
              </p>
            ) : null}
            <input
              ref={draftRef}
              value={draft}
              maxLength={maxLength}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitCreate();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setCreating(false);
                }
              }}
              placeholder={createPlaceholder}
              className="h-9 w-full border border-input bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCreating(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void submitCreate()}
                disabled={busy || !draft.trim()}
              >
                {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Add
              </Button>
            </div>
          </div>
        ) : (
          /* ---- Search + results + fixed add action ---- */
          <div>
            <Command shouldFilter>
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder={searchPlaceholder}
              />
              <CommandList>
                <CommandEmpty>No match found.</CommandEmpty>
                {noneLabel ? (
                  <CommandItem
                    value="__none__"
                    onSelect={() => choose("")}
                    className="text-muted-foreground"
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      {noneLabel}
                      {!value ? (
                        <Check className="size-4 shrink-0 text-primary" />
                      ) : null}
                    </span>
                  </CommandItem>
                ) : null}
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ""}`}
                    onSelect={() => choose(o.value)}
                  >
                    <span className="flex min-w-0 w-full items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate">{o.label}</span>
                        {o.hint ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {o.hint}
                          </span>
                        ) : null}
                      </span>
                      {o.value === value ? (
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                      ) : null}
                    </span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
            <div className="border-t border-border p-1">
              <button
                type="button"
                onClick={startCreating}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <span className="flex size-5 shrink-0 items-center justify-center border border-dashed border-muted-foreground/50">
                  <Plus className="size-3" />
                </span>
                <span className="min-w-0 truncate">
                  {query.trim() ? (
                    <>
                      Add <span className="font-semibold">&ldquo;{query.trim()}&rdquo;</span>
                    </>
                  ) : (
                    `${addLabel}…`
                  )}
                </span>
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
