"use client"

import { formatDistanceToNowStrict } from "date-fns"
import { Bell, BellOff, CheckCheck, ChevronRight, Download, Keyboard, Menu, Moon, Pause, Play, Plus, Search, Settings, Sun, Trash2, Trophy, Timer, AlarmClock, Info } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { AnimatePresence, motion } from "motion/react"
import { useLayoutEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Kbd } from "@/components/os/visuals"
import { useNotifications, useNow, usePrefs } from "@/lib/db/hooks"
import { clearNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/db/repo"
import { elapsedMs, formatTimer, remainingMs } from "@/lib/domain/focus"
import type { AppNotification } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"
import { useFocus } from "@/lib/stores/focus"
import { useUI } from "@/lib/stores/ui"
import { SPRING_BOUNCY } from "@/lib/motion"
import { centreOf, switchTheme } from "./theme-switch"
import { cn } from "@/lib/utils"
import { QUICK_ACTION_META, useActions } from "./actions"
import { navForPath } from "./nav"
import { SidebarContent } from "./sidebar"
import { useLife, useXP } from "./use-life"

function Breadcrumbs() {
  const pathname = usePathname()
  const item = navForPath(pathname)
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
      <Link href="/" className="text-muted-foreground transition-colors hover:text-foreground">
        LIFE OS
      </Link>
      <ChevronRight className="size-3.5 text-muted-foreground/60" />
      <span className="truncate font-medium" aria-current="page">
        {item.label}
      </span>
    </nav>
  )
}

