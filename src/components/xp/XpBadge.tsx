import { Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatXp } from "@/lib/xp";

/**
 * The XP reward chip on a task card.
 *
 * Deliberately the warmest thing on a row. Every other chip states a *fact*
 * about the task — its priority, its project, when it is due — while this one
 * states what you get for finishing it, and it is the only chip anybody is
 * ever pleased to see. Painting it the same muted violet as the rest made the
 * reward look like more metadata.
 *
 * Once the task is done the chip goes quiet: the offer has been taken.
 */
export function XpBadge({
  amount,
  muted = false,
  className,
}: {
  amount: number;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold tabular-nums transition-colors",
        muted
          ? "border-line bg-white/[0.02] text-ink-faint"
          : "border-gold/30 bg-gold/10 text-gold-strong",
        className,
      )}
    >
      <Zap className={cn("h-2.5 w-2.5", !muted && "fill-gold/40")} aria-hidden="true" />
      <span className="sr-only">Reward: </span>
      {formatXp(amount)} XP
    </span>
  );
}
