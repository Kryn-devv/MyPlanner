/**
 * Conditional className joiner.
 *
 * Deliberately not `clsx` + `tailwind-merge`: the components in this app own
 * their class strings and do not need conflict resolution, so a four-line
 * helper does the whole job without two dependencies.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(" ");
}
