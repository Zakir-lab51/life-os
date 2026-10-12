"use client"

import { Bell, CalendarClock, ChevronLeft, Database, Info, LayoutGrid, ListChecks, Palette, Search, Target, Timer, User, X, Zap, type LucideIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader, PageTransition } from "@/components/os/page-header"
import { Panel } from "@/components/os/panel"
import { ProfileAvatar } from "@/components/os/profile-avatar"
import { usePrefs } from "@/lib/db/hooks"
import type { Prefs } from "@/lib/domain/types"
import { SPRING_SNAPPY } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { useLife, useXP } from "@/features/shell/use-life"
import { DataPane } from "./data-pane"
import { AboutPane, AppearancePane, DashboardPane, FocusPane, NotificationsPane, ProfilePane, QuickAddPane, RoutinesPane, SchedulePane, TargetsPane } from "./panes"
import { IconTile } from "./settings-ui"

/*
  Settings, after Apple's System Settings: a sidebar of categories (with search) and one
  category at a time on the right. On narrow screens the list comes first and a category
  opens over it with a back button. The open category lives in the URL hash, so links
  such as /settings#targets keep working; links to a category while Settings is already
  open send a "life-os:settings" event (see the + menu).
*/

type PaneId = "profile" | "appearance" | "notifications" | "focus" | "schedule" | "targets" | "routines" | "dashboard" | "quick-actions" | "data" | "about"

interface PaneMeta {
  id: PaneId
  label: string
  icon: LucideIcon
  color: string
  description: string
}

const PANES: PaneMeta[] = [
  { id: "profile", label: "Profile", icon: User, color: "#8e8e93", description: "Your name, goals and interests." },
  { id: "appearance", label: "Appearance", icon: Palette, color: "#0a84ff", description: "Theme, motion and the whole look of LIFE OS." },
  { id: "notifications", label: "Notifications", icon: Bell, color: "#ff3b30", description: "What LIFE OS tells you about, and how." },
  { id: "focus", label: "Focus timer", icon: Timer, color: "#5e5ce6", description: "Session lengths, breaks and your daily target." },
  { id: "schedule", label: "Day & week", icon: CalendarClock, color: "#ff9500", description: "The hours of your day and how weeks are counted." },
  { id: "targets", label: "Weekly targets", icon: Target, color: "#34c759", description: "What a good week looks like." },
  { id: "routines", label: "Routines", icon: ListChecks, color: "#30b0c7", description: "Checklists that appear in My Day every morning and evening." },
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid, color: "#af52de", description: "Choose what the Overview shows." },
  { id: "quick-actions", label: "Quick add", icon: Zap, color: "#ff9f0a", description: "What the + button in the top bar offers." },
  { id: "data", label: "Data & backup", icon: Database, color: "#636366", description: "Everything lives in this browser. Back it up, restore it, or start fresh." },
  { id: "about", label: "About", icon: Info, color: "#636366", description: "Version, roadmap and shortcuts." },
]
const META = Object.fromEntries(PANES.map((p) => [p.id, p])) as Record<PaneId, PaneMeta>
const SIDEBAR_GROUPS: PaneId[][] = [
  ["appearance", "notifications", "focus"],
  ["schedule", "targets", "routines"],
  ["dashboard", "quick-actions"],
  ["data", "about"],
]

