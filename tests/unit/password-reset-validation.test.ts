import { describe, expect, it } from "vitest";
import {
  isWellFormedResetToken,
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  readResetPasswordForm,
  RESET_LINK_INVALID_MESSAGE,
  validateForgotPassword,
  validateResetPassword,
  validateSignUp,
} from "@/lib/validation/auth";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

/** A token of the shape the server issues: 32 bytes of base64url. */
const TOKEN = "Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5";
const VALID = { token: TOKEN.slice(0, 43), password: "a-brand-new-password", confirmPassword: "a-brand-new-password" };

/** Validates fields exactly as the reset form submits them. */
const validateResetForm = (fields: Record<string, string>) => validateResetPassword(readResetPasswordForm(form(fields)));

describe("isWellFormedResetToken", () => {
  it("accepts exactly 43 base64url characters", () => {
    expect(isWellFormedResetToken("A".repeat(43))).toBe(true);
    expect(isWellFormedResetToken("aZ09-_".repeat(7) + "x")).toBe(true);
  });

  it("rejects anything else before it can reach the database", () => {
    for (const bad of [
      "",
      "A".repeat(42),
      "A".repeat(44),
      `${"A".repeat(42)}=`,
      `${"A".repeat(42)}+`,
      `${"A".repeat(42)}/`,
      ` ${"A".repeat(42)}`,
      `${"A".repeat(42)}\n`,
      "'; DROP TABLE \"User\"; --".padEnd(43, "x"),
    ]) {
      expect(isWellFormedResetToken(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("rejects non-strings", () => {
    for (const bad of [undefined, null, 43, ["A".repeat(43)], { token: "A".repeat(43) }]) {
      expect(isWellFormedResetToken(bad)).toBe(false);
    }
  });
});

describe("validateForgotPassword", () => {
  it("normalises the address the way sign-in does", () => {
    const result = validateForgotPassword(form({ email: "  Ada@Example.TEST " }));
    expect(result).toEqual({ ok: true, data: { email: "ada@example.test" } });
  });

  it("requires an address", () => {
    const result = validateForgotPassword(form({}));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.email).toBe("Email is required.");
  });

  it("uses the same format rules and messages as sign-up", () => {
    for (const email of ["not-an-email", "a@b", `${"x".repeat(MAX_EMAIL_LENGTH)}@example.test`]) {
      const forgot = validateForgotPassword(form({ email }));
      const signUp = validateSignUp(form({ email, name: "Ada", password: "correct-horse-battery" }));
      expect(forgot.ok).toBe(false);
      expect(signUp.ok).toBe(false);
      if (forgot.ok || signUp.ok) return;
      expect(forgot.errors.email).toBe(signUp.errors.email);
    }
  });
});

describe("validateResetPassword", () => {
  it("accepts a matching pair and a well-formed token", () => {
    const result = validateResetForm(VALID);
    expect(result).toEqual({ ok: true, data: { token: VALID.token, password: VALID.password } });
  });

  it("takes the same fields directly, as the reset service passes them", () => {
    expect(validateResetPassword(VALID)).toEqual(validateResetForm(VALID));
  });

  it("applies sign-up's length rules with sign-up's wording", () => {
    for (const password of ["", "short", "x".repeat(MAX_PASSWORD_LENGTH + 1)]) {
      const reset = validateResetForm({ ...VALID, password, confirmPassword: password });
      const signUp = validateSignUp(form({ email: "ada@example.test", name: "Ada", password }));
      expect(reset.ok).toBe(false);
      expect(signUp.ok).toBe(false);
      if (reset.ok || signUp.ok) return;
      expect(reset.errors.password).toBe(signUp.errors.password);
    }
  });

  it("accepts the boundary lengths sign-up accepts", () => {
    for (const password of ["x".repeat(MIN_PASSWORD_LENGTH), "x".repeat(MAX_PASSWORD_LENGTH)]) {
      expect(validateResetForm({ ...VALID, password, confirmPassword: password }).ok).toBe(true);
    }
  });

  it("requires the confirmation", () => {
    const result = validateResetForm({ ...VALID, confirmPassword: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.confirmPassword).toBe("Confirm your new password.");
  });

  it("requires the confirmation to match", () => {
    const result = validateResetForm({ ...VALID, confirmPassword: "a-brand-new-passwork" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.confirmPassword).toBe("The passwords do not match.");
    expect(result.errors.password).toBeUndefined();
  });

  it("trims both fields exactly as sign-in trims the password", () => {
    // Otherwise a trailing space chosen here would never match at sign-in.
    const result = validateResetForm({ ...VALID, password: " a-brand-new-password ", confirmPassword: "a-brand-new-password" });
    expect(result).toEqual({ ok: true, data: { token: VALID.token, password: "a-brand-new-password" } });
  });

  it("treats absent form fields as empty rather than failing", () => {
    expect(readResetPasswordForm(form({}))).toEqual({ token: "", password: "", confirmPassword: "" });
    const result = validateResetForm({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors).sort()).toEqual(["confirmPassword", "password", "token"]);
  });

  it("flags a malformed or missing token under `token`", () => {
    for (const token of ["", "tampered", `${VALID.token}x`]) {
      const result = validateResetForm({ ...VALID, token });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.token).toBe(RESET_LINK_INVALID_MESSAGE);
    }
  });
});
