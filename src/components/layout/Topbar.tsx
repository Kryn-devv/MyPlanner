"use client";

import { Flame, LogOut, Zap } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import { APP_NAME } from "@/config/app";
import { cn } from "@/lib/cn";
import { getRank } from "@/config/ranks";
import { formatXp } from "@/lib/xp";
import { useCountUp } from "@/components/reward/useCountUp";
import { Button } from "@/components/ui/Button";
import { QuickAddButton } from "@/components/tasks/QuickAddButton";
import { BrandMark } from "./Sidebar";

/**
 * Application header.
 *
 * Carries the brand on mobile (where the sidebar is not shown), a compact
 * progression readout, the global create action and sign-out.
 */
export interface TopbarProps {
  name: string;
  level: number;
  totalXp: number;
  streak: number;
  className?: string;
}

export function Topbar({ name, level, totalXp, streak, className }: TopbarProps) {
  const rank = getRank(level);
  const xp = useCountUp(totalXp);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-void/85 px-4 backdrop-blur-lg sm:px-6",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 lg:hidden">
        <BrandMark />
        <span className="text-[0.9375rem] font-semibold tracking-tight text-ink">{APP_NAME}</span>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <dl className="hidden items-center gap-3 text-[0.75rem] sm:flex">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Current streak</dt>
            <Flame
              className={cn(
                "h-3.5 w-3.5",
                streak > 0 ? "animate-flicker text-streak" : "text-ink-faint",
              )}
              aria-hidden="true"
            />
            <dd className={cn("tnum font-semibold", streak > 0 ? "text-streak" : "text-ink-muted")}>
              {streak}
              <span className="sr-only"> day streak</span>
            </dd>
          </div>

          <div aria-hidden="true" className="h-3.5 w-px bg-line-strong" />

          {/* Level and rank travel together everywhere they appear: the number
              measures the climb, the title is what it bought. */}
          <div className="flex items-center gap-1.5">
            <dt className="text-ink-faint">Level</dt>
            <dd className="tnum font-semibold text-ink">{level}</dd>
            <dd className={cn("hidden text-[0.6875rem] font-medium lg:block", rank.textClass)}>
              {rank.title}
            </dd>
          </div>

          <div aria-hidden="true" className="h-3.5 w-px bg-line-strong" />

          <div className="hidden items-center gap-1 md:flex">
            <dt className="sr-only">Total XP</dt>
            <Zap className="h-3 w-3 text-gold" aria-hidden="true" />
            <dd className="tnum font-semibold text-gold-strong">{formatXp(xp)}</dd>
          </div>
        </dl>

        <QuickAddButton />

        <span
          aria-hidden="true"
          className="hidden h-8 w-8 shrink-0 place-items-center rounded-full border border-line-strong bg-elevated text-[0.6875rem] font-semibold text-ink-muted sm:grid"
          title={name}
        >
          {initials || "?"}
        </span>

        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      </div>
    </header>
  );
}
