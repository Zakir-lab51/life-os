"use client"

import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { HatchBar } from "@/components/os/visuals"
import { formatTimer, remainingMs, elapsedMs } from "@/lib/domain/focus"
import { habitsForDay, logsByHabit } from "@/lib/domain/habits"
import { isDueToday, isOverdue } from "@/lib/domain/tasks"
import { useNow } from "@/lib/db/hooks"
import { useFocus } from "@/lib/stores/focus"
import { useUI } from "@/lib/stores/ui"
import { SPRING_SNAPPY } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { NAV, navForPath, type NavItem, type NavKey } from "./nav"
import { useLife, useXP } from "./use-life"

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

function NavLink({ item, active, collapsed, status, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; status: Status | undefined; onNavigate?: () => void }) {
  const I = item.icon
  const planned = !item.ready
  const link = (
    <Link
      href={item.href}
      onNavigate={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group pressable relative flex h-10 items-center gap-3 rounded-control px-3 text-[0.9rem] font-medium outline-none [--press-scale:0.98] focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-pill-foreground" : "text-muted-foreground hover:bg-foreground/[0.045] hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {active && <motion.span layoutId="nav-active" className="glass-pill absolute inset-0 rounded-control" transition={SPRING_SNAPPY} />}
      <I className={cn("relative size-[18px] shrink-0", planned && !active && "opacity-60")} />
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
        <span className={cn("absolute top-1.5 right-2 size-2 rounded-full", status.tone === "rose" ? "bg-rose" : status.tone === "mint" ? "bg-mint" : "bg-violet", status.pulse && "animate-pulse")} />
      )}
    </Link>
  )
  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {planned && ` · Planned (Phase ${item.phase})`}
        {status && !planned && ` · ${status.text}`}
      </TooltipContent>
    </Tooltip>
  )
}

function LevelCard({ collapsed }: { collapsed: boolean }) {
  const life = useLife()
  const xp = useXP(life?.data)
  if (!xp) return null
  const { level } = xp
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="/habits#progress" className="mx-auto grid size-10 place-items-center rounded-full border border-line bg-surface-2 text-xs font-semibold tabular">
            {level.level}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">
          Level {level.level} · {level.intoLevel}/{level.needed} XP
        </TooltipContent>
      </Tooltip>
    )
  }
  return (
    <Link href="/habits#progress" className="block rounded-2xl border border-line bg-surface-2/70 p-3 transition-colors hover:bg-surface-3/70">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold">
          Level {level.level} · <span className="text-violet">{level.title}</span>
        </span>
        <span className="text-muted-foreground tabular">
          {level.intoLevel}/{level.needed}
        </span>
      </div>
      <HatchBar value={level.progress} tone="violet" className="mt-2" height={6} />
    </Link>
  )
}

export function SidebarContent({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  const active = navForPath(pathname)
  const statuses = useStatuses()
  const groups = ["Core", "Growth", "Knowledge", "Life"] as const

  return (
    <div className="flex h-full flex-col">
      <Link href="/" onNavigate={onNavigate} className={cn("mb-6 flex items-center gap-2.5 px-2", collapsed && "justify-center px-0")}>
        <LifeMark />
        {!collapsed && <span className="text-[1.05rem] font-semibold tracking-[0.08em]">LIFE OS</span>}
      </Link>
      <nav aria-label="Main" className="no-scrollbar -mx-1 flex-1 space-y-5 overflow-y-auto px-1">
        {groups.map((g) => (
          <div key={g}>
            {!collapsed && <div className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/70 uppercase">{g}</div>}
            <div className="space-y-0.5">
              {NAV.filter((n) => n.group === g).map((item) => (
                <NavLink key={item.key} item={item} active={item.key === active.key} collapsed={collapsed} status={statuses[item.key]} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-4 pt-2">
        <LevelCard collapsed={collapsed} />
      </div>
    </div>
  )
}

export function Sidebar() {
  const collapsed = useUI((s) => s.sidebarCollapsed)
  const toggle = useUI((s) => s.toggleSidebar)
  return (
    // a floating glass panel, inset from the window edge
    <aside className={cn("sticky top-0 z-30 hidden h-dvh shrink-0 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block", collapsed ? "w-[96px]" : "w-[276px]")}>
      <div className="glass flex h-full min-h-0 flex-col overflow-hidden rounded-panel p-4">
        <SidebarContent collapsed={collapsed} />
        <button
          type="button"
          onClick={toggle}
          className={cn("mt-3 flex h-9 items-center gap-2 rounded-control px-3 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground", collapsed && "justify-center px-0")}
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
    </aside>
  )
}
