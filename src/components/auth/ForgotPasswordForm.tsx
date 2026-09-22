"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { forgotPasswordAction } from "@/lib/auth/reset-actions";
import { RESET_LINK_TTL_MINUTES, type ForgotPasswordFormState } from "@/lib/validation/auth";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { FormError } from "@/components/ui/States";

/**
 * Asks for a reset link.
 *
 * The confirmation is identical for every well-formed address — registered or
 * not — so this page cannot be used to find out who has an account. It only
 * varies with how *this server* sends links, which is the same for everyone.
 */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ForgotPasswordFormState, FormData>(forgotPasswordAction, {});

  if (state.submitted) return <RequestAccepted delivery={state.submitted.delivery} />;

  const errors = state.errors ?? {};

  return (
    <div className="panel p-6 sm:p-7">
      <header className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight text-ink">Forgot your password?</h1>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">
          Enter the email you signed up with and we&apos;ll give you a link to choose a new one.
        </p>
      </header>

      <form action={formAction} className="space-y-4" noValidate>
        <FormError message={errors._form} />

        <TextField
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          defaultValue={state.values?.email ?? ""}
          error={errors.email}
        />

        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
          Send reset link
        </Button>
      </form>

      <BackToSignIn />
    </div>
  );
}

/**
 * Replaces the form once a request is accepted.
 *
 * The submit button that had focus goes with the form, so focus moves to the
 * heading; left alone it would fall back to the page, and a screen reader
 * would announce nothing. A live region is not relied on instead: one that is
 * mounted with its content already inside is not reliably announced.
 */
function RequestAccepted({ delivery }: { delivery: "email" | "console" }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const headingClassName = "text-lg font-semibold tracking-tight text-ink outline-none";

  return (
    <div className="panel p-6 sm:p-7">
      <header className="mb-2">
        {delivery === "email" ? (
          <>
            <h1 ref={headingRef} tabIndex={-1} className={headingClassName}>
              Check your email
            </h1>
            <p className="mt-1 text-[0.8125rem] text-ink-muted">
              If an account exists for that address, we&apos;ve sent it a link to reset your password. The link
              expires in {RESET_LINK_TTL_MINUTES} minutes.
            </p>
          </>
        ) : (
          <>
            <h1 ref={headingRef} tabIndex={-1} className={headingClassName}>
              Check the server&apos;s terminal
            </h1>
            <p className="mt-1 text-[0.8125rem] text-ink-muted">
              Email isn&apos;t configured on this server, so nothing was emailed. If an account exists for that
              address, a reset link has been printed in the server&apos;s terminal window — the one running the
              app. Only the newest link there works, and it expires in {RESET_LINK_TTL_MINUTES} minutes.
            </p>
          </>
        )}
      </header>

      {delivery === "email" && (
        <p className="text-[0.75rem] text-ink-faint">
          Nothing arrived? Check your spam folder, or ask again in a few minutes.
        </p>
      )}

      <BackToSignIn />
    </div>
  );
}

function BackToSignIn() {
  return (
    <p className="mt-5 text-center text-[0.8125rem] text-ink-muted">
      Remembered it?{" "}
      <Link href="/login" className="font-medium text-accent-strong underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </p>
  );
}
