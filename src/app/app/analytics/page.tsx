import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { findNavItem } from "@/config/navigation";

export const metadata: Metadata = { title: "Analytics" };

/**
 * Placeholder route. Copy comes from the navigation config so the sidebar and
 * this page can never disagree about what Analytics is for.
 */
export default function AnalyticsPage() {
  const item = findNavItem("/app/analytics");
  return <ComingSoon title="Analytics" summary={item?.summary} icon={BarChart3} />;
}
