"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { buttonClassName } from "@/components/ui/Button";
import { RESET_LINK_INVALID_MESSAGE, RESET_LINK_TTL_MINUTES } from "@/lib/validation/auth";

/**
 * The single state every unusable reset link lands on.
 *
 * Unknown, expired, already used and superseded all read the same on purpose:
 * telling them apart would tell a stranger holding a guessed or stolen link
 * something about the account behind it. The copy still names every way a
 * link dies — the commonest is clicking the older of two emails — without
 * saying which one applied.
 *
 * `focusHeading` is for when this replaces the form after a submission. The
 * focused button disappears with the form, so focus is moved to the heading;
 * otherwise it would fall back to the page and a screen reader would say
 * nothing about what just happened.
 */
export function InvalidResetLink({ focusHeading = false }: { focusHeading?: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  return (
    <div className="panel p-6 sm:p-7">
      <header className="mb-6">
        <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold tracking-tight text-ink outline-none">
          {RESET_LINK_INVALID_MESSAGE}
        </h1>
        <p className="mt-1 text-[0.8125rem] text-ink-muted">
          Reset links work once and stop working after {RESET_LINK_TTL_MINUTES} minutes, and only the most recent
          link you asked for works. Request a new one to choose your password.
        </p>
      </header>

      <Link
        // Asserted because the generated route list only learns about new
        // pages on the next build; the cast keeps type-checking independent of
        // whether that build has run.
        href={"/forgot-password" as Route}
        className={buttonClassName({ variant: "primary", size: "lg", className: "w-full" })}
      >
        Request a new link
      </Link>

      <p className="mt-5 text-center text-[0.8125rem] text-ink-muted">
        <Link href="/login" className="font-medium text-accent-strong underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
