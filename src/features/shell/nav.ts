import {
  Brain,
  CalendarDays,
  ChartColumn,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  Repeat,
  Settings,
  SquareCheckBig,
  Sun,
  Target,
  Timer,
  Wallet,
  type LucideIcon,
} from "lucide-react"

export type NavKey =
  | "overview" | "today" | "tasks" | "calendar" | "goals" | "habits" | "focus"
  | "notes" | "study" | "projects" | "finance" | "analytics" | "settings"

export interface NavItem {
  key: NavKey
  href: string
  label: string
  icon: LucideIcon
  /** Build phase. Phase 1 modules work today; later ones are clearly labelled as planned. */
  phase: 1 | 2 | 3 | 4
  /** Second key after "g" for go-to shortcuts. */
  shortcut?: string
  group: "Core" | "Growth" | "Knowledge" | "Life"
}

export const NAV: NavItem[] = [
  { key: "overview", href: "/", label: "Overview", icon: LayoutDashboard, phase: 1, shortcut: "o", group: "Core" },
  { key: "today", href: "/today", label: "My Day", icon: Sun, phase: 1, shortcut: "d", group: "Core" },
  { key: "tasks", href: "/tasks", label: "Tasks", icon: SquareCheckBig, phase: 1, shortcut: "t", group: "Core" },
  { key: "calendar", href: "/calendar", label: "Calendar", icon: CalendarDays, phase: 1, shortcut: "c", group: "Core" },
  { key: "goals", href: "/goals", label: "Goals", icon: Target, phase: 2, group: "Growth" },
  { key: "habits", href: "/habits", label: "Habits", icon: Repeat, phase: 1, shortcut: "h", group: "Growth" },
  { key: "focus", href: "/focus", label: "Focus", icon: Timer, phase: 1, shortcut: "f", group: "Growth" },
  { key: "notes", href: "/notes", label: "Second Brain", icon: Brain, phase: 3, group: "Knowledge" },
  { key: "study", href: "/study", label: "Study Hub", icon: GraduationCap, phase: 3, group: "Knowledge" },
  { key: "projects", href: "/projects", label: "Projects", icon: FolderKanban, phase: 2, group: "Knowledge" },
  { key: "finance", href: "/finance", label: "Finances", icon: Wallet, phase: 4, group: "Life" },
  { key: "analytics", href: "/analytics", label: "Analytics", icon: ChartColumn, phase: 1, shortcut: "a", group: "Life" },
  { key: "settings", href: "/settings", label: "Settings", icon: Settings, phase: 1, shortcut: "s", group: "Life" },
]

export function navForPath(pathname: string): NavItem {
  if (pathname === "/") return NAV[0]
  return NAV.find((n) => n.href !== "/" && pathname.startsWith(n.href)) ?? NAV[0]
}
