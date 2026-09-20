import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { findNavItem } from "@/config/navigation";

export const metadata: Metadata = { title: "Timeline" };

/**
 * Placeholder route. Copy comes from the navigation config so the sidebar and
 * this page can never disagree about what Timeline is for.
 */
export default function TimelinePage() {
  const item = findNavItem("/app/timeline");
  return <ComingSoon title="Timeline" summary={item?.summary} icon={Clock} />;
}
