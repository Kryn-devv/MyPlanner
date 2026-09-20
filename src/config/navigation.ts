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
  /** 1 = shipped in Phase 1. Anything higher renders a "coming soon" page. */
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
      {
        label: "Calendar",
        href: "/app/calendar",
        icon: CalendarDays,
        phase: 2,
        summary: "Your tasks, events and meetings on one timeline.",
      },
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
      {
        label: "Projects",
        href: "/app/projects",
        icon: FolderKanban,
        phase: 2,
        summary: "Group related tasks into work with a beginning and an end.",
      },
      {
        label: "Goals",
        href: "/app/goals",
        icon: Target,
        phase: 2,
        summary: "Outcomes worth aiming at, broken into milestones.",
      },
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

/**
 * Quick-add actions.
 *
 * Only `task` is enabled in Phase 1. The others are listed but disabled so the
 * menu does not have to be redesigned when they land — and so the intent of
 * the product is legible from the start.
 */
export interface QuickAction {
  readonly id: "task" | "event" | "meeting" | "project" | "goal" | "habit" | "note";
  readonly label: string;
  readonly icon: LucideIcon;
  readonly enabled: boolean;
  readonly shortcut?: string;
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: "task", label: "Task", icon: CheckSquare, enabled: true, shortcut: "N" },
  { id: "event", label: "Event", icon: CalendarDays, enabled: false },
  { id: "meeting", label: "Meeting", icon: Users, enabled: false },
  { id: "project", label: "Project", icon: FolderKanban, enabled: false },
  { id: "goal", label: "Goal", icon: Target, enabled: false },
  { id: "habit", label: "Habit", icon: Repeat, enabled: false },
  { id: "note", label: "Note", icon: NotebookPen, enabled: false },
];
