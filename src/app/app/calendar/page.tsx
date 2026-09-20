import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { findNavItem } from "@/config/navigation";

export const metadata: Metadata = { title: "Calendar" };

/**
 * Placeholder route. Copy comes from the navigation config so the sidebar and
 * this page can never disagree about what Calendar is for.
 */
export default function CalendarPage() {
  const item = findNavItem("/app/calendar");
  return <ComingSoon title="Calendar" summary={item?.summary} icon={CalendarDays} />;
}
