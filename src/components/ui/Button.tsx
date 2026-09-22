import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Always a real `<button>` (or `<a>` via `asChild`-free composition elsewhere),
 * never a clickable `<div>`: keyboard activation, focus order and the
 * `disabled` state all come for free from the platform.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a spinner and blocks interaction without changing layout width. */
  loading?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  // The primary action carries the progression gradient and a real glow. It is
  // the button that starts work, and it should look like the most alive thing
  // on the screen rather than like a flat violet rectangle.
  primary:
    "bg-gradient-to-b from-accent-strong to-accent text-white shadow-[0_1px_0_0_oklch(100%_0_0/22%)_inset,var(--glow-accent-sm)] hover:from-accent-strong hover:to-accent-strong hover:shadow-[0_1px_0_0_oklch(100%_0_0/22%)_inset,var(--glow-accent-md)] active:from-accent active:to-accent-dim",
  secondary:
    "bg-elevated text-ink border border-line-strong hover:bg-overlay hover:border-white/20",
  ghost: "text-ink-muted hover:text-ink hover:bg-white/5",
  danger: "bg-critical/12 text-critical border border-critical/30 hover:bg-critical/20",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.8125rem] gap-1.5 rounded-[var(--radius-control)]",
  md: "h-10 px-4 text-sm gap-2 rounded-[var(--radius-control)]",
  lg: "h-11 px-5 text-sm gap-2 rounded-[var(--radius-control)]",
  icon: "h-9 w-9 rounded-[var(--radius-control)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // `aria-busy` tells a screen reader the control is working; the visual
      // spinner alone communicates nothing to one.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex select-none items-center justify-center font-medium",
        "transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-[var(--ease-out-quint)]",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="absolute inset-0 grid place-items-center"
        >
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80" />
        </span>
      )}
      <span className={cn("inline-flex items-center gap-2", loading && "invisible")}>{children}</span>
    </button>
  );
});

/**
 * Shared button styling for anchors.
 *
 * A navigation target must be a real link — wrapping a `<Link>` in a
 * `<button>` produces invalid markup and breaks middle-click, "open in new
 * tab" and the browser's own link affordances.
 */
export function buttonClassName({
  variant = "secondary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(
    "relative inline-flex select-none items-center justify-center font-medium",
    "transition-[background-color,border-color,color,transform] duration-150 ease-[var(--ease-out-quint)]",
    "active:scale-[0.985]",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}
