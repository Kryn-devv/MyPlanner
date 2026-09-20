import { Skeleton } from "@/components/ui/States";

/** Mirrors the real grid so content arriving does not reflow the page. */
export default function GoalsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-2 h-7 w-28" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-32" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="panel p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-7 w-7 shrink-0 rounded-[8px]" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <div className="flex gap-1.5 pt-1">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-24 rounded-full" />
                </div>
                <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
