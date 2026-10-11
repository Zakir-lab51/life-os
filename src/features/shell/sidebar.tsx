"use client"

import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { motion } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo, type CSSProperties } from "react"
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
import { LayeredIcon, useTilt } from "./layered-icon"
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
  const planned = !item.ready
  const { iconRef, onPointerMove, onPointerLeave } = useTilt()
  const link = (
    <Link
      href={item.href}
      onNavigate={onNavigate}
      aria-current={active ? "page" : undefined}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={cn(
        "glass icon-host pressable flex h-10 items-center gap-2.5 rounded-2xl pr-3 pl-1.5 text-[0.9rem] font-medium outline-none [--press-scale:0.97] focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-foreground" : "text-foreground/80 hover:text-foreground",
        collapsed && "mx-auto size-11 justify-center p-0",
      )}
    >
      {/* the selected tab glows in its own colour; the glow glides to the next tab you pick */}
      {active && <motion.span layoutId="nav-active" aria-hidden className="nav-glow absolute inset-0 rounded-[inherit]" style={{ "--li-from": item.tint[0], "--li-to": item.tint[1] } as CSSProperties} transition={SPRING_SNAPPY} />}
      <LayeredIcon icon={item.icon} tint={item.tint} active={active} muted={planned && !active} iconRef={iconRef} className="[--icon-size:1.75rem]" />
      {!collapsed && (
        <>
          <span className={cn("relative truncate", planned && !active && "opacity-70")}>{item.label}</span>
          <span className="relative ml-auto flex items-center">
            {planned ? (
              <span className="rounded-control border border-line px-1.5 py-px text-[10px] font-medium text-muted-foreground">P{item.phase}</span>
            ) : status ? (
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-control px-2 py-px text-[11px] font-semibold tabular",
                  status.tone === "rose" && "bg-rose/25",
                  status.tone === "violet" && "bg-violet/25",
                  status.tone === "mint" && "bg-mint/25",
                  status.tone === "muted" ? "text-muted-foreground" : "text-foreground",
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
        <span className={cn("absolute top-1 right-1 size-2 rounded-full ring-2 ring-background/60", status.tone === "rose" ? "bg-rose" : status.tone === "mint" ? "bg-mint" : "bg-violet", status.pulse && "animate-pulse")} />
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
          <Link href="/habits#progress" className="glass pressable mx-auto grid size-11 place-items-center rounded-2xl text-xs font-semibold tabular">
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
    <Link href="/habits#progress" className="glass pressable block rounded-2xl p-3 [--press-scale:0.98]">
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

  // no panel behind: every tab, the logo and the level card are their own floating glass
  // tile (glass on glass can't blur what's behind it, and Apple's guidance is not to stack it)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Link href="/" onNavigate={onNavigate} className={cn("glass pressable mb-4 flex h-12 shrink-0 items-center gap-2.5 rounded-2xl px-2 [--press-scale:0.98]", collapsed && "mx-auto size-12 justify-center p-0")}>
        <LifeMark />
        {!collapsed && <span className="text-[1.05rem] font-semibold tracking-[0.08em]">LIFE OS</span>}
      </Link>
      {/* data-scroll-tiles: tiles in here move when it scrolls (see canvas-refraction.tsx) */}
      <nav aria-label="Main" data-scroll-tiles className="no-scrollbar -mx-3 -my-1 flex-1 space-y-3 overflow-y-auto px-3 py-1">
        {groups.map((g) => (
          <div key={g}>
            {!collapsed && <div className="mb-1 px-2 text-[10px] font-semibold tracking-[0.16em] text-foreground/75 uppercase [text-shadow:0_1px_6px_var(--background)]">{g}</div>}
            <div className="space-y-1">
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
    // a column of floating glass tiles, inset from the window edge
    <aside className={cn("sticky top-0 z-30 hidden h-dvh shrink-0 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:block", collapsed ? "w-[96px]" : "w-[276px]")}>
      <div className="flex h-full min-h-0 flex-col">
        <SidebarContent collapsed={collapsed} />
        <button
          type="button"
          onClick={toggle}
          className={cn("glass pressable mt-3 flex h-10 shrink-0 items-center gap-2 rounded-2xl px-3 text-xs text-muted-foreground hover:text-foreground", collapsed && "mx-auto w-11 justify-center px-0")}
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
