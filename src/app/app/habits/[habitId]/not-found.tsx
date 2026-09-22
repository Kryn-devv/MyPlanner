import Link from "next/link";
import { Repeat } from "lucide-react";
import { buttonClassName } from "@/components/ui/Button";

/**
 * Shown both for a habit that does not exist and for one belonging to somebody
 * else — deliberately the same page, so the URL cannot be used to discover
 * whether a given habit is real.
 */
export default function HabitNotFound() {
  return (
    <div className="panel flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div
        aria-hidden="true"
        className="grid h-12 w-12 place-items-center rounded-full border border-line bg-white/[0.02]"
      >
        <Repeat className="h-5 w-5 text-ink-faint" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight text-ink">Habit not found</h1>
      <p className="max-w-sm text-[0.875rem] leading-relaxed text-ink-muted">
        This habit does not exist, or it is not yours.
      </p>
      <Link
        href="/app/habits"
        className={buttonClassName({ variant: "secondary", size: "sm", className: "mt-2" })}
      >
        Back to habits
      </Link>
    </div>
  );
}
