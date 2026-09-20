"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { signInAction, signUpAction, type AuthFormState } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation/auth";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { FormError } from "@/components/ui/States";

/**
 * Sign-in and sign-up.
 *
 * One component for both so the two pages cannot drift apart. Submission runs
 * through a Server Action via `useActionState`, which means the form works
 * before hydration and errors come back from the same validator the server
 * trusts.
 */
export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const isSignUp = mode === "signup";
  const action = isSignUp ? signUpAction : signInAction;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(action, {});
  const [timezone, setTimezone] = useState("UTC");

  // Detect the browser's timezone and submit it with the sign-up, so dates and
  // streaks are right from the very first task rather than defaulting to UTC.
  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected) setTimezone(detected);
    } catch {
      // Keep UTC; the user can change it in settings.
    }
  }, []);

  const errors = state.errors ?? {};

  return (
    <div className="panel p-6 sm:p-7">
      <header className="mb-6">
        <h1 className="text-lg font-semibold tracking-tight text-ink">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">
          {isSignUp ? "Start tracking tasks and levelling up." : "Sign in to pick up where you left off."}
        </p>
      </header>

      <form action={formAction} className="space-y-4" noValidate>
        {isSignUp && <input type="hidden" name="timezone" value={timezone} />}

        <FormError message={errors._form} />

        {isSignUp && (
          <TextField
            label="Name"
            name="name"
            required
            autoComplete="name"
            autoFocus
            placeholder="Ada Lovelace"
            defaultValue={state.values?.name ?? ""}
            error={errors.name}
          />
        )}

        <TextField
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus={!isSignUp}
          placeholder="you@example.com"
          defaultValue={state.values?.email ?? ""}
          error={errors.email}
        />

        <TextField
          label="Password"
          name="password"
          type="password"
          required
          // Tells a password manager which flow this is, so it offers to save
          // on sign-up and to fill on sign-in.
          autoComplete={isSignUp ? "new-password" : "current-password"}
          minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
          placeholder="••••••••"
          error={errors.password}
          hint={isSignUp ? `At least ${MIN_PASSWORD_LENGTH} characters` : undefined}
        />

        <Button type="submit" variant="primary" size="lg" loading={pending} className="w-full">
          {isSignUp ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="mt-5 text-center text-[0.8125rem] text-ink-muted">
        {isSignUp ? "Already have an account? " : "New here? "}
        <Link
          href={isSignUp ? "/login" : "/signup"}
          className="font-medium text-accent-strong underline-offset-4 hover:underline"
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
