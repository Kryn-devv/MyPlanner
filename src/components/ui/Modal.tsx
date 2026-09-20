"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

/**
 * An accessible dialog.
 *
 * Built on the native `<dialog>` element so that focus trapping, the top
 * layer, inertness of the page behind, and Escape-to-close come from the
 * browser rather than from hand-written key handlers that inevitably miss a
 * case. Framer Motion supplies the transition; `<dialog>` supplies the
 * semantics.
 */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Visually hidden when omitted, but always announced. */
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}

export function Modal({ open, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const reduceMotion = useReducedMotion();

  // Drive the native element from React state.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      // Stop the page behind scrolling under the dialog on touch devices.
      document.body.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // The browser fires `cancel` for Escape; route it through our own handler so
  // exit animations still run.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // The element is a transparent full-screen stage; the visible card is
      // the motion.div inside it.
      className="m-0 h-full max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/70 backdrop:backdrop-blur-[2px]"
      onClick={(event) => {
        // Clicking the stage (but not the card) dismisses.
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <AnimatePresence>
        {open && (
          <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-6">
            <motion.div
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={cn(
                "panel w-full overflow-hidden bg-elevated shadow-[0_24px_70px_-18px_rgba(0,0,0,0.85)]",
                // Full-bleed sheet on mobile, centred card from `sm` up.
                "max-h-[92dvh] rounded-b-none sm:max-h-[86dvh] sm:rounded-b-[var(--radius-panel)]",
                size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
              )}
            >
              <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-[0.9375rem] font-semibold tracking-tight text-ink">
                    {title}
                  </h2>
                  {description && (
                    <p id={descriptionId} className="mt-0.5 text-[0.8125rem] text-ink-muted">
                      {description}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close dialog" type="button">
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </header>

              <div className="max-h-[calc(92dvh-8.5rem)] overflow-y-auto px-5 py-5 sm:max-h-[calc(86dvh-8.5rem)]">
                {children}
              </div>

              {footer && <footer className="border-t border-line bg-surface/60 px-5 py-3.5">{footer}</footer>}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </dialog>
  );
}
