"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Sparkles, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * Transient feedback.
 *
 * Hand-rolled rather than pulled from a library: the whole surface is one
 * context, one reducer and one animated list, and a toast dependency would be
 * larger than the code it replaces.
 *
 * Messages land in an `aria-live="polite"` region so they are announced
 * without stealing focus mid-task.
 */

export type ToastTone = "success" | "error" | "xp";

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
  readonly detail?: string;
}

interface ToastContextValue {
  push: (toast: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DISMISS_AFTER_MS = 4000;
/** More than a few at once is noise; drop the oldest. */
const MAX_VISIBLE = 3;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { ...toast, id }].slice(-MAX_VISIBLE));
      setTimeout(() => dismiss(id), DISMISS_AFTER_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside a ToastProvider.");
  return context;
}

// ---------------------------------------------------------------------------

const TONES: Record<ToastTone, { icon: typeof CheckCircle2; className: string; iconClass: string }> = {
  success: { icon: CheckCircle2, className: "border-positive/25 bg-elevated", iconClass: "text-positive" },
  error: { icon: AlertTriangle, className: "border-critical/30 bg-elevated", iconClass: "text-critical" },
  xp: { icon: Sparkles, className: "border-accent/30 bg-elevated", iconClass: "text-accent-strong" },
};

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      // Above the bottom nav on mobile; bottom-right on desktop.
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-0 sm:items-end sm:pb-4"
      role="region"
      aria-label="Notifications"
    >
      <div aria-live="polite" aria-atomic="false" className="contents">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const tone = TONES[toast.tone];
            const Icon = tone.icon;

            return (
              <motion.div
                key={toast.id}
                layout={!reduceMotion}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  "panel pointer-events-auto flex w-full max-w-sm items-start gap-2.5 px-3.5 py-3 shadow-[0_18px_48px_-16px_rgba(0,0,0,0.9)]",
                  tone.className,
                )}
              >
                <Icon className={cn("mt-px h-4 w-4 shrink-0", tone.iconClass)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[0.8125rem] font-medium leading-snug text-ink">{toast.message}</p>
                  {toast.detail && <p className="mt-0.5 text-[0.75rem] text-ink-faint">{toast.detail}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(toast.id)}
                  aria-label="Dismiss notification"
                  className="-m-1 shrink-0 rounded p-1 text-ink-faint transition-colors hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
