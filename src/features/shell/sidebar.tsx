"use client"

import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo, type ReactElement, type ReactNode } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatTimer, remainingMs, elapsedMs } from "@/lib/domain/focus"
import { habitsForDay, logsByHabit } from "@/lib/domain/habits"
import { isDueToday, isOverdue } from "@/lib/domain/tasks"
import { useNow } from "@/lib/db/hooks"
import { useFocus } from "@/lib/stores/focus"
import { useUI } from "@/lib/stores/ui"
import { SPRING_SNAPPY } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { LayeredIcon, useTilt } from "./layered-icon"
import { NAV, navForPath, type NavItem, type NavKey } from "./nav"
import { SidebarWatch } from "./sidebar-watch"
import { useLife } from "./use-life"

/*
  The sidebar, laid out like the Settings category list (after Apple's System
  Settings): one liquid-glass pane with the logo and name, then the tabs as rows in
  groups split by thin lines, then a vintage chronograph in whatever room is left
  (sidebar-watch.tsx). Each tab has a 3D layered icon, and the soft highlighter glides
  to the tab you pick.
*/

export function LifeMark({ className }: { className?: string }) {
  return (
    <span className={cn("relative grid size-9 shrink-0 place-items-center rounded-full bg-violet text-primary-foreground", className)} aria-hidden>
      <span className="absolute inset-[7px] rounded-full border-[2.5px] border-current" />
      <span className="size-2 rounded-full bg-current" />
    </span>
  )
}

type Status = {
  text: string
  tone: "rose" | "violet" | "mint" | "muted"
  pulse?: boolean
} | null

function useStatuses(): Partial<Record<NavKey, Status>> {
  const life = useLife()
  const timer = useFocus((s) => s.timer)
  const now = useNow(1000)
  return useMemo(() => {
    const out: Partial<Record<NavKey, Status>> = {}
    if (timer.status !== "idle") {
      const rem = remainingMs(timer, now)
      out.focus = {
        text: rem === null ? formatTimer(elapsedMs(timer, now)) : formatTimer(rem),
        tone: timer.phase === "focus" ? "violet" : "mint",
        pulse: timer.status === "running",
      }
    }
    if (!life) return out
    const { data, today, prefs } = life
    const overdue = data.tasks.filter((t) => isOverdue(t, today)).length
    const dueToday = data.tasks.filter((t) => isDueToday(t, today)).length
    if (overdue) out.tasks = { text: String(overdue + dueToday), tone: "rose" }
    else if (dueToday) out.tasks = { text: String(dueToday), tone: "violet" }
    const left = habitsForDay(data.habits, logsByHabit(data.habitLogs), today, prefs.weekStartsOn).filter((s) => !s.done && (!s.progress || s.progress.count < s.progress.target)).length
    if (left) out.habits = { text: `${left} left`, tone: "muted" }
    return out
  }, [life, timer, now])
}

