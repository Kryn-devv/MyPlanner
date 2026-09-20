import { LoadingState, Skeleton } from "@/components/ui/States";

export default function TasksLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-8 w-32" />
      </div>

      <LoadingState label="Loading tasks" rows={6} />
    </div>
  );
}
