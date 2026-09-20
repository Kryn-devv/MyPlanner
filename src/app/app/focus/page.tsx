import type { Metadata } from "next";
import { Timer } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { findNavItem } from "@/config/navigation";

export const metadata: Metadata = { title: "Focus" };

/**
 * Placeholder route. Copy comes from the navigation config so the sidebar and
 * this page can never disagree about what Focus is for.
 */
export default function FocusPage() {
  const item = findNavItem("/app/focus");
  return <ComingSoon title="Focus" summary={item?.summary} icon={Timer} />;
}
