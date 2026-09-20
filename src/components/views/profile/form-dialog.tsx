"use client";

// =============================================================================
// RMIS — Profile View: ResponsiveFormDialog (premium scope)
// One form surface, two idioms:
//   · ≥ md  → centered floating Dialog (rounded-2xl, ambient shadow)
//   · < md  → vaul bottom sheet (drag to dismiss, thumb-reachable footer)
// The wrapper owns the UNSAVED-CHANGES GUARD: when `dirty` is true, any
// user-initiated close (overlay tap, Esc, drag-down, Cancel) is intercepted
// and a confirmation is shown instead — "Keep editing" / "Discard changes".
// Successful submits close through the parent's own setOpen(false) and are
// never intercepted.
//
// Portals render outside the .premium subtree, so every portal root here
// carries the `premium` class itself — that's what re-rounds dialogs,
// sheets, selects and buttons inside the form.
// =============================================================================

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { Loader2 } from "lucide-react";

// SSR-safe media hook — the profile view is a pure client SPA (post-login),
// so an effect-synced matchMedia never fights hydration.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return isDesktop;
}

export function ResponsiveFormDialog({
  open,
  onOpenChange,
  dirty = false,
  title,
  description,
  children,
  submitLabel,
  saving = false,
  onSubmit,
  errors = [],
  maxWidthClass = "sm:max-w-[560px]",
  note = "Your details stay private and secure.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When true, user-initiated closes require a "discard changes?" confirm. */
  dirty?: boolean;
  title: string;
  description?: string;
  children: React.ReactNode;
  submitLabel: string;
  saving?: boolean;
  onSubmit: () => void;
  /** Inline validation failures — rendered as an actionable error digest. */
  errors?: string[];
  maxWidthClass?: string;
  /** Footer reassurance note (reference "· Your details stay private." grammar). */
  note?: string;
}) {
  const isDesktop = useIsDesktop();
  const [discardOpen, setDiscardOpen] = useState(false);

  // Reset the guard whenever the sheet closes (success submit or discard).
  useEffect(() => {
    if (!open) setDiscardOpen(false);
  }, [open]);

  // Single close funnel: unsaved edits raise the confirm instead of closing.
  function requestClose(next: boolean) {
    if (!next) {
      if (dirty && !discardOpen) {
        setDiscardOpen(true);
        return;
      }
      setDiscardOpen(false);
    }
    onOpenChange(next);
  }

  function discard() {
    setDiscardOpen(false);
    onOpenChange(false);
  }

  const header = (Title: typeof DialogTitle | typeof DrawerTitle, Description: typeof DialogDescription | typeof DrawerDescription) => (
    <>
      <Title className="text-lg font-bold tracking-[-0.01em] text-foreground">
        {title}
      </Title>
      {description && (
        <Description className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </Description>
      )}
    </>
  );

  const errorDigest = errors.length > 0 && (
    <div
      role="alert"
      className="mx-1 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5"
    >
      <p className="text-xs font-semibold text-danger-ink">
        {errors.length === 1
          ? errors[0]
          : `Please fix ${errors.length} items before saving:`}
      </p>
      {errors.length > 1 && (
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          {errors.map((e) => (
            <li key={e} className="text-xs leading-relaxed text-danger-ink">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const footerNote = (
    <p className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium leading-snug text-muted-foreground">
      <Lock className="size-3 shrink-0" strokeWidth={1.8} aria-hidden />
      <span className="truncate">{note}</span>
    </p>
  );

  if (isDesktop) {
    return (
      <>
        <Dialog open={open} onOpenChange={requestClose}>
          <DialogContent
            className={`premium flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 ${maxWidthClass}`}
          >
            <DialogHeader className="relative shrink-0 border-b border-border/70 px-6 py-4 text-left">
              {/* Reference accent bar — short primary stroke on the head hairline */}
              <span
                aria-hidden
                className="absolute bottom-[-1px] left-6 h-[3px] w-20 rounded-full bg-primary"
              />
              {header(DialogTitle, DialogDescription)}
            </DialogHeader>
            <div className="pui-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {children}
            </div>
            <DialogFooter className="shrink-0 border-t border-border/70 bg-secondary/40 px-6 py-4">
              {errorDigest}
              <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">{footerNote}</div>
                <div className="flex shrink-0 items-center justify-end gap-2.5">
                  <Button
                    variant="outline"
                    onClick={() => requestClose(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button onClick={onSubmit} disabled={saving}>
                    {saving && <Loader2 className="size-4 animate-spin" />}
                    {submitLabel}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Call the guard renderer (it's a helper function, not a component) —
            passing the bare reference would render nothing and log a React
            "Functions are not valid as a React child" error. */}
        {discardGuard()}
      </>
    );
  }

  // Mobile — bottom sheet. Footer sits above the safe-area inset so the
  // primary action is always in thumb reach; body scrolls independently.
  return (
    <>
      <Drawer open={open} onOpenChange={requestClose}>
        <DrawerContent className="premium flex h-auto max-h-[92dvh]! flex-col p-0">
          <DrawerHeader className="relative shrink-0 border-b border-border/70 px-5 pb-4 pt-1 text-left">
            {/* Reference accent bar (mobile sheet variant) */}
            <span
              aria-hidden
              className="absolute bottom-[-1px] left-5 h-[3px] w-20 rounded-full bg-primary"
            />
            {header(DrawerTitle, DrawerDescription)}
          </DrawerHeader>
          <div className="pui-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {children}
          </div>
          <DrawerFooter className="shrink-0 border-t border-border/70 bg-secondary/40 px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
            {errorDigest}
            {footerNote}
            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                onClick={() => requestClose(false)}
                disabled={saving}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button onClick={onSubmit} disabled={saving} className="flex-1">
                {saving && <Loader2 className="size-4 animate-spin" />}
                {submitLabel}
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      {discardGuard()}
    </>
  );

  function discardGuard() {
    return (
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent className="premium">
          <AlertDialogHeader className="shrink-0">
            <AlertDialogTitle className="text-lg font-bold tracking-[-0.01em] text-foreground">
              Discard unsaved changes?
            </AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              You&apos;ve made edits that haven&apos;t been saved yet. Leaving
              now will lose everything you typed in this form.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="shrink-0">
            <AlertDialogCancel disabled={saving}>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={discard}
              className="bg-destructive text-white hover:bg-[#B80525]"
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }
}