function DatePill() {
  const now = useNow(1000)
  const d = new Date(now)
  return (
    <div className="hidden h-10 items-center gap-2 rounded-control border border-line bg-surface px-4 text-sm xl:flex" aria-label="Current date and time">
      <span className="text-muted-foreground">{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
      <span className="font-medium tabular">{d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  )
}

function FocusMini() {
  const timer = useFocus((s) => s.timer)
  const pauseTimer = useFocus((s) => s.pauseTimer)
  const resumeTimer = useFocus((s) => s.resumeTimer)
  const now = useNow(1000)
  if (timer.status === "idle") return null
  const rem = remainingMs(timer, now)
  const label = timer.phase === "focus" ? "Focus" : timer.phase === "long" ? "Long break" : "Break"
  return (
    <div className="flex h-10 items-center gap-1 rounded-control border border-line bg-surface pr-1 pl-3">
      <Link href="/focus" className="flex items-center gap-2 text-sm" aria-label={`${label} timer, open Focus`}>
        <span className={cn("size-2 rounded-full", timer.phase === "focus" ? "bg-violet" : "bg-mint", timer.status === "running" && "animate-pulse")} />
        <span className="hidden text-muted-foreground sm:inline">{label}</span>
        <span className="font-semibold tabular">{formatTimer(rem ?? elapsedMs(timer, now))}</span>
      </Link>
      <Button size="icon-sm" variant="ghost" aria-label={timer.status === "running" ? "Pause timer" : "Resume timer"} onClick={() => (timer.status === "running" ? pauseTimer() : resumeTimer())}>
        {timer.status === "running" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
      </Button>
    </div>
  )
}

function QuickAdd() {
  const prefs = usePrefs()
  const { run } = useActions()
  const [open, setOpen] = useState(false)
  // close on navigation-away (Activity keeps the component mounted)
  useLayoutEffect(() => () => setOpen(false), [])
  const actions = prefs?.quickActions ?? []
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button size="icon" className="size-10" aria-label="Quick add">
              <Plus className="size-5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Quick add</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Quick add</DropdownMenuLabel>
        {actions.map((id) => {
          const meta = QUICK_ACTION_META[id]
          const I = meta.icon
          return (
            <DropdownMenuItem key={id} onSelect={() => run(id)}>
              <I />
              <div className="flex flex-col">
                <span>{meta.label}</span>
                <span className="text-xs text-muted-foreground">{meta.description}</span>
              </div>
              {meta.keys && <DropdownMenuShortcut>{meta.keys}</DropdownMenuShortcut>}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings#quick-actions" onClick={() => window.dispatchEvent(new CustomEvent("life-os:settings", { detail: "quick-actions" }))}>
            <Settings />
            Customise this menu
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const NOTIFICATION_ICON = { reminder: AlarmClock, focus: Timer, achievement: Trophy, level: Trophy, system: Info }

function NotificationCenter() {
  const items = useNotifications()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => () => setOpen(false), [])
  const unread = items?.filter((n) => n.read === 0).length ?? 0

  const openItem = (n: AppNotification) => {
    void attempt(() => markNotificationRead(n.id))
    if (n.href) {
      setOpen(false)
      router.push(n.href)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative size-10 rounded-full bg-surface" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <Bell className="size-[18px]" />
          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-control bg-violet px-1 text-[10px] font-bold text-primary-foreground tabular">{unread > 9 ? "9+" : unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] rounded-3xl p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <p className="font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">Reminders, finished sessions and milestones</p>
          </div>
          <div className="flex gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="Mark all as read" disabled={!unread} onClick={() => void attempt(markAllNotificationsRead)}>
                  <CheckCheck />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mark all as read</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="Clear all notifications" disabled={!items?.length} onClick={() => void attempt(clearNotifications)}>
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Clear all</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!items?.length ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <BellOff className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">You&apos;re all caught up</p>
              <p className="text-xs text-muted-foreground">Task reminders fire here while LIFE OS is open in a tab.</p>
            </div>
          ) : (
            items.map((n) => {
              const I = NOTIFICATION_ICON[n.kind]
              return (
                <button key={n.id} type="button" onClick={() => openItem(n)} className={cn("flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-surface-2", n.read === 0 && "bg-violet/[0.06]")}>
                  <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", n.kind === "reminder" ? "bg-amber/15 text-amber" : n.kind === "focus" ? "bg-violet/15 text-violet" : "bg-mint/15 text-mint")}>
                    <I className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{n.title}</span>
                      {n.read === 0 && <span className="size-1.5 shrink-0 rounded-full bg-violet" />}
                    </span>
                    {n.body && <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>}
                    <span className="mt-1 block text-[11px] text-muted-foreground/70">{formatDistanceToNowStrict(new Date(n.at), { addSuffix: true })}</span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme !== "light"
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => switchTheme(dark ? "light" : "dark", setTheme, centreOf(e.currentTarget))
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="icon" className="size-10 overflow-hidden rounded-full bg-surface" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={toggle}>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={dark ? "sun" : "moon"} className="grid place-items-center" initial={{ rotate: -90, scale: 0.4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 90, scale: 0.4, opacity: 0 }} transition={SPRING_BOUNCY}>
              {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </motion.span>
          </AnimatePresence>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{dark ? "Light theme" : "Dark theme"}</TooltipContent>
    </Tooltip>
  )
}

function ProfileMenu() {
  const life = useLife()
  const xp = useXP(life?.data)
  const { downloadBackup } = useActions()
  const setShortcuts = useUI((s) => s.setShortcuts)
  const [open, setOpen] = useState(false)
  useLayoutEffect(() => () => setOpen(false), [])
  const name = life?.prefs.name || "You"
  const initial = name.trim()[0]?.toUpperCase() ?? "Y"
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-10 items-center gap-2.5 rounded-control border border-line bg-surface py-1 pr-3 pl-1 transition-colors hover:bg-surface-2" aria-label="Profile menu">
          <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-violet to-blue text-sm font-semibold text-primary-foreground">{initial}</span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block text-sm font-medium">{name}</span>
            {xp && (
              <span className="block text-[11px] text-muted-foreground">
                Level {xp.level.level} · {xp.level.title}
              </span>
            )}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>{name}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/habits#progress">
            <Trophy /> Level & achievements
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setShortcuts(true)}>
          <Keyboard /> Keyboard shortcuts <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void downloadBackup()}>
          <Download /> Download backup
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Topbar() {
  const setPalette = useUI((s) => s.setPalette)
  const mobileOpen = useUI((s) => s.mobileNavOpen)
  const setMobileNav = useUI((s) => s.setMobileNav)
  return (
    // a floating glass bar, lined up with the page content below it
    <header className="sticky top-0 z-20 mx-auto w-full max-w-[1400px] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6 lg:px-8">
      <div data-lens="dispersive" className="glass flex h-[60px] items-center gap-2 rounded-panel px-3 sm:gap-3 sm:px-4">
        <Button variant="outline" size="icon" className="size-10 rounded-full bg-surface lg:hidden" aria-label="Open navigation" onClick={() => setMobileNav(true)}>
          <Menu className="size-[18px]" />
        </Button>
        <Breadcrumbs />
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" className="size-10 rounded-full bg-surface" aria-label="Search and commands" aria-keyshortcuts="Control+K" onClick={() => setPalette(true)}>
              <Search className="size-[18px]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-1.5">
            Search or run a command
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </TooltipContent>
        </Tooltip>
        <DatePill />
        <FocusMini />
        <QuickAdd />
        <NotificationCenter />
        <ThemeToggle />
        <ProfileMenu />
      </div>
      <Sheet open={mobileOpen} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-[290px] border-0 bg-transparent p-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-none [backdrop-filter:none] data-[side=left]:border-r-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setMobileNav(false)} />
        </SheetContent>
      </Sheet>
    </header>
  )
}
