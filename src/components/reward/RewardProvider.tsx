"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { XpBurstLayer, type Burst } from "./XpBurst";
import { LevelUpOverlay, type LevelUp } from "./LevelUpOverlay";
import { ComboBadge } from "./ComboBadge";

/**
 * The reward layer.
 *
 * Everything this product measures — XP, levels, ranks, streaks — was already
 * recorded correctly and reported in a four-second grey toast. This is where
 * it is *felt* instead: the amount leaps off the control that earned it, the
 * rail it pays into lights up, consecutive finishes build a combo, and
 * crossing a level takes over the screen for a moment.
 *
 * Two rules hold everything here together:
 *
 *  - **Nothing here can ever block the interface.** Every layer it renders is
 *    `pointer-events: none` and dismisses itself on a timer. A celebration
 *    that swallows the next click is worse than no celebration, and a modal
 *    one would sit directly in the path of somebody in a hurry — which, after
 *    finishing a task, is exactly who they are.
 *  - **It decorates, it never reports.** The toast layer still carries the
 *    announcement for assistive technology; every visual here is
 *    `aria-hidden`, apart from the level-up, which is announced once through
 *    a polite live region. Anything else would say the same thing twice.
 */

export interface RewardEvent {
  /** Signed XP the server actually wrote. Zero events are ignored. */
  readonly xpDelta: number;
  readonly level: number;
  readonly leveledUp: boolean;
  /** What earned it — the task or habit name. */
  readonly label?: string;
}

interface RewardContextValue {
  celebrate: (event: RewardEvent) => void;
}

const RewardContext = createContext<RewardContextValue | null>(null);

/**
 * Safe to call from anywhere inside the app shell. Returns a no-op outside a
 * provider so a component can celebrate without knowing whether it happens to
 * be mounted inside one.
 */
export function useReward(): RewardContextValue {
  return useContext(RewardContext) ?? NO_REWARD;
}

const NO_REWARD: RewardContextValue = { celebrate: () => {} };

/** Consecutive finishes inside this window build a combo. */
const COMBO_WINDOW_MS = 9000;
const BURST_LIFETIME_MS = 1100;
const LEVEL_UP_LIFETIME_MS = 3400;

export function RewardProvider({ children }: { children: ReactNode }) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [levelUp, setLevelUp] = useState<LevelUp | null>(null);
  const [combo, setCombo] = useState(0);

  const nextId = useRef(0);
  const lastAwardAt = useRef(0);
  const comboTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Where the pointer last went down. Any control that awards XP was just
  // activated, so this is where the reward belongs — no component has to
  // thread coordinates through to get its burst in the right place.
  const pointer = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const remember = (event: PointerEvent) => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener("pointerdown", remember, { passive: true });
    return () => window.removeEventListener("pointerdown", remember);
  }, []);

  useEffect(() => () => clearTimeout(comboTimer.current), []);

  const celebrate = useCallback((event: RewardEvent) => {
    if (!Number.isFinite(event.xpDelta) || event.xpDelta === 0) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // -- combo --------------------------------------------------------------
    // Only gains build one. Undoing something is not a rhythm.
    if (event.xpDelta > 0) {
      const now = performance.now();
      const within = now - lastAwardAt.current < COMBO_WINDOW_MS;
      lastAwardAt.current = now;

      setCombo((current) => (within ? current + 1 : 1));
      clearTimeout(comboTimer.current);
      comboTimer.current = setTimeout(() => setCombo(0), COMBO_WINDOW_MS);
    }

    // -- the amount, where it was earned -------------------------------------
    if (!reduced) {
      const id = nextId.current++;
      const origin = pointer.current ?? {
        x: window.innerWidth / 2,
        y: window.innerHeight * 0.4,
      };

      setBursts((current) => [
        // Bounded: a held-down key or a very fast hand should not accumulate
        // layers faster than they expire.
        ...current.slice(-5),
        { id, amount: event.xpDelta, x: origin.x, y: origin.y },
      ]);
      setTimeout(
        () => setBursts((current) => current.filter((burst) => burst.id !== id)),
        BURST_LIFETIME_MS,
      );
    }

    // -- the level -----------------------------------------------------------
    if (event.leveledUp) {
      setLevelUp({ level: event.level, label: event.label });
      setTimeout(() => setLevelUp(null), LEVEL_UP_LIFETIME_MS);
    }
  }, []);

  const value = useMemo<RewardContextValue>(() => ({ celebrate }), [celebrate]);

  return (
    <RewardContext.Provider value={value}>
      {children}
      <XpBurstLayer bursts={bursts} />
      <ComboBadge count={combo} />
      <LevelUpOverlay levelUp={levelUp} />
    </RewardContext.Provider>
  );
}
