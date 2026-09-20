"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/States";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] route error", error);
  }, [error]);

  return (
    <div className="panel">
      <ErrorState
        title="This page could not load"
        description="Something went wrong fetching your data. Your tasks and XP are safe."
        onRetry={reset}
      />
      {error.digest && (
        <p className="tnum border-t border-line px-6 py-3 text-center text-[0.6875rem] text-ink-faint">
          Reference: {error.digest}
        </p>
      )}
    </div>
  );
}
