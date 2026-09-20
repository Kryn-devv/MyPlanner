import { LoadingPanel } from "@/components/ui/States";

/** Streams the shell while the range is read. */
export default function CalendarLoading() {
  return <LoadingPanel label="Loading calendar…" />;
}
