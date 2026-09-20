import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { findNavItem } from "@/config/navigation";

export const metadata: Metadata = { title: "Meetings" };

/**
 * Placeholder route. Copy comes from the navigation config so the sidebar and
 * this page can never disagree about what Meetings is for.
 */
export default function MeetingsPage() {
  const item = findNavItem("/app/meetings");
  return <ComingSoon title="Meetings" summary={item?.summary} icon={Users} />;
}
