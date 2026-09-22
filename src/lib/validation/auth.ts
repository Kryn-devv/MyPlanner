import { isValidTimezone } from "@/lib/datetime";
import { ErrorBag, invalid, readString, valid, type FieldErrors, type ValidationResult } from "./result";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;
export const MAX_NAME_LENGTH = 80;
export const MAX_EMAIL_LENGTH = 254;

// Deliberately permissive: over-strict email regexes reject valid addresses.
// Real verification is a confirmation email, which is Phase 2.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The rules an email address must meet to be typed into a form.
 *
 * Shared by sign-up and the forgot-password form so the two can never disagree
 * about what a valid address looks like — and so neither message says anything
 * about whether an account exists.
 */
function addEmailErrors(bag: ErrorBag, email: string): void {
  if (!email) bag.add("email", "Email is required.");
  else if (email.length > MAX_EMAIL_LENGTH) bag.add("email", "That email address is too long.");
  else if (!EMAIL_PATTERN.test(email)) bag.add("email", "Enter a valid email address.");
}

/**
 * The rules every newly chosen password meets, wherever it is chosen.
 *
 * Sign-up and password reset both call this, so a reset can never set a
 * password that sign-up would have refused, nor refuse one sign-up accepts.
 */
function addNewPasswordErrors(bag: ErrorBag, field: string, password: string): void {
  if (!password) bag.add(field, "Password is required.");
  else if (password.length < MIN_PASSWORD_LENGTH) bag.add(field, `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  else if (password.length > MAX_PASSWORD_LENGTH)
    bag.add(field, `Passwords are limited to ${MAX_PASSWORD_LENGTH} characters.`);
}

export interface SignUpInput {
  readonly email: string;
  readonly password: string;
  readonly name: string;
  readonly timezone: string;
}

export function validateSignUp(form: FormData): ValidationResult<SignUpInput> {
  const bag = new ErrorBag();

  const email = normalizeEmail(readString(form, "email"));
  const password = readString(form, "password");
  const name = readString(form, "name");
  const rawTimezone = readString(form, "timezone");

  addEmailErrors(bag, email);

  if (!name) bag.add("name", "Name is required.");
  else if (name.length > MAX_NAME_LENGTH) bag.add("name", `Keep your name under ${MAX_NAME_LENGTH} characters.`);

  addNewPasswordErrors(bag, "password", password);

  if (!bag.isEmpty) return invalid(bag.toObject());

  return valid({
    email,
    password,
    name,
    timezone: isValidTimezone(rawTimezone) ? rawTimezone : "UTC",
  });
}

export interface SignInInput {
  readonly email: string;
  readonly password: string;
}

export function validateSignIn(form: FormData): ValidationResult<SignInInput> {
  const bag = new ErrorBag();

  const email = normalizeEmail(readString(form, "email"));
  const password = readString(form, "password");

  if (!email) bag.add("email", "Email is required.");
  if (!password) bag.add("password", "Password is required.");

  if (!bag.isEmpty) return invalid(bag.toObject());
  return valid({ email, password });
}

export interface ProfileInput {
  readonly name: string;
  readonly timezone: string;
}

export function validateProfile(form: FormData): ValidationResult<ProfileInput> {
  const bag = new ErrorBag();

  const name = readString(form, "name");
  const timezone = readString(form, "timezone");

  if (!name) bag.add("name", "Name is required.");
  else if (name.length > MAX_NAME_LENGTH) bag.add("name", `Keep your name under ${MAX_NAME_LENGTH} characters.`);

  if (!timezone) bag.add("timezone", "Timezone is required.");
  else if (!isValidTimezone(timezone)) bag.add("timezone", "That is not a recognised timezone.");

  if (!bag.isEmpty) return invalid(bag.toObject());
  return valid({ name, timezone });
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

/** How long an emailed reset link works. The UI quotes it, so it lives here. */
export const RESET_LINK_TTL_MINUTES = 30;

/**
 * The shape of a reset token: 32 random bytes as unpadded base64url.
 *
 * Checked before any database work, so a truncated or tampered link is
 * rejected without a query and without paying for a password hash.
 */
const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedResetToken(token: unknown): token is string {
  return typeof token === "string" && RESET_TOKEN_PATTERN.test(token);
}

/** The one message every unusable link produces, whatever the reason. */
export const RESET_LINK_INVALID_MESSAGE = "This link is invalid or has expired";

export interface ForgotPasswordInput {
  readonly email: string;
}

/**
 * Validates only the *format* of the address.
 *
 * Whether an account exists is deliberately not this function's business: the
 * answer to that must never reach the person who asked.
 */
export function validateForgotPassword(form: FormData): ValidationResult<ForgotPasswordInput> {
  const bag = new ErrorBag();
  const email = normalizeEmail(readString(form, "email"));

  addEmailErrors(bag, email);

  if (!bag.isEmpty) return invalid(bag.toObject());
  return valid({ email });
}

export interface ResetPasswordInput {
  readonly token: string;
  readonly password: string;
}

export interface ResetPasswordFields {
  readonly token: string;
  readonly password: string;
  readonly confirmPassword: string;
}

/** The reset form's fields, as submitted. */
export function readResetPasswordForm(form: FormData): ResetPasswordFields {
  return {
    token: readString(form, "token"),
    password: readString(form, "password"),
    confirmPassword: readString(form, "confirmPassword"),
  };
}

/**
 * Validates a new-password submission.
 *
 * Passwords are trimmed exactly as sign-up and sign-in trim them. Keeping the
 * three paths identical matters more than the whitespace: a password set here
 * with a trailing space that sign-in then trimmed away would lock the user out
 * with the very password they just chose.
 *
 * A malformed token is reported under `token` so the caller can show the
 * invalid-link state rather than a field error the user cannot fix.
 */
export function validateResetPassword(fields: ResetPasswordFields): ValidationResult<ResetPasswordInput> {
  const bag = new ErrorBag();

  const token = fields.token.trim();
  const password = fields.password.trim();
  const confirmPassword = fields.confirmPassword.trim();

  if (!isWellFormedResetToken(token)) bag.add("token", RESET_LINK_INVALID_MESSAGE);

  addNewPasswordErrors(bag, "password", password);

  if (!confirmPassword) bag.add("confirmPassword", "Confirm your new password.");
  else if (confirmPassword !== password) bag.add("confirmPassword", "The passwords do not match.");

  if (!bag.isEmpty) return invalid(bag.toObject());
  return valid({ token, password });
}

/*
 * Form state for the two reset forms.
 *
 * They live here rather than beside the actions because a "use server" module
 * may export nothing but async functions, and the client forms need the shapes.
 */

export interface ForgotPasswordFormState {
  readonly errors?: FieldErrors;
  readonly values?: { readonly email: string };
  /**
   * Present once a request has been accepted. It says how links leave this
   * server — never whether the address belongs to an account.
   */
  readonly submitted?: { readonly delivery: "email" | "console" };
}

export interface ResetPasswordFormState {
  readonly errors?: FieldErrors;
  /** The link is unusable: unknown, expired, already used or superseded. */
  readonly invalid?: boolean;
}
