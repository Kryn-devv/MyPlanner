import type { Metadata } from "next";
import { cookies } from "next/headers";
import { InvalidResetLink } from "@/components/auth/InvalidResetLink";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { findUsableResetToken, RESET_TOKEN_COOKIE } from "@/lib/auth/password-reset";

export const metadata: Metadata = {
  title: "Reset password",
  // The token reaches this page in a cookie, never in its URL (see
  // ../route.ts), so no Referer can carry it. The policy stays as a second
  // line of defence, and the page loads nothing from any other origin either.
  referrer: "no-referrer",
};

/**
 * Opened from the emailed link, by way of the route that takes the token out
 * of the address.
 *
 * The link is checked on arrival so a dead one says so before anyone types a
 * new password into it. The check is read-only — mail scanners and link
 * previews fetch pages like this, and must not spend the token by doing so.
 *
 * It renders for signed-in visitors too. Someone still signed in on their
 * phone may well open the link there, and resetting replaces every session
 * with a fresh one for the link's own account anyway.
 */
export default async function ResetPasswordPage() {
  const token = (await cookies()).get(RESET_TOKEN_COOKIE.name)?.value ?? "";

  const usable = await findUsableResetToken(token);
  if (!usable) return <InvalidResetLink />;

  return <ResetPasswordForm token={token} email={usable.email} />;
}
