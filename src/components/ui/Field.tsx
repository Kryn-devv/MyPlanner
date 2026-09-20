import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Form controls.
 *
 * Every control is wired to a real `<label>` and, when invalid, to its error
 * message through `aria-describedby` with `aria-invalid`. Errors are never
 * communicated by border colour alone — the message is always present in the
 * accessibility tree.
 */

const CONTROL_BASE = cn(
  "w-full rounded-[var(--radius-control)] border bg-base px-3 text-sm text-ink",
  "placeholder:text-ink-faint",
  "transition-colors duration-150",
  "hover:border-line-strong",
  "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/25",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-[invalid=true]:border-critical/60 aria-[invalid=true]:focus:ring-critical/25",
);

interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

function FieldShell({ id, label, hint, error, required, children, className }: FieldShellProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-[0.8125rem] font-medium text-ink-muted">
        {label}
        {required && (
          <span className="text-critical" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only">(required)</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[0.75rem] text-critical">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[0.75rem] text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string, hint?: ReactNode): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

// ---------------------------------------------------------------------------

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string;
  wrapperClassName?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, wrapperClassName, className, required, ...props },
  ref,
) {
  const generatedId = useId();
  const id = props.name ? `field-${props.name}-${generatedId}` : generatedId;

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <input
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(CONTROL_BASE, "h-10", className)}
        {...props}
      />
    </FieldShell>
  );
});

export interface TextAreaFieldProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string;
  wrapperClassName?: string;
}

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { label, hint, error, wrapperClassName, className, required, ...props },
  ref,
) {
  const generatedId = useId();
  const id = props.name ? `field-${props.name}-${generatedId}` : generatedId;

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <textarea
        ref={ref}
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(CONTROL_BASE, "min-h-[84px] resize-y py-2.5 leading-relaxed", className)}
        {...props}
      />
    </FieldShell>
  );
});

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  label: string;
  hint?: ReactNode;
  error?: string;
  wrapperClassName?: string;
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, hint, error, wrapperClassName, className, required, children, ...props },
  ref,
) {
  const generatedId = useId();
  const id = props.name ? `field-${props.name}-${generatedId}` : generatedId;

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required} className={wrapperClassName}>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={cn(CONTROL_BASE, "h-10 cursor-pointer appearance-none pr-9", className)}
          {...props}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-faint"
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </FieldShell>
  );
});
