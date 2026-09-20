import type { Metadata } from "next";
import { Flag } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { findNavItem } from "@/config/navigation";

export const metadata: Metadata = { title: "Deadlines" };

/**
 * Placeholder route. Copy comes from the navigation config so the sidebar and
 * this page can never disagree about what Deadlines is for.
 */
export default function DeadlinesPage() {
  const item = findNavItem("/app/deadlines");
  return <ComingSoon title="Deadlines" summary={item?.summary} icon={Flag} />;
}
