import { LoadingState, Skeleton } from "@/components/ui/States";

export default function ProjectDetailLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-24" />

      <div className="flex items-start gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-[9px]" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-72 max-w-full" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>

      <div className="panel space-y-4 p-5">
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-7 w-40" />
        <div className="grid grid-cols-2 gap-3 border-t border-line pt-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="panel p-4">
            <div className="flex gap-3">
              <Skeleton className="h-[18px] w-[18px] shrink-0 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-1.5 w-64 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel p-3">
        <LoadingState label="Loading project tasks" rows={3} />
      </div>
    </div>
  );
}
