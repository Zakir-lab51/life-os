"use client"

import { addMonths, endOfMonth, format, startOfMonth } from "date-fns"
import { ArrowUpRight, CalendarPlus, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader, PageTransition } from "@/components/os/page-header"
import { Panel, PanelHeader } from "@/components/os/panel"
import { EmptyState, PriorityFlag } from "@/components/os/visuals"
import { useBlocksBetween } from "@/lib/db/hooks"
import { ACCENT_CLASSES } from "@/lib/domain/areas"
import { addDays, daysBetween, formatClock, formatDay, fromISODate, startOfWeek, toISODate } from "@/lib/domain/dates"
import { habitsForDay, logsByHabit } from "@/lib/domain/habits"
import type { Block, ISODate, Task } from "@/lib/domain/types"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { useLife, type Life } from "@/features/shell/use-life"
import { toggleDone } from "@/features/tasks/task-actions"
import { KIND_LABEL } from "@/features/planner/block-editor"
import { KIND_TONE } from "@/features/planner/timeline"
import { MOODS } from "@/features/planner/reflection-dialog"

export function CalendarView() {
  const life = useLife()
  const [month, setMonth] = useState<ISODate | null>(null)
  const anchor = month ?? (life ? toISODate(startOfMonth(fromISODate(life.today))) : "")
  const weekStartsOn = life?.prefs.weekStartsOn ?? 1
  const gridStart = anchor ? startOfWeek(anchor, weekStartsOn) : ""
  const gridEnd = anchor ? addDays(startOfWeek(toISODate(endOfMonth(fromISODate(anchor))), weekStartsOn), 6) : ""
  const blocks = useBlocksBetween(gridStart, gridEnd)
  if (!life || !blocks) return <Skeleton className="h-[640px] rounded-panel" aria-busy="true" />
  return <Calendar life={life} anchor={anchor} gridStart={gridStart} gridEnd={gridEnd} blocks={blocks} setMonth={setMonth} />
}

