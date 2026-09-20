import { isValidTimezone } from "@/lib/datetime";
import { ErrorBag, invalid, readString, valid, type ValidationResult } from "./result";

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

  if (!email) bag.add("email", "Email is required.");
  else if (email.length > MAX_EMAIL_LENGTH) bag.add("email", "That email address is too long.");
  else if (!EMAIL_PATTERN.test(email)) bag.add("email", "Enter a valid email address.");

  if (!name) bag.add("name", "Name is required.");
  else if (name.length > MAX_NAME_LENGTH) bag.add("name", `Keep your name under ${MAX_NAME_LENGTH} characters.`);

  if (!password) bag.add("password", "Password is required.");
  else if (password.length < MIN_PASSWORD_LENGTH)
    bag.add("password", `Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  else if (password.length > MAX_PASSWORD_LENGTH)
    bag.add("password", `Passwords are limited to ${MAX_PASSWORD_LENGTH} characters.`);

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
