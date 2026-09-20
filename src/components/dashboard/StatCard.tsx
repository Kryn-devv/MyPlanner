import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A single headline figure.
 *
 * The value is rendered with tabular figures so a counter ticking from 9 to 10
 * does not shift the layout.
 */
export interface StatCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  detail?: ReactNode;
  icon?: LucideIcon;
  iconClassName?: string;
  children?: ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  unit,
  detail,
  icon: Icon,
  iconClassName,
  children,
  className,
}: StatCardProps) {
  return (
    <div className={cn("panel flex flex-col justify-between p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow">{label}</p>
        {Icon && <Icon className={cn("h-4 w-4 text-ink-faint", iconClassName)} aria-hidden="true" />}
      </div>

      <div className="mt-4">
        <p className="flex items-baseline gap-1.5">
          <span className="tnum text-[2rem] font-semibold leading-none tracking-tight text-ink">
            {value}
          </span>
          {unit && <span className="text-sm text-ink-muted">{unit}</span>}
        </p>
        {detail && <div className="mt-2 text-[0.75rem] text-ink-faint">{detail}</div>}
      </div>

      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