/** In the collapsed sidebar, a label for an icon-only control. */
function Tip({ show, label, children }: { show: boolean; label: ReactNode; children: ReactElement }) {
  if (!show) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

function NavLink({ item, active, collapsed, status, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; status: Status | undefined; onNavigate?: () => void }) {
  const planned = !item.ready
  const { iconRef, onPointerMove, onPointerLeave } = useTilt()
  return (
    <Tip
      show={collapsed}
      label={
        <>
          {item.label}
          {planned && ` · Planned (Phase ${item.phase})`}
          {status && !planned && ` · ${status.text}`}
        </>
      }
    >
      <Link
        href={item.href}
        onNavigate={onNavigate}
        aria-current={active ? "page" : undefined}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        className={cn(
          "icon-host pressable relative flex items-center gap-3 rounded-control py-1.5 pr-2.5 pl-1.5 text-sm font-medium outline-none [--press-scale:0.98] focus-visible:ring-2 focus-visible:ring-ring",
          active ? "text-pill-foreground" : "text-foreground/85 hover:bg-foreground/[0.045]",
          collapsed && "justify-center px-0",
        )}
      >
        {active && <motion.span layoutId="nav-active" className="glass-pill absolute inset-0 rounded-control" transition={SPRING_SNAPPY} />}
        <LayeredIcon icon={item.icon} tint={item.tint} active={active} muted={planned && !active} iconRef={iconRef} className="[--icon-size:1.75rem]" />
        {!collapsed && (
          <>
            <span className={cn("relative truncate", planned && !active && "opacity-70")}>{item.label}</span>
            <span className="relative ml-auto flex items-center">
              {planned ? (
                <span className={cn("rounded-control border px-1.5 py-px text-[10px] font-medium", active ? "border-pill-foreground/30 text-pill-foreground/80" : "border-line text-muted-foreground")}>P{item.phase}</span>
              ) : status ? (
                <span
                  className={cn(
                    "flex items-center gap-1.5 rounded-control px-2 py-px text-[11px] font-semibold tabular",
                    status.tone === "rose" && "bg-rose/25",
                    status.tone === "violet" && "bg-violet/25",
                    status.tone === "mint" && "bg-mint/25",
                    active ? "text-pill-foreground" : status.tone === "muted" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {status.pulse && <span className="size-1.5 animate-pulse rounded-full bg-current" />}
                  {status.text}
                </span>
              ) : null}
            </span>
          </>
        )}
        {collapsed && status && !planned && (
          <span className={cn("absolute top-1 right-1.5 size-2 rounded-full", status.tone === "rose" ? "bg-rose" : status.tone === "mint" ? "bg-mint" : "bg-violet", status.pulse && "animate-pulse")} />
        )}
      </Link>
    </Tip>
  )
}

export function SidebarContent({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  const active = navForPath(pathname)
  const statuses = useStatuses()
  const groups = ["Core", "Growth", "Knowledge", "Life"] as const

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Link href="/" onNavigate={onNavigate} aria-label="LIFE OS, overview" className={cn("flex h-11 shrink-0 items-center gap-2.5 rounded-control px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring", collapsed && "justify-center px-0")}>
        <LifeMark />
        {!collapsed && <span className="text-[1.05rem] font-semibold tracking-[0.08em]">LIFE OS</span>}
      </Link>
      {/* the tabs take the room they need (scrolling if short of it); the watch gets what's left */}
      <nav aria-label="Main" className="no-scrollbar -mx-1 min-h-0 shrink space-y-3 overflow-y-auto px-1">
        {groups.map((g) => (
          <ul key={g} aria-label={g} className="space-y-0.5 border-t border-line pt-3">
            {NAV.filter((n) => n.group === g).map((item) => (
              <li key={item.key}>
                <NavLink item={item} active={item.key === active.key} collapsed={collapsed} status={statuses[item.key]} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        ))}
      </nav>
      <SidebarWatch collapsed={collapsed} />
    </div>
  )
}

export function Sidebar() {
  const collapsed = useUI((s) => s.sidebarCollapsed)
  const toggle = useUI((s) => s.toggleSidebar)
  return (
    // a floating liquid-glass pane, inset from the window edge
    <aside className={cn("sticky top-0 z-30 hidden h-dvh shrink-0 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block", collapsed ? "w-[96px]" : "w-[276px]")}>
      <div className="glass flex h-full min-h-0 flex-col overflow-hidden rounded-panel p-3">
        <SidebarContent collapsed={collapsed} />
        <div className="mt-3 shrink-0 border-t border-line pt-2">
          <button
            type="button"
            onClick={toggle}
            className={cn("pressable flex h-9 w-full items-center gap-2 rounded-control px-3 text-xs text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground", collapsed && "justify-center px-0")}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            {!collapsed && (
              <>
                Collapse <span className="ml-auto font-mono text-[10px]">[</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  )
}
