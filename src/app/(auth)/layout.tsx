import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { APP_NAME, APP_TAGLINE } from "@/config/app";
import { getCurrentUser } from "@/lib/auth/session";
import { BrandMark } from "@/components/layout/Sidebar";

/**
 * Shell for the signed-out routes.
 *
 * Bounces an already-authenticated visitor into the app so the back button
 * cannot land them on a login form they do not need.
 */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (user) redirect("/app");

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
