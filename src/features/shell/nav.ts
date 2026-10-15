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
  /** The icon's own colours (light to deep), like an app icon. Not tied to the accent. */
  tint: [string, string]
}

export const NAV: NavItem[] = [
  { key: "overview", href: "/", label: "Overview", icon: LayoutDashboard, phase: 1, shortcut: "o", ready: true, group: "Core", tint: ["oklch(0.72 0.17 295)", "oklch(0.5 0.22 278)"] },
  { key: "today", href: "/today", label: "My Day", icon: Sun, phase: 1, shortcut: "d", ready: true, group: "Core", tint: ["oklch(0.86 0.16 85)", "oklch(0.7 0.19 50)"] },
  { key: "tasks", href: "/tasks", label: "Tasks", icon: SquareCheckBig, phase: 1, shortcut: "t", ready: true, group: "Core", tint: ["oklch(0.8 0.12 225)", "oklch(0.55 0.2 260)"] },
  { key: "calendar", href: "/calendar", label: "Calendar", icon: CalendarDays, phase: 1, shortcut: "c", ready: true, group: "Core", tint: ["oklch(0.75 0.16 12)", "oklch(0.58 0.22 20)"] },
  { key: "goals", href: "/goals", label: "Goals", icon: Target, phase: 2, ready: true, group: "Growth", tint: ["oklch(0.78 0.15 345)", "oklch(0.56 0.24 330)"] },
  { key: "habits", href: "/habits", label: "Habits", icon: Repeat, phase: 1, shortcut: "h", ready: true, group: "Growth", tint: ["oklch(0.83 0.15 160)", "oklch(0.6 0.15 162)"] },
  { key: "focus", href: "/focus", label: "Focus", icon: Timer, phase: 1, shortcut: "f", ready: true, group: "Growth", tint: ["oklch(0.84 0.12 200)", "oklch(0.6 0.12 190)"] },
  { key: "notes", href: "/notes", label: "Second Brain", icon: Brain, phase: 3, ready: false, group: "Knowledge", tint: ["oklch(0.76 0.15 305)", "oklch(0.52 0.22 295)"] },
  { key: "projects", href: "/projects", label: "Projects", icon: FolderKanban, phase: 2, shortcut: "p", ready: true, group: "Knowledge", tint: ["oklch(0.84 0.12 60)", "oklch(0.65 0.18 42)"] },
  { key: "finance", href: "/finance", label: "Finances", icon: Wallet, phase: 4, ready: false, group: "Life", tint: ["oklch(0.88 0.17 125)", "oklch(0.62 0.17 145)"] },
  { key: "analytics", href: "/analytics", label: "Analytics", icon: ChartColumn, phase: 1, shortcut: "a", ready: true, group: "Life", tint: ["oklch(0.74 0.13 270)", "oklch(0.47 0.2 268)"] },
  { key: "settings", href: "/settings", label: "Settings", icon: Settings, phase: 1, shortcut: "s", ready: true, group: "Life", tint: ["oklch(0.78 0.02 255)", "oklch(0.52 0.03 260)"] },
]

export function navForPath(pathname: string): NavItem {
  if (pathname === "/") return NAV[0]
  return NAV.find((n) => n.href !== "/" && pathname.startsWith(n.href)) ?? NAV[0]
}
