"use client";

import { formatTimer, targetProgress, type FocusTiming } from "@/lib/focus/duration";
import { cn } from "@/lib/cn";
import { useFocusElapsed } from "./useFocusElapsed";

/**
 * The clock.
 *
 * Large, monospaced and still — the numbers change, nothing else does. The
 * accessible name is a spoken duration rather than the digits, because
 * "eighteen forty-two" read out character by character is not a time, and the
 * live region is `off`: a screen reader announcing every second would make the
 * page unusable. The elapsed figure is available on demand instead.
 */
export function FocusTimer({
  timing,
  targetMinutes,
  size = "large",
}: {
  timing: FocusTiming;
  targetMinutes: number | null;
  size?: "large" | "compact";
}) {
  const elapsed = useFocusElapsed(timing);
  const progress = targetProgress(elapsed, targetMinutes);
  const paused = timing.status === "PAUSED";

  const spoken = spokenDuration(elapsed);

  if (size === "compact") {
    return (
      <span
        className={cn("tnum tabular-nums", paused ? "text-ink-faint" : "text-ink")}
        aria-label={`${spoken} elapsed`}
      >
        <span aria-hidden="true">{formatTimer(elapsed)}</span>
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <p
        className={cn(
          "tnum text-[3.25rem] font-light leading-none tracking-tight sm:text-[4.5rem]",
          paused ? "text-ink-muted" : "text-ink",
        )}
        aria-label={`${spoken} elapsed`}
      >
        <span aria-hidden="true">{formatTimer(elapsed)}</span>
      </p>

      {progress && (
        <div className="w-full max-w-sm space-y-2">
          <div
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${spoken} of ${targetMinutes} minute target`}
            className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]"
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out-quint)]",
                progress.reached ? "bg-positive" : "bg-accent",
              )}
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          <p className="tnum text-center text-[0.8125rem] text-ink-faint">
            <span aria-hidden="true">
              {formatTimer(elapsed)} / {formatTimer(progress.targetSeconds)}
            </span>
            {progress.reached && (
              <span className="ml-2 text-positive">
                Target reached
                {progress.overrunSeconds > 0 && (
                  <span className="text-ink-faint"> · +{formatTimer(progress.overrunSeconds)}</span>
                )}
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/** "18 minutes 42 seconds" — what a screen reader should actually say. */
function spokenDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs} second${secs === 1 ? "" : "s"}`);
  return parts.join(" ");
}
