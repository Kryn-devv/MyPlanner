import type { Route } from "next";
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  Clock,
  Flag,
  FolderKanban,
  Inbox,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  Repeat,
  Settings,
  Target,
  Timer,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Navigation is data, not markup.
 *
 * Phase 2+ destinations are listed here from day one with `phase: 2`. They
 * render as real, reachable routes that explain what is coming rather than
 * being hidden — the shape of the product is visible, and shipping a feature
 * becomes a matter of flipping one flag and replacing one page body.
 */

export interface NavItem {
  readonly label: string;
  /** Typed against the app's real routes, so a dead link fails the build. */
  readonly href: Route;
  readonly icon: LucideIcon;
  /**
   * 1 = shipped and reachable. Anything higher renders a "coming soon" page
   * and shows a lock in the sidebar. Projects moved from 2 to 1 in Phase 2.
   */
  readonly phase: 1 | 2;
  /** Short line shown on the placeholder page. */
  readonly summary?: string;
}

export interface NavSection {
  readonly title: string;
  readonly items: readonly NavItem[];
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    title: "Plan",
    items: [
      { label: "Dashboard", href: "/app", icon: LayoutDashboard, phase: 1 },
      { label: "Tasks", href: "/app/tasks", icon: CheckSquare, phase: 1 },
      {
        label: "Inbox",
        href: "/app/inbox",
        icon: Inbox,
        phase: 2,
        summary: "A single place for everything captured but not yet sorted.",
      },
      // Phase 4.1: a view over the dates that already exist on tasks,
      // milestones, projects and goals — not a store of its own.
      { label: "Calendar", href: "/app/calendar", icon: CalendarDays, phase: 1 },
      {
        label: "Timeline",
        href: "/app/timeline",
        icon: Clock,
        phase: 2,
        summary: "Time-block your day and see where the hours actually go.",
      },
      {
        label: "Deadlines",
        href: "/app/deadlines",
        icon: Flag,
        phase: 2,
        summary: "Every commitment with a date, ordered by what bites first.",
      },
    ],
  },
  {
    title: "Build",
    items: [
      { label: "Projects", href: "/app/projects", icon: FolderKanban, phase: 1 },
      { label: "Goals", href: "/app/goals", icon: Target, phase: 1 },
      {
        label: "Habits",
        href: "/app/habits",
        icon: Repeat,
        phase: 2,
        summary: "The things you want to do repeatedly, tracked over time.",
      },
      {
        label: "Focus",
        href: "/app/focus",
        icon: Timer,
        phase: 2,
        summary: "Timed deep-work sessions that log against your tasks.",
      },
      {
        label: "Meetings",
        href: "/app/meetings",
        icon: Users,
        phase: 2,
        summary: "Agendas, attendees and the follow-ups that come out of them.",
      },
      {
        label: "Notes",
        href: "/app/notes",
        icon: NotebookPen,
        phase: 2,
        summary: "Thinking space that links back to the work it belongs to.",
      },
    ],
  },
  {
    title: "Review",
    items: [
      {
        label: "Analytics",
        href: "/app/analytics",
        icon: BarChart3,
        phase: 2,
        summary: "Where your time and attention actually went.",
      },
      {
        label: "Achievements",
        href: "/app/achievements",
        icon: Trophy,
        phase: 2,
        summary: "Milestones worth marking on the way up the levels.",
      },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  label: "Settings",
  href: "/app/settings",
  icon: Settings,
  phase: 1,
};

/** Bottom bar on mobile. Four destinations is the most that stays tappable. */
export const MOBILE_NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard", href: "/app", icon: LayoutDashboard, phase: 1 },
  { label: "Tasks", href: "/app/tasks", icon: ListChecks, phase: 1 },
  SETTINGS_ITEM,
];

const ALL_ITEMS: readonly NavItem[] = [
  ...NAV_SECTIONS.flatMap((section) => section.items),
  SETTINGS_ITEM,
];

export function findNavItem(href: Route): NavItem | undefined {
  return ALL_ITEMS.find((item) => item.href === href);
}
