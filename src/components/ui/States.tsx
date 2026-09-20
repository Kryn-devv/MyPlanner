import { AlertTriangle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

/**
 * Loading, empty and error states.
 *
 * Centralised so that every surface in the app fails and waits the same way —
 * inconsistent empty states are one of the fastest ways for a product to feel
 * unfinished.
 */

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-[var(--radius-card)] bg-white/[0.045]", className)}
    />
  );
}

export interface LoadingStateProps {
  label?: string;
  rows?: number;
  className?: string;
}

/**
 * Skeleton rows shaped like the task cards they stand in for, so the layout
 * does not jump when real content arrives.
 */
export function LoadingState({ label = "Loading…", rows = 3, className }: LoadingStateProps) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="panel-flush flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-[18px] w-[18px] shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="h-5 w-12 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function LoadingPanel({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("panel p-5", className)} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-8 w-32" />
      <Skeleton className="mt-3 h-2 w-full rounded-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------

export interface EmptyStateProps {
  /**
   * A rendered element, not a component type.
   *
   * These states are handed to client components from server components, and
   * a component *function* cannot cross that boundary — React can only
   * serialise the element it produces. Sizing is applied to the child SVG here
   * so call sites stay `<Icon />` with no class plumbing.
   */
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Compact variant for small dashboard panels. */
  dense?: boolean;
}

export function EmptyState({ icon, title, description, action, className, dense = false }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        dense ? "gap-1.5 px-4 py-7" : "gap-2 px-6 py-12",
        className,
      )}
    >
      {icon && (
        <div
          aria-hidden="true"
          className={cn(
            "mb-1 grid place-items-center rounded-full border border-line bg-white/[0.02] text-ink-faint",
            dense ? "h-9 w-9 [&_svg]:h-4 [&_svg]:w-4" : "h-12 w-12 [&_svg]:h-5 [&_svg]:w-5",
          )}
        >
          {icon}
        </div>
      )}
      <p className={cn("font-medium text-ink", dense ? "text-[0.8125rem]" : "text-sm")}>{title}</p>
      {description && (
        <p className={cn("max-w-xs text-ink-faint", dense ? "text-[0.75rem]" : "text-[0.8125rem]")}>
          {description}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  description = "We could not load this. Try again in a moment.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center justify-center gap-2 px-6 py-10 text-center", className)}
    >
      <div
        aria-hidden="true"
        className="mb-1 grid h-11 w-11 place-items-center rounded-full border border-critical/25 bg-critical/10"
      >
        <AlertTriangle className="h-5 w-5 text-critical" />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-sm text-[0.8125rem] text-ink-muted">{description}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Inline form-level error.
 *
 * `role="alert"` so it is announced the moment it appears — a validation
 * message a screen reader never hears is not a validation message.
 */
export function FormError({ message, className }: { message?: string; className?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-[var(--radius-control)] border border-critical/25 bg-critical/10 px-3 py-2.5 text-[0.8125rem] text-critical",
        className,
      )}
    >
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