/** Every setting you can search for, and the row it lives in (an element id). */
const SEARCH: { pane: PaneId; label: string; anchor?: string; keywords: string }[] = [
  { pane: "profile", label: "Name", anchor: "s-name", keywords: "profile you me" },
  { pane: "profile", label: "Life goals", anchor: "s-goals", keywords: "goals ambitions" },
  { pane: "appearance", label: "Theme", anchor: "s-theme", keywords: "dark light auto system mode" },
  { pane: "appearance", label: "Reduce motion", anchor: "s-motion", keywords: "animation motion accessibility" },
  { pane: "appearance", label: "Looks", anchor: "s-looks", keywords: "preset violet ocean aurora ember rose mono accent colour color" },
  { pane: "appearance", label: "Font", anchor: "s-font", keywords: "typeface type text" },
  { pane: "appearance", label: "Background", anchor: "s-background", keywords: "wallpaper photo image liquid flow" },
  { pane: "notifications", label: "Task reminders", anchor: "s-reminders", keywords: "alerts alarms" },
  { pane: "notifications", label: "Focus session alerts", anchor: "s-focus-alerts", keywords: "timer end break" },
  { pane: "notifications", label: "Achievements", anchor: "s-achievements", keywords: "levels milestones celebrate" },
  { pane: "notifications", label: "System notifications", anchor: "s-system-notifications", keywords: "browser permission desktop push" },
  { pane: "focus", label: "Focus preset", anchor: "s-focus-preset", keywords: "pomodoro deep work flow flexible" },
  { pane: "focus", label: "Focus and break lengths", anchor: "s-durations", keywords: "session duration short long break minutes" },
  { pane: "focus", label: "Daily focus target", anchor: "s-daily-target", keywords: "goal minutes" },
  { pane: "focus", label: "Start breaks automatically", anchor: "s-autostart", keywords: "auto start" },
  { pane: "schedule", label: "Day hours", anchor: "s-day-hours", keywords: "start end wake sleep time" },
  { pane: "schedule", label: "Week starts on", anchor: "s-week-start", keywords: "monday sunday calendar" },
  { pane: "targets", label: "Weekly targets", anchor: "s-targets", keywords: "tasks focus habits goal week" },
  { pane: "routines", label: "Morning routine", anchor: "s-morning", keywords: "checklist steps" },
  { pane: "routines", label: "Evening routine", anchor: "s-evening", keywords: "checklist steps night" },
  { pane: "dashboard", label: "Dashboard widgets", anchor: "s-widgets", keywords: "overview cards" },
  { pane: "dashboard", label: "Life Balance areas", anchor: "s-balance", keywords: "radar dimensions" },
  { pane: "quick-actions", label: "Quick add menu", anchor: "s-quick-add", keywords: "plus button actions" },
  { pane: "data", label: "Storage", anchor: "s-storage", keywords: "space size protect persist" },
  { pane: "data", label: "Download backup", anchor: "s-backup", keywords: "export json save" },
  { pane: "data", label: "Restore from backup", anchor: "s-restore", keywords: "import upload" },
  { pane: "data", label: "Export tasks as CSV", anchor: "s-csv", keywords: "spreadsheet excel" },
  { pane: "data", label: "Demo data", anchor: "s-demo", keywords: "sample example" },
  { pane: "data", label: "Run setup again", anchor: "s-setup", keywords: "onboarding welcome" },
  { pane: "data", label: "Delete all data", anchor: "s-delete", keywords: "wipe erase reset clear" },
  { pane: "about", label: "Roadmap", anchor: "s-roadmap", keywords: "phases version" },
  { pane: "about", label: "Keyboard shortcuts", anchor: "s-shortcuts", keywords: "keys hotkeys" },
]

const isPane = (v: string): v is PaneId => v in META
const paneFromHash = (): PaneId | null => {
  const h = typeof window === "undefined" ? "" : decodeURIComponent(window.location.hash.slice(1))
  return isPane(h) ? h : null
}

function PaneBody({ id, prefs }: { id: PaneId; prefs: Prefs }) {
  switch (id) {
    case "profile":
      return <ProfilePane prefs={prefs} />
    case "appearance":
      return <AppearancePane prefs={prefs} />
    case "notifications":
      return <NotificationsPane prefs={prefs} />
    case "focus":
      return <FocusPane prefs={prefs} />
    case "schedule":
      return <SchedulePane prefs={prefs} />
    case "targets":
      return <TargetsPane prefs={prefs} />
    case "routines":
      return <RoutinesPane prefs={prefs} />
    case "dashboard":
      return <DashboardPane prefs={prefs} />
    case "quick-actions":
      return <QuickAddPane prefs={prefs} />
    case "data":
      return <DataPane />
    case "about":
      return <AboutPane />
  }
}

/** `active="wide"` highlights the item only in the two-column layout (on phones nothing is open yet). */
function SidebarItem({ active, onSelect, children }: { active: boolean | "wide"; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active === true ? "page" : undefined}
      className={cn(
        "group pressable relative flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left text-sm font-medium outline-none [--press-scale:0.98] focus-visible:ring-2 focus-visible:ring-ring",
        active === true ? "text-pill-foreground" : "text-foreground/85 hover:bg-foreground/[0.045]",
        active === "wide" && "@3xl/main:text-pill-foreground @3xl/main:hover:bg-transparent",
      )}
    >
      {active && <motion.span layoutId="settings-active" className={cn("glass-pill absolute inset-0 rounded-control", active === "wide" && "hidden @3xl/main:block")} transition={SPRING_SNAPPY} />}
      <span className="relative flex min-w-0 flex-1 items-center gap-3">{children}</span>
    </button>
  )
}

