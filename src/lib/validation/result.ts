/**
 * A tiny, dependency-free validation result type.
 *
 * Server Actions return these straight to the client, so the shape has to be
 * serialisable: plain objects and strings only, no Error instances or classes.
 */

/** Field name -> human-readable message. `_form` holds form-level errors. */
export type FieldErrors = Record<string, string>;

export type ValidationResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly errors: FieldErrors };

export function valid<T>(data: T): ValidationResult<T> {
  return { ok: true, data };
}

export function invalid<T>(errors: FieldErrors): ValidationResult<T> {
  return { ok: false, errors };
}

/** Collects errors while validating, so a form reports every problem at once. */
export class ErrorBag {
  private readonly errors: FieldErrors = {};

  add(field: string, message: string): void {
    // First error per field wins — it is the most specific one.
    if (!(field in this.errors)) this.errors[field] = message;
  }

  get isEmpty(): boolean {
    return Object.keys(this.errors).length === 0;
  }

  toObject(): FieldErrors {
    return { ...this.errors };
  }
}

/** Normalises `FormData` values into trimmed strings. */
export function readString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Returns `null` for an absent/blank optional field. */
export function readOptionalString(form: FormData, key: string): string | null {
  const value = readString(form, key);
  return value.length > 0 ? value : null;
}
