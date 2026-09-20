import { getCategoryColor } from "@/config/categories";
import { cn } from "@/lib/cn";

export interface CategoryBadgeProps {
  name: string;
  color: string;
  className?: string;
}

export function CategoryBadge({ name, color, className }: CategoryBadgeProps) {
  const token = getCategoryColor(color);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-medium",
        token.badgeClass,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", token.dotClass)} />
      <span className="sr-only">Category: </span>
      {name}
    </span>
  );
}

/** Small colour dot used in dense lists and select menus. */
export function CategoryDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-2 w-2 shrink-0 rounded-full", getCategoryColor(color).dotClass, className)}
    />
  );
}
