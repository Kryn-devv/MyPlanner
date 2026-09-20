"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MOBILE_NAV_ITEMS } from "@/config/navigation";
import { cn } from "@/lib/cn";
import { isActive } from "./Sidebar";

/**
 * Bottom navigation for small screens.
 *
 * Three destinations, each a large tap target, sitting above the home
 * indicator via `env(safe-area-inset-bottom)`.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-base/95 backdrop-blur-lg lg:hidden"
    >
      <ul className="flex items-stretch pb-[env(safe-area-inset-bottom)]">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium transition-colors",
                  active ? "text-ink" : "text-ink-faint",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-[30%] top-0 h-[2px] rounded-b bg-accent transition-opacity",
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
                <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
