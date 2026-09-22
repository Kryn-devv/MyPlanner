"use client";

import { cn } from "@/lib/cn";

/**
 * The amount, leaving the control that earned it.
 *
 * Positioned in the viewport at the point of the click rather than inside the
 * row, for two reasons: a row can be scrolled, re-sorted or removed the
 * instant it is completed — taking its own celebration with it — and a fixed
 * layer costs the list nothing at all in layout or paint.
 *
 * Entirely `aria-hidden`: the toast layer already announces the same amount,
 * and a screen reader should not hear it twice.
 */

export interface Burst {
  readonly id: number;
  readonly amount: number;
  readonly x: number;
  readonly y: number;
}

/** Fixed directions, so the spray is identical every time and never random. */
const SPARKS = [
  { x: -34, y: -26 },
  { x: 32, y: -30 },
  { x: -46, y: 6 },
  { x: 44, y: 2 },
  { x: -22, y: 30 },
  { x: 26, y: 34 },
  { x: 4, y: -46 },
  { x: -6, y: 44 },
];

export function XpBurstLayer({ bursts }: { bursts: readonly Burst[] }) {
  if (bursts.length === 0) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[70]">
      {bursts.map((burst) => (
        <XpBurst key={burst.id} burst={burst} />
      ))}
    </div>
  );
}

function XpBurst({ burst }: { burst: Burst }) {
  const gained = burst.amount > 0;

  return (
    <div className="absolute" style={{ left: burst.x, top: burst.y }}>
      {/* The ring: a single expanding outline that reads as impact. */}
      <span
        className={cn(
          "absolute left-0 top-0 block h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
          gained ? "border-gold/70" : "border-ink-faint/60",
        )}
        style={{ animation: "ring-out 620ms var(--ease-out-quint) forwards" }}
      />

      {/* Sparks, only on a gain. Losing XP should feel like a correction, not
          like an event worth confetti. */}
      {gained &&
        SPARKS.map((spark, index) => (
          <span
            key={index}
            className="absolute left-0 top-0 block h-1.5 w-1.5 rounded-full bg-gold"
            style={{
              ["--spark-x" as string]: `${spark.x}px`,
              ["--spark-y" as string]: `${spark.y}px`,
              animation: `spark ${560 + index * 24}ms var(--ease-out-quint) forwards`,
            }}
          />
        ))}

      {/* The number itself. */}
      <span
        className={cn(
          "tnum absolute left-0 top-0 block whitespace-nowrap text-[1.0625rem] font-bold tracking-tight",
          gained ? "numeral-xp drop-shadow-[0_2px_10px_rgba(251,191,36,0.45)]" : "text-ink-faint",
        )}
        style={{ animation: "rise-away 1100ms var(--ease-out-quint) forwards" }}
      >
        {gained ? `+${burst.amount}` : burst.amount} XP
      </span>
    </div>
  );
}
