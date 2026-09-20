import type { Metadata } from "next";
import { Target } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { findNavItem } from "@/config/navigation";

export const metadata: Metadata = { title: "Goals" };

/**
 * Placeholder route. Copy comes from the navigation config so the sidebar and
 * this page can never disagree about what Goals is for.
 */
export default function GoalsPage() {
  const item = findNavItem("/app/goals");
  return <ComingSoon title="Goals" summary={item?.summary} icon={Target} />;
}
