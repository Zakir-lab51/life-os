import {
  Brain,
  CalendarDays,
  ChartColumn,
  FolderKanban,
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
  | "notes" | "projects" | "finance" | "analytics" | "settings"

export interface NavItem {
  key: NavKey
  href: string
  label: string
  icon: LucideIcon
  /** The build phase the module belongs to. */
  phase: 1 | 2 | 3 | 4
  /** False while a module is still to come: it shows a plain "planned" page and a phase badge. */
  ready: boolean
  /** Second key after "g" for go-to shortcuts. */
  shortcut?: string
  group: "Core" | "Growth" | "Knowledge" | "Life"
}

export const NAV: NavItem[] = [
  { key: "overview", href: "/", label: "Overview", icon: LayoutDashboard, phase: 1, shortcut: "o", ready: true, group: "Core" },
  { key: "today", href: "/today", label: "My Day", icon: Sun, phase: 1, shortcut: "d", ready: true, group: "Core" },
  { key: "tasks", href: "/tasks", label: "Tasks", icon: SquareCheckBig, phase: 1, shortcut: "t", ready: true, group: "Core" },
  { key: "calendar", href: "/calendar", label: "Calendar", icon: CalendarDays, phase: 1, shortcut: "c", ready: true, group: "Core" },
  { key: "goals", href: "/goals", label: "Goals", icon: Target, phase: 2, ready: true, group: "Growth" },
  { key: "habits", href: "/habits", label: "Habits", icon: Repeat, phase: 1, shortcut: "h", ready: true, group: "Growth" },
  { key: "focus", href: "/focus", label: "Focus", icon: Timer, phase: 1, shortcut: "f", ready: true, group: "Growth" },
  { key: "notes", href: "/notes", label: "Second Brain", icon: Brain, phase: 3, ready: false, group: "Knowledge" },
  { key: "projects", href: "/projects", label: "Projects", icon: FolderKanban, phase: 2, ready: false, group: "Knowledge" },
  { key: "finance", href: "/finance", label: "Finances", icon: Wallet, phase: 4, ready: false, group: "Life" },
  { key: "analytics", href: "/analytics", label: "Analytics", icon: ChartColumn, phase: 1, shortcut: "a", ready: true, group: "Life" },
  { key: "settings", href: "/settings", label: "Settings", icon: Settings, phase: 1, shortcut: "s", ready: true, group: "Life" },
]

export function navForPath(pathname: string): NavItem {
  if (pathname === "/") return NAV[0]
  return NAV.find((n) => n.href !== "/" && pathname.startsWith(n.href)) ?? NAV[0]
}
