"use client"

import { useLiveQuery } from "dexie-react-hooks"
import { CalendarHeart, ClipboardCheck, Check, Download, FileText, Keyboard, Lightbulb, Moon, PanelLeft, Repeat, SquareCheckBig, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useMemo } from "react"
import { toast } from "sonner"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { Icon } from "@/components/os/icon"
import { PriorityFlag } from "@/components/os/visuals"
import { db } from "@/lib/db/db"
import { openJournal, toggleHabitLog } from "@/lib/db/repo"
import { relativeDayLabel, toISODate } from "@/lib/domain/dates"
import { habitsForDay, logsByHabit } from "@/lib/domain/habits"
import { QUICK_ACTIONS } from "@/lib/domain/types"
import { attempt } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { openNote } from "@/features/notes/route"
import { openProject } from "@/features/projects/route"
import { ProjectGlyph } from "@/features/projects/shared"
import { QUICK_ACTION_META, useActions } from "./actions"
import { NAV } from "./nav"
import { useLife } from "./use-life"

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen)
  const setOpen = useUI((s) => s.setPalette)
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  const toggleSidebar = useUI((s) => s.toggleSidebar)
  const setShortcuts = useUI((s) => s.setShortcuts)
  const setReviewOpen = useUI((s) => s.setReviewOpen)
  const { run, navigate, toggleTheme, downloadBackup } = useActions()
  const { resolvedTheme } = useTheme()
  const life = useLife()

  const openTasks = useMemo(
    () => (life ? life.data.tasks.filter((t) => t.status !== "done").sort((a, b) => a.priority - b.priority || (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")) : []),
    [life],
  )
  // only read while the palette is open: notes can be long
  const notes = useLiveQuery(() => (open ? db.notes.orderBy("updatedAt").reverse().limit(60).toArray() : []), [open])
  const projects = useMemo(() => (life ? life.data.projects.filter((p) => p.status === "active" || p.status === "paused") : []), [life])
  const habitsToday = useMemo(
    () => (life ? habitsForDay(life.data.habits, logsByHabit(life.data.habitLogs), life.today, life.prefs.weekStartsOn) : []),
    [life],
  )

  const close = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Jump anywhere, run an action or find a task" className="top-[22%] rounded-dialog! border-line sm:max-w-xl">
      <Command className="rounded-dialog!">
        <CommandInput placeholder="Type a command, page, task or habit…" />
        <CommandList className="max-h-[min(60vh,460px)]">
          <CommandEmpty>Nothing matches. Try a page name like &ldquo;focus&rdquo;.</CommandEmpty>

          <CommandGroup heading="Actions">
            {QUICK_ACTIONS.map((id) => {
              const meta = QUICK_ACTION_META[id]
              const I = meta.icon
              return (
                <CommandItem key={id} value={`action ${meta.label} ${meta.description}`} onSelect={() => run(id)}>
                  <I />
                  <span>{meta.label}</span>
                  <span className="text-xs text-muted-foreground">{meta.description}</span>
                  {meta.keys && <CommandShortcut>{meta.keys}</CommandShortcut>}
                </CommandItem>
              )
            })}
            <CommandItem value="action weekly review week reflect next week top three" onSelect={close(() => setReviewOpen(true))}>
              <ClipboardCheck />
              <span>Weekly review</span>
              <span className="text-xs text-muted-foreground">Look back, pick next week&apos;s top three</span>
            </CommandItem>
            <CommandItem
              value="action today's journal diary entry write"
              onSelect={close(async () => {
                const entry = await attempt(() => openJournal(life?.today ?? toISODate(new Date())))
                if (entry) openNote(entry.id, navigate)
              })}
            >
              <CalendarHeart />
              <span>Today&apos;s journal</span>
              <span className="text-xs text-muted-foreground">A page for today in your second brain</span>
            </CommandItem>
            <CommandItem value="action capture an idea inbox thought note" onSelect={close(() => useUI.getState().setCapture(true, "idea"))}>
              <Lightbulb />
              <span>Capture an idea</span>
              <span className="text-xs text-muted-foreground">Straight to your notes inbox</span>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />
          <CommandGroup heading="Go to">
            {NAV.map((n) => {
              const I = n.icon
              return (
                <CommandItem key={n.key} value={`go ${n.label}`} onSelect={close(() => navigate(n.href))}>
                  <I />
                  <span>{n.label}</span>
                  {!n.ready && <span className="text-xs text-muted-foreground">Planned · Phase {n.phase}</span>}
                  {n.shortcut && <CommandShortcut>G {n.shortcut.toUpperCase()}</CommandShortcut>}
                </CommandItem>
              )
            })}
          </CommandGroup>

          {habitsToday.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Habits today">
                {habitsToday.map(({ habit, done }) => (
                  <CommandItem
                    key={habit.id}
                    value={`habit check ${habit.name}`}
                    onSelect={close(async () => {
                      const now = await attempt(() => toggleHabitLog(habit.id, life!.today))
                      if (now !== undefined) toast.success(now ? `${habit.name}: checked in` : `${habit.name}: unchecked`)
                    })}
                  >
                    <Icon name={habit.icon} />
                    <span>{habit.name}</span>
                    {done ? <Check className="ml-auto text-mint" /> : <span className="ml-auto text-xs text-muted-foreground">Check in</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {projects.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Projects">
                {projects.map((p) => (
                  <CommandItem key={p.id} value={`project ${p.name} ${p.id}`} onSelect={close(() => openProject(p.id, navigate))}>
                    <ProjectGlyph project={p} size="sm" className="size-5 rounded-md [&_svg]:size-3" />
                    <span className="truncate">{p.name}</span>
                    {p.status === "paused" && <span className="ml-auto text-xs text-muted-foreground">Paused</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {!!notes?.length && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Notes">
                {notes
                  .filter((n) => n.kind !== "template")
                  .map((n) => (
                    <CommandItem key={n.id} value={`note ${n.title} ${n.tags.join(" ")} ${n.text.slice(0, 240)} ${n.id}`} onSelect={close(() => openNote(n.id, navigate))}>
                      <FileText />
                      <span className="truncate">{n.title || "Untitled"}</span>
                      {n.folder && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{n.folder.split("/").pop()}</span>}
                    </CommandItem>
                  ))}
              </CommandGroup>
            </>
          )}

          {openTasks.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Tasks">
                {openTasks.slice(0, 50).map((t) => (
                  <CommandItem key={t.id} value={`task ${t.title} ${t.tags.join(" ")}`} onSelect={close(() => openTaskEditor(t.id))}>
                    <SquareCheckBig />
                    <span className="truncate">{t.title}</span>
                    <span className="ml-auto flex items-center gap-2">
                      {t.dueDate && <span className="text-xs text-muted-foreground">{relativeDayLabel(t.dueDate, life!.today)}</span>}
                      <PriorityFlag priority={t.priority} />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <CommandGroup heading="Preferences">
            <CommandItem value="theme toggle dark light" onSelect={close(toggleTheme)}>
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
              <span>Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme</span>
            </CommandItem>
            <CommandItem value="toggle sidebar collapse" onSelect={close(toggleSidebar)}>
              <PanelLeft />
              <span>Collapse or expand sidebar</span>
              <CommandShortcut>[</CommandShortcut>
            </CommandItem>
            <CommandItem value="keyboard shortcuts help" onSelect={close(() => setShortcuts(true))}>
              <Keyboard />
              <span>Keyboard shortcuts</span>
              <CommandShortcut>?</CommandShortcut>
            </CommandItem>
            <CommandItem value="download backup export data" onSelect={close(() => void downloadBackup())}>
              <Download />
              <span>Download a backup</span>
            </CommandItem>
            <CommandItem value="habits manage" onSelect={close(() => navigate("/habits"))}>
              <Repeat />
              <span>Manage habits</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
