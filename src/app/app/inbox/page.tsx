import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { findNavItem } from "@/config/navigation";

export const metadata: Metadata = { title: "Inbox" };

/**
 * Placeholder route. Copy comes from the navigation config so the sidebar and
 * this page can never disagree about what Inbox is for.
 */
export default function InboxPage() {
  const item = findNavItem("/app/inbox");
  return <ComingSoon title="Inbox" summary={item?.summary} icon={Inbox} />;
}
