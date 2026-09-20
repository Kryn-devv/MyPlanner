import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { findNavItem } from "@/config/navigation";

export const metadata: Metadata = { title: "Projects" };

/**
 * Placeholder route. Copy comes from the navigation config so the sidebar and
 * this page can never disagree about what Projects is for.
 */
export default function ProjectsPage() {
  const item = findNavItem("/app/projects");
  return <ComingSoon title="Projects" summary={item?.summary} icon={FolderKanban} />;
}
