"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/States";

/**
 * Root error boundary.
 *
 * The thrown error's message is deliberately not rendered: in production it may
 * carry internals. `digest` is shown instead so a user can quote something
 * actionable in a bug report.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <main className="relative z-10 grid min-h-dvh place-items-center px-6">
      <div className="panel w-full max-w-md">
        <ErrorState
          title="Something went wrong"
          description="An unexpected error interrupted this page. Trying again usually clears it."
          onRetry={reset}
        />
        {error.digest && (
          <p className="tnum border-t border-line px-6 py-3 text-center text-[0.6875rem] text-ink-faint">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
