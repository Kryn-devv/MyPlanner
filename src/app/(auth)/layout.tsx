import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME, APP_TAGLINE } from "@/config/app";
import { BrandMark } from "@/components/layout/Sidebar";

/**
 * Shell for the signed-out routes.
 *
 * It does not bounce signed-in visitors itself: the reset-password page must
 * render for them, and a layout cannot tell which page it wraps. The pages
 * that should send a signed-in visitor on to the app say so themselves.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2.5 rounded">
        <BrandMark className="h-8 w-8" />
        <span className="text-base font-semibold tracking-tight text-ink">{APP_NAME}</span>
      </Link>

      <div className="w-full max-w-[25rem]">{children}</div>

      <p className="mt-8 text-center text-[0.75rem] text-ink-faint">{APP_TAGLINE}</p>
    </main>
  );
}
