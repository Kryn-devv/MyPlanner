import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonClassName } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="relative z-10 grid min-h-dvh place-items-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div
          aria-hidden="true"
          className="grid h-12 w-12 place-items-center rounded-full border border-line bg-white/[0.02]"
        >
          <Compass className="h-5 w-5 text-ink-faint" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-ink">Page not found</h1>
        <p className="text-[0.875rem] leading-relaxed text-ink-muted">
          That page does not exist, or you do not have access to it.
        </p>
        <Link href="/app" className={buttonClassName({ variant: "secondary", size: "sm", className: "mt-2" })}>
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
