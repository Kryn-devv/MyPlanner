import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { findNavItem } from "@/config/navigation";

export const metadata: Metadata = { title: "Achievements" };

/**
 * Placeholder route. Copy comes from the navigation config so the sidebar and
 * this page can never disagree about what Achievements is for.
 */
export default function AchievementsPage() {
  const item = findNavItem("/app/achievements");
  return <ComingSoon title="Achievements" summary={item?.summary} icon={Trophy} />;
}
