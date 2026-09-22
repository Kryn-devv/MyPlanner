"use client";

import Link from "next/link";
import { useActionState } from "react";
import { resetPasswordAction } from "@/lib/auth/reset-actions";
import { MIN_PASSWORD_LENGTH, type ResetPasswordFormState } from "@/lib/validation/auth";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { FormError } from "@/components/ui/States";
import { InvalidResetLink } from "./InvalidResetLink";

/**
 * Chooses a new password through a reset link.
 *
 * The page has already checked the link before rendering this, but only the
 * submission can spend it — so a link that dies in between (used in another
 * tab, superseded by a newer one) turns into the invalid-link state here.
 */
export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, formAction, pending] = useActionState<ResetPasswordFormState, FormData>(resetPasswordAction, {});

  if (state.invalid) return <InvalidResetLink focusHeading />;

  const errors = state.errors ?? {};

  return (
    <div className="panel p-6 sm:p-7">
      <header className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Choose a new password</h1>
        <p className="mt-1 break-words text-[0.8125rem] text-ink-muted">
          For <span className="text-ink">{email}</span>. You&apos;ll be signed out on every other device.
        </p>
      </header>

      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="token" value={token} />
        {/* Tells a password manager which account the new password belongs
            to, so it updates the saved entry instead of creating a nameless
            one. Not submitted: the account comes from the token alone. */}
        <input type="email" autoComplete="username" defaultValue={email} readOnly hidden />

        <FormError message={errors._form} />

        <TextField
          label="New password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          autoFocus
          minLength={MIN_PASSWORD_LENGTH}
          placeholder="••••••••"
          error={errors.password}
          hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
        />

        <TextField
          label="Confirm new password"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          placeholder="••••••••"
          error={errors.confirmPassword}
        />

        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
          Reset password
        </Button>
      </form>

      <p className="mt-5 text-center text-[0.8125rem] text-ink-muted">
        <Link href="/login" className="font-medium text-accent-strong underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
