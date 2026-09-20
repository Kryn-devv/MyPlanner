import type { Metadata } from "next";
import { NotebookPen } from "lucide-react";
import { ComingSoon } from "@/components/layout/ComingSoon";
import { findNavItem } from "@/config/navigation";

export const metadata: Metadata = { title: "Notes" };

/**
 * Placeholder route. Copy comes from the navigation config so the sidebar and
 * this page can never disagree about what Notes is for.
 */
export default function NotesPage() {
  const item = findNavItem("/app/notes");
  return <ComingSoon title="Notes" summary={item?.summary} icon={NotebookPen} />;
}