export function SettingsView() {
  const prefs = usePrefs()
  const life = useLife()
  const xp = useXP(life?.data)
  const [pane, setPane] = useState<PaneId | null>(paneFromHash)
  const [query, setQuery] = useState("")
  const [flash, setFlash] = useState<string | null>(null)
  const content = useRef<HTMLDivElement>(null)
  const current: PaneId = pane ?? "profile"

  const open = (id: PaneId | null, anchor?: string) => {
    setPane(id)
    setQuery("")
    setFlash(anchor ?? null)
    history.replaceState(null, "", id ? `#${id}` : window.location.pathname)
  }

  // follow hash changes and in-app links to a category while Settings is open
  useEffect(() => {
    const sync = () => setPane(paneFromHash())
    const fromLink = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      if (!isPane(id)) return
      setPane(id)
      history.replaceState(null, "", `#${id}`)
    }
    window.addEventListener("hashchange", sync)
    window.addEventListener("life-os:settings", fromLink)
    return () => {
      window.removeEventListener("hashchange", sync)
      window.removeEventListener("life-os:settings", fromLink)
    }
  }, [])

  // bring the opened category (or the setting found by search) into view
  useEffect(() => {
    if (!pane) return
    const id = window.setTimeout(() => {
      const target = flash ? document.getElementById(flash) : null
      if (target) {
        target.scrollIntoView({ block: "center", behavior: "smooth" })
        target.classList.add("settings-flash")
        window.setTimeout(() => target.classList.remove("settings-flash"), 1700)
        setFlash(null)
      } else if (content.current && content.current.getBoundingClientRect().top < 72) {
        window.scrollTo({ top: 0, behavior: "smooth" })
      }
    }, 260)
    return () => window.clearTimeout(id)
  }, [pane, flash])

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return null
    return SEARCH.filter((s) => {
      const hay = `${s.label} ${s.keywords} ${META[s.pane].label}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
  }, [query])

  if (!prefs) return <Skeleton className="h-[640px] rounded-panel" aria-busy="true" />
  const meta = META[current]

  return (
    <PageTransition>
      <PageHeader title="Settings" description="Everything is stored in this browser. Nothing leaves your device unless you export it." />
      <div className="grid items-start gap-5 @3xl/main:grid-cols-[270px_minmax(0,1fr)]">
        {/* sidebar */}
        <Panel as="div" className={cn("gap-3 p-3 sm:p-3 @3xl/main:sticky @3xl/main:top-[84px]", pane && "hidden @3xl/main:flex")}>
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("")
                if (e.key === "Enter" && results?.[0]) open(results[0].pane, results[0].anchor)
              }}
              placeholder="Search settings"
              aria-label="Search settings"
              className="h-9 w-full rounded-full bg-surface-3/70 pr-8 pl-9 text-sm ring-1 ring-line outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="pressable absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded-full bg-muted-foreground/30 text-background">
                <X className="size-3" strokeWidth={3} />
              </button>
            )}
          </label>

          <AnimatePresence mode="wait" initial={false}>
            {results ? (
              <motion.div key="results" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING_SNAPPY}>
                {results.length ? (
                  <ul aria-label="Search results" className="space-y-0.5">
                    {results.map((r) => (
                      <li key={`${r.pane}-${r.label}`}>
                        <SidebarItem active={false} onSelect={() => open(r.pane, r.anchor)}>
                          <IconTile icon={META[r.pane].icon} color={META[r.pane].color} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{r.label}</span>
                            <span className="block truncate text-xs font-normal text-muted-foreground">{META[r.pane].label}</span>
                          </span>
                        </SidebarItem>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">No settings match &ldquo;{query}&rdquo;</p>
                )}
              </motion.div>
            ) : (
              <motion.nav key="list" aria-label="Settings categories" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={SPRING_SNAPPY} className="space-y-3">
                <SidebarItem active={pane === "profile" || (!pane && "wide")} onSelect={() => open("profile")}>
                  <ProfileAvatar name={prefs.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.95rem] font-semibold">{prefs.name || "Your profile"}</span>
                    <span className={cn("block truncate text-xs font-normal", pane === "profile" ? "text-pill-foreground/75" : cn("text-muted-foreground", !pane && "@3xl/main:text-pill-foreground/75"))}>{xp ? `Level ${xp.level.level} · ${xp.level.title}` : "Profile"}</span>
                  </span>
                </SidebarItem>
                {SIDEBAR_GROUPS.map((group, i) => (
                  <ul key={i} className="space-y-0.5 border-t border-line pt-3">
                    {group.map((id) => (
                      <li key={id}>
                        <SidebarItem active={pane === id} onSelect={() => open(id)}>
                          <IconTile icon={META[id].icon} color={META[id].color} size="sm" />
                          <span className="truncate">{META[id].label}</span>
                        </SidebarItem>
                      </li>
                    ))}
                  </ul>
                ))}
              </motion.nav>
            )}
          </AnimatePresence>
        </Panel>

        {/* the open category */}
        <Panel as="div" className={cn("min-h-[60vh] min-w-0", !pane && "hidden @3xl/main:flex")}>
          <div ref={content} className="scroll-mt-28">
            <button type="button" onClick={() => open(null)} className="pressable mb-4 -ml-1 inline-flex items-center gap-0.5 rounded-full py-1 pr-3 pl-1 text-sm font-medium text-violet hover:bg-violet/10 @3xl/main:hidden">
              <ChevronLeft className="size-4" strokeWidth={2.5} />
              Settings
            </button>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current}
                initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -6, filter: "blur(4px)", transition: { duration: 0.12 } }}
                transition={SPRING_SNAPPY}
                className="mx-auto max-w-2xl space-y-6"
              >
                <header className="flex items-center gap-4">
                  <IconTile icon={meta.icon} color={meta.color} size="lg" />
                  <div className="min-w-0">
                    <h2 className="text-2xl font-semibold tracking-tight">{meta.label}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{meta.description}</p>
                  </div>
                </header>
                <PaneBody id={current} prefs={prefs} />
              </motion.div>
            </AnimatePresence>
          </div>
        </Panel>
      </div>
    </PageTransition>
  )
}
