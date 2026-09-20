import { PRIORITY_CONFIG } from "@/config/priorities";
import type { Priority } from "@/generated/prisma/enums";

/**
 * XP rules.
 *
 * The *default* reward comes from priority, but the value is persisted on the
 * task (`Task.xpReward`) so it can be tuned per task and so historical rewards
 * survive a future rebalance of the defaults.
 *
 * The server always reads the reward back from the stored row when completing
 * a task. A client-supplied XP value is only ever accepted at create/update
 * time, and only after passing `validateXpReward`.
 */

/** Hard ceiling on a single task's reward — bounds any attempt to inflate XP. */
export const MAX_XP_REWARD = 1000;
export const MIN_XP_REWARD = 0;

export function getDefaultXpForPriority(priority: Priority): number {
  return PRIORITY_CONFIG[priority].defaultXp;
}

/**
 * Clamp an arbitrary number into the allowed reward range.
 *
 * Non-finite input (NaN, Infinity) fails *closed* to 0 rather than to the cap:
 * a garbage value is not a request for the maximum reward, and this function is
 * the last line of defence on a number that feeds the XP ledger.
 */
export function clampXpReward(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_XP_REWARD, Math.max(MIN_XP_REWARD, Math.floor(value)));
}

/**
 * Resolve the reward to persist.
 *
 * `undefined`/`null` means "follow the priority default" — which also means a
 * task that has never been customised keeps tracking the default when its
 * priority changes.
 */
export function resolveXpReward(priority: Priority, requested: number | null | undefined): number {
  if (requested === null || requested === undefined) return getDefaultXpForPriority(priority);
  return clampXpReward(requested);
}

export function formatXp(amount: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(amount));
}

/** `+40 XP` / `−40 XP`, using a real minus sign. */
export function formatXpDelta(amount: number): string {
  const sign = amount < 0 ? "−" : "+";
  return `${sign}${formatXp(Math.abs(amount))} XP`;
}
