import { Skeleton } from "@/components/ui/States";

/** Mirrors the page's shape so the timer does not jump when it lands. */
export default function FocusLoading() {
  return (
    <div
      className="mx-auto flex max-w-xl flex-col items-center gap-8 py-12"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading focus mode…</span>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-6 w-56" />
      <Skeleton className="h-14 w-44" />
      <Skeleton className="h-1 w-72 rounded-full" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28 rounded-[var(--radius-control)]" />
        <Skeleton className="h-9 w-40 rounded-[var(--radius-control)]" />
      </div>
    </div>
  );
}
