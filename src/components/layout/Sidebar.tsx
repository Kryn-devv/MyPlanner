"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { APP_NAME } from "@/config/app";
import { NAV_SECTIONS, SETTINGS_ITEM, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/cn";
import type { LevelProgress } from "@/lib/leveling";
import { XpProgress } from "@/components/xp/XpProgress";

/**
 * Desktop navigation.
 *
 * Phase 2 destinations are shown with a lock rather than hidden: the roadmap
 * is part of the product's story, and the layout does not have to be
 * rebalanced every time one ships.
 */
export function Sidebar({ progress, className }: { progress: LevelProgress; className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className={cn(
        "flex h-dvh w-60 shrink-0 flex-col border-r border-line bg-base/80 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-line px-5">
        <BrandMark />
        <span className="text-[0.9375rem] font-semibold tracking-tight text-ink">{APP_NAME}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-5 last:mb-0">
            <p className="eyebrow px-2.5 pb-1.5">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={isActive(pathname, item.href)} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        <div className="px-2.5 pb-3">
          <XpProgress progress={progress} variant="compact" />
        </div>
        <NavLink item={SETTINGS_ITEM} active={isActive(pathname, SETTINGS_ITEM.href)} />
      </div>
    </nav>
  );
}

/**
 * `/app` must match exactly; every other route matches its subtree, so
 * `/app/tasks/anything` still highlights Tasks.
 */
export function isActive(pathname: string, href: Route): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  const locked = item.phase > 1;

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-[0.4375rem] text-[0.8125rem] transition-colors duration-150",
        active ? "bg-white/[0.06] font-medium text-ink" : "text-ink-muted hover:bg-white/[0.035] hover:text-ink",
        locked && !active && "text-ink-faint",
      )}
    >
      {/* The active indicator is a shape, not just a colour change. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute -left-3 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r bg-accent transition-opacity duration-150",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate">{item.label}</span>
      {locked && (
        <>
          <Lock className="h-3 w-3 shrink-0 opacity-50" aria-hidden="true" />
          <span className="sr-only">(coming in a future phase)</span>
        </>
      )}
    </Link>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-gradient-to-br from-accent to-[var(--color-xp-to)] shadow-[0_2px_10px_-2px_oklch(62%_0.17_288/60%)]",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-white">
        <path
          d="M8 1.5 9.7 6.3 14.5 8 9.7 9.7 8 14.5 6.3 9.7 1.5 8l4.8-1.7z"
          fill="currentColor"
          opacity="0.95"
        />
      </svg>
    </span>
  );
}
