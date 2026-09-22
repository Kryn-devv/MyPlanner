"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  readResetPasswordForm,
  validateForgotPassword,
  type ForgotPasswordFormState,
  type ResetPasswordFormState,
} from "@/lib/validation/auth";
import { requestPasswordReset, resetPassword, RESET_TOKEN_COOKIE } from "./password-reset";
import { createSession } from "./session";
import { ensureUserStats } from "./users";

/**
 * Forgot-password Server Actions.
 *
 * Like the sign-in and sign-up actions, both return plain serialisable state
 * for `useActionState`, so the forms work before hydration.
 *
 * Both check that they were handed a form before reading it. An action is a
 * public endpoint whose argument types are only a promise, and anything else
 * would throw inside the validator — a 500 and a server-log entry per request.
 */

export async function forgotPasswordAction(
  _prev: ForgotPasswordFormState,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  if (!(formData instanceof FormData)) return { errors: { _form: "Something went wrong. Please try again." } };

  const result = validateForgotPassword(formData);
  const values = { email: String(formData.get("email") ?? "") };

  if (!result.ok) return { errors: result.errors, values };

  try {
    // Nothing about the request goes in: the link's address comes from the
    // server's own configuration, never from headers the sender chose.
    const outcome = requestPasswordReset(result.data.email, {
      // The lookup, the token and the email all happen after the response is
      // sent. Awaiting them here would make a registered address answer
      // measurably slower than an unregistered one.
      defer: (task) => after(task),
    });

    if (outcome.status === "unavailable") {
      return {
        errors: { _form: "Password reset isn't available on this server right now. Please try again later." },
        values,
      };
    }

    return { submitted: { delivery: outcome.delivery } };
  } catch (error) {
    console.error("[auth] forgot-password request failed", error);
    return { errors: { _form: "Something went wrong. Please try again." }, values };
  }
}

export async function resetPasswordAction(
  _prev: ResetPasswordFormState,
  formData: FormData,
): Promise<ResetPasswordFormState> {
  if (!(formData instanceof FormData)) return { invalid: true };

  const { token, password, confirmPassword } = readResetPasswordForm(formData);

  let userId: string;
  try {
    const outcome = await resetPassword(token, password, confirmPassword);
    // A dead link wins over field errors — `resetPassword` checks the link
    // whenever the input is wrong — so nobody is asked to fix a password only
    // to hear afterwards that the link could never have worked.
    if (outcome.status === "invalid-link") return { invalid: true };
    if (outcome.status === "invalid-input") return { errors: outcome.errors };
    userId = outcome.userId;
  } catch (error) {
    console.error("[auth] password reset failed", error);
    return { errors: { _form: "We could not reset your password. Please try again." } };
  }

  try {
    // The link is spent; the cookie that carried it here has no more use.
    (await cookies()).delete({ name: RESET_TOKEN_COOKIE.name, path: RESET_TOKEN_COOKIE.path });

    // Every session was revoked with the old password; this device gets the
    // first new one, so the person who just proved they own the address does
    // not have to type the password in again straight away.
    await ensureUserStats(userId);
    await createSession(userId);
  } catch (error) {
    // The password *has* changed by now, so "please try again" would send them
    // back to a spent link. Signing in with the new password is the way on.
    console.error("[auth] password was reset but the new session could not be created", error);
    redirect("/login");
  }

  redirect("/app");
}