function Calendar({ life, anchor, gridStart, gridEnd, blocks, setMonth }: { life: Life; anchor: ISODate; gridStart: ISODate; gridEnd: ISODate; blocks: Block[]; setMonth: (m: ISODate | null) => void }) {
  const { data, today, prefs } = life
  const [selected, setSelected] = useState<ISODate>(today)
  const router = useRouter()
  const setPlannerDate = useUI((s) => s.setPlannerDate)
  const openBlockEditor = useUI((s) => s.openBlockEditor)
  const openTaskEditor = useUI((s) => s.openTaskEditor)

  const days = useMemo(() => {
    const out: ISODate[] = []
    for (let d = gridStart; daysBetween(d, gridEnd) >= 0; d = addDays(d, 1)) out.push(d)
    return out
  }, [gridStart, gridEnd])

  const tasksByDay = useMemo(() => {
    const m = new Map<ISODate, Task[]>()
    for (const t of data.tasks) {
      if (!t.dueDate) continue
      const list = m.get(t.dueDate) ?? []
      list.push(t)
      m.set(t.dueDate, list)
    }
    return m
  }, [data.tasks])
  const blocksByDay = useMemo(() => {
    const m = new Map<ISODate, Block[]>()
    for (const b of blocks) m.set(b.date, [...(m.get(b.date) ?? []), b].sort((x, y) => x.start - y.start))
    return m
  }, [blocks])
  const byHabit = useMemo(() => logsByHabit(data.habitLogs), [data.habitLogs])
  const monthKey = anchor.slice(0, 7)

  const monthStats = useMemo(() => {
    const inMonth = (d: string | null) => !!d && d.startsWith(monthKey)
    const due = data.tasks.filter((t) => inMonth(t.dueDate))
    return {
      due: due.filter((t) => t.status !== "done").length,
      done: data.tasks.filter((t) => t.status === "done" && t.completedAt && inMonth(toISODate(new Date(t.completedAt)))).length,
      events: blocks.filter((b) => inMonth(b.date)).length,
    }
  }, [data.tasks, blocks, monthKey])

  const weekdayNames = Array.from({ length: 7 }, (_, i) => formatDay(addDays(gridStart, i), "EEE"))
  const selTasks = tasksByDay.get(selected) ?? []
  const selBlocks = blocksByDay.get(selected) ?? []
  const selHabits = habitsForDay(data.habits, byHabit, selected, prefs.weekStartsOn)
  const selReflection = data.reflections.find((r) => r.date === selected)
  const mood = selReflection ? MOODS.find((m) => m.value === selReflection.mood) : null

  return (
    <PageTransition>
      <PageHeader
        title="Calendar"
        description="Deadlines and time blocks across the month. Pick a day to see and plan it."
        actions={
          <Button onClick={() => openBlockEditor({ date: selected })}>
            <CalendarPlus /> Add to {selected === today ? "today" : formatDay(selected, "d MMM")}
          </Button>
        }
      />
      <div className="grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{format(fromISODate(anchor), "MMMM yyyy")}</h2>
              <div className="mt-2 flex gap-6 text-sm">
                <span>
                  <span className="text-lg font-semibold">{String(monthStats.due).padStart(2, "0")}</span> <span className="text-muted-foreground">open due</span>
                </span>
                <span>
                  <span className="text-lg font-semibold">{String(monthStats.done).padStart(2, "0")}</span> <span className="text-muted-foreground">finished</span>
                </span>
                <span>
                  <span className="text-lg font-semibold">{String(monthStats.events).padStart(2, "0")}</span> <span className="text-muted-foreground">blocks</span>
                </span>
              </div>
            </div>
            <div className="flex items-center rounded-control border border-line bg-surface p-1">
              <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(toISODate(addMonths(fromISODate(anchor), -1)))}>
                <ChevronLeft />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMonth(null)
                  setSelected(today)
                }}
              >
                Today
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth(toISODate(addMonths(fromISODate(anchor), 1)))}>
                <ChevronRight />
              </Button>
            </div>
          </div>

          <div role="grid" aria-label={format(fromISODate(anchor), "MMMM yyyy")} className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {weekdayNames.map((n) => (
              <div key={n} role="columnheader" className="pb-1 text-center text-[11px] font-medium text-muted-foreground">
                {n}
              </div>
            ))}
            {days.map((d) => {
              const inMonth = d.startsWith(monthKey)
              const tasks = tasksByDay.get(d) ?? []
              const open = tasks.filter((t) => t.status !== "done")
              const dayBlocks = blocksByDay.get(d) ?? []
              const isSel = d === selected
              const isToday = d === today
              const overdue = open.length > 0 && daysBetween(today, d) < 0
              return (
                <button
                  key={d}
                  type="button"
                  role="gridcell"
                  aria-selected={isSel}
                  aria-label={`${formatDay(d, "EEEE d MMMM")}: ${open.length} open task${open.length === 1 ? "" : "s"}, ${dayBlocks.length} block${dayBlocks.length === 1 ? "" : "s"}`}
                  onClick={() => setSelected(d)}
                  onDoubleClick={() => {
                    setPlannerDate(d === today ? null : d)
                    router.push("/today")
                  }}
                  className={cn(
                    "group flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl transition-colors sm:aspect-[1.15]",
                    inMonth ? "bg-surface-2/50 hover:bg-surface-3" : "opacity-40 hover:opacity-70",
                    isSel && "bg-surface-3 ring-1 ring-foreground/20",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full text-sm font-medium tabular sm:size-9",
                      isToday && "bg-violet text-primary-foreground",
                      !isToday && isSel && "ring-2 ring-violet",
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                  <span className="flex h-1.5 items-center gap-1" aria-hidden>
                    {open.length > 0 && <span className={cn("size-1.5 rounded-full", overdue ? "bg-rose" : "bg-violet")} />}
                    {dayBlocks.length > 0 && <span className="size-1.5 rounded-full bg-cyan" />}
                    {tasks.length > 0 && open.length === 0 && <span className="size-1.5 rounded-full bg-mint" />}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-violet" /> Tasks due
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-rose" /> Overdue
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-mint" /> All done
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-cyan" /> Time blocks
            </span>
            <span className="ml-auto hidden sm:inline">Double-click a day to open it in My Day</span>
          </div>
        </Panel>

        <Panel>
          <PanelHeader
            title={selected === today ? "Today" : formatDay(selected, "EEEE")}
            subtitle={formatDay(selected, "d MMMM yyyy")}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPlannerDate(selected === today ? null : selected)
                  router.push("/today")
                }}
              >
                My Day <ArrowUpRight />
              </Button>
            }
          />
          <section aria-label="Tasks due">
            <h3 className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Due</h3>
            {selTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing due.</p>
            ) : (
              <ul className="-mx-1 space-y-0.5">
                {selTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5 hover:bg-surface-2/60">
                    <Checkbox className="rounded-full" checked={t.status === "done"} onCheckedChange={() => void toggleDone(t)} aria-label={`Toggle ${t.title}`} />
                    <button type="button" onClick={() => openTaskEditor(t.id)} className={cn("min-w-0 flex-1 truncate text-left text-sm", t.status === "done" && "text-muted-foreground line-through")}>
                      {t.title}
                    </button>
                    <PriorityFlag priority={t.priority} />
                  </li>
                ))}
              </ul>
            )}
            <Button size="xs" variant="ghost" className="mt-1 -ml-2" onClick={() => openTaskEditor(null, { dueDate: selected })}>
              <Plus /> Task due this day
            </Button>
          </section>

          <section aria-label="Time blocks" className="mt-5">
            <h3 className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Timeline</h3>
            {selBlocks.length === 0 ? (
              <EmptyState compact icon={CalendarPlus} title="No blocks" action={<Button size="sm" variant="outline" onClick={() => openBlockEditor({ date: selected })}><Plus /> Add a block</Button>} />
            ) : (
              <ul className="space-y-1.5">
                {selBlocks.map((b) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => openBlockEditor({ blockId: b.id })} className="flex w-full items-center gap-3 rounded-xl border border-line p-2.5 text-left hover:bg-surface-2/60">
                      <span className={cn("h-8 w-1 rounded-full", ACCENT_CLASSES[KIND_TONE[b.kind]].bg)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{b.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatClock(b.start)} – {formatClock(b.end)} · {KIND_LABEL[b.kind]}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(selHabits.length > 0 || mood) && daysBetween(selected, today) >= 0 && (
            <section aria-label="Habits and reflection" className="mt-5">
              <h3 className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Habits & mood</h3>
              {selHabits.length > 0 && (
                <p className="text-sm">
                  {selHabits.filter((h) => h.done).length} of {selHabits.length} habits kept
                </p>
              )}
              {mood && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span className={cn("size-2 rounded-full", mood.hue)} /> Felt {mood.label.toLowerCase()}
                  {selReflection?.wins && ` · "${selReflection.wins.slice(0, 60)}${selReflection.wins.length > 60 ? "…" : ""}"`}
                </p>
              )}
            </section>
          )}
        </Panel>
      </div>
    </PageTransition>
  )
}
