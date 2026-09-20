import type { Metadata } from "next";
import { Repeat } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { findNavItem } from "@/config/navigation";

export const metadata: Metadata = { title: "Habits" };

/**
 * Placeholder route. Copy comes from the navigation config so the sidebar and
 * this page can never disagree about what Habits is for.
 */
export default function HabitsPage() {
  const item = findNavItem("/app/habits");
  return <ComingSoon title="Habits" summary={item?.summary} icon={Repeat} />;
}
