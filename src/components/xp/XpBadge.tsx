import { Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatXp } from "@/lib/xp";

/** The XP reward chip on a task card. */
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
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium tabular-nums",
        muted
          ? "border-line bg-white/[0.02] text-ink-faint"
          : "border-accent/25 bg-accent/10 text-accent-strong",
        className,
      )}
    >
      <Zap className="h-2.5 w-2.5" aria-hidden="true" />
      <span className="sr-only">Reward: </span>
      {formatXp(amount)} XP
    </span>
  );
}
