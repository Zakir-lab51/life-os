"use client"

import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, GripVertical, NotebookPen, Plus, Sunrise, Sunset, WandSparkles } from "lucide-react"
import Link from "next/link"
import { useMemo } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader, PageTransition } from "@/components/os/page-header"
import { Panel, PanelHeader } from "@/components/os/panel"
import { EmptyState, HatchBar, PriorityFlag } from "@/components/os/visuals"
import { db } from "@/lib/db/db"
import { useBlocks, useNow, useReflection, useRoutineChecks } from "@/lib/db/hooks"
import { createBlock, moveTasksToDate, toggleRoutine } from "@/lib/db/repo"
import { addDays, daysBetween, formatClock, formatDay, formatDuration, relativeDayLabel, roundUpTo } from "@/lib/domain/dates"
import { freeSlots, totalFree } from "@/lib/domain/planner"
import { recommendTasks } from "@/lib/domain/scheduling"
import { isOverdue } from "@/lib/domain/tasks"
import type { RoutineItem, Task } from "@/lib/domain/types"
import { attempt, succeeded } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { useLife, type Life } from "@/features/shell/use-life"
import { MOODS } from "./reflection-dialog"
import { TASK_DRAG_TYPE, Timeline } from "./timeline"

export function MyDayView() {
  const life = useLife()
  const plannerDate = useUI((s) => s.plannerDate)
  const date = plannerDate ?? life?.today ?? ""
  const blocks = useBlocks(date)
  if (!life || !blocks) {
    return (
      <div className="grid gap-4 @4xl/main:grid-cols-[1fr_340px]" aria-busy="true">
        <Skeleton className="h-[640px] rounded-panel" />
        <Skeleton className="h-96 rounded-panel" />
      </div>
    )
  }
  return <MyDay life={life} date={date} blocks={blocks} />
}

function MyDay({ life, date, blocks }: { life: Life; date: string; blocks: NonNullable<ReturnType<typeof useBlocks>> }) {
  const { data, prefs, today } = life
  const setPlannerDate = useUI((s) => s.setPlannerDate)
  const setPlanOpen = useUI((s) => s.setPlanOpen)
  const openBlockEditor = useUI((s) => s.openBlockEditor)
  const isToday = date === today
  const isPast = daysBetween(today, date) < 0
  const now = new Date(useNow(60_000))
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const tasksById = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks])

  const from = isToday ? Math.max(prefs.dayStartMin, nowMin) : prefs.dayStartMin
  const free = isPast ? 0 : totalFree(blocks, from, prefs.dayEndMin)
  const planned = blocks.reduce((a, b) => a + (b.end - b.start), 0)

  const overdue = data.tasks.filter((t) => isOverdue(t, today))
  const unscheduled = useMemo(() => {
    const scheduledIds = new Set(blocks.map((b) => b.taskId).filter(Boolean))
    const due = data.tasks.filter((t) => t.status !== "done" && !scheduledIds.has(t.id) && t.dueDate && daysBetween(t.dueDate, date) >= 0)
    const ids = new Set(due.map((t) => t.id))
    const extra = recommendTasks(data.tasks, { today: date, freeMinutes: free }, 8)
      .map((r) => r.task)
      .filter((t) => !ids.has(t.id) && !scheduledIds.has(t.id))
    return [...due.sort((a, b) => a.priority - b.priority), ...extra].slice(0, 10)
  }, [data.tasks, blocks, date, free])

  const scheduleNext = async (task: Task) => {
    const len = Math.min(120, Math.max(15, roundUpTo(task.estimateMin, 15)))
    const slot = freeSlots(blocks, roundUpTo(from, 15), prefs.dayEndMin).find((s) => s.end - s.start >= len)
    if (!slot) {
      toast.error("No free gap that long", { description: "Drag it onto the timeline instead, or shorten the estimate." })
      return
    }
    const ok = await attempt(() => createBlock({ date, start: slot.start, end: slot.start + len, title: task.title, kind: len >= 45 ? "focus" : "task", taskId: task.id }))
    if (ok) toast.success(`Scheduled at ${formatClock(slot.start)}`, { description: task.title })
  }

  const rescheduleOverdue = async (target: string) => {
    const snapshot = overdue.map((t) => ({ id: t.id, dueDate: t.dueDate }))
    if (!(await succeeded(() => moveTasksToDate(snapshot.map((s) => s.id), target)))) return
    toast.success(`Moved ${snapshot.length} overdue task${snapshot.length === 1 ? "" : "s"} to ${target === today ? "today" : "tomorrow"}`, {
      action: {
        label: "Undo",
        onClick: () =>
          void attempt(() =>
            db.transaction("rw", db.tasks, async () => {
              for (const s of snapshot) await db.tasks.update(s.id, { dueDate: s.dueDate })
            }),
          ),
      },
    })
  }

  return (
    <PageTransition>
      <PageHeader
        eyebrow={isToday ? "My Day" : isPast ? "Looking back" : "Planning ahead"}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {isToday ? "Today" : relativeDayLabel(date, today)}
            <span className="text-lg font-normal text-muted-backdrop">{formatDay(date, "EEEE, d MMMM")}</span>
          </span>
        }
        description={isPast ? "A record of how this day was spent." : `${formatDuration(planned)} planned · ${formatDuration(free)} free${isToday ? " from now" : ""}`}
        actions={
          <>
            <div className="flex items-center rounded-control border border-line bg-surface p-1">
              <Button variant="ghost" size="icon-sm" aria-label="Previous day" onClick={() => setPlannerDate(addDays(date, -1))}>
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="sm" disabled={isToday} onClick={() => setPlannerDate(null)}>
                Today
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Next day" onClick={() => setPlannerDate(addDays(date, 1))}>
                <ChevronRight />
              </Button>
            </div>
            <Button variant="outline" onClick={() => openBlockEditor({ date })}>
              <Plus /> Block
            </Button>
            {!isPast && (
              <Button onClick={() => setPlanOpen(true)}>
                <WandSparkles /> Plan my day
              </Button>
            )}
          </>
        }
      />

      {isToday && overdue.length > 0 && (
        <Panel className="mb-4 flex-row flex-wrap items-center gap-3 py-4">
          <CalendarClock className="size-5 text-amber" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {overdue.length} overdue task{overdue.length === 1 ? "" : "s"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{overdue.map((t) => t.title).join(" · ")}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void rescheduleOverdue(today)}>
            Move to today
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void rescheduleOverdue(addDays(today, 1))}>
            Tomorrow
          </Button>
        </Panel>
      )}

      <div className="grid items-start gap-4 @4xl/main:grid-cols-[minmax(0,1fr)_340px]">
        <Panel className="p-3 sm:p-5">
          {blocks.length === 0 && !isPast && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line p-4">
              <WandSparkles className="size-5 text-violet" />
              <p className="flex-1 text-sm text-muted-foreground">An empty day. Let LIFE OS suggest a plan, drag tasks in from the right, or click any time slot.</p>
              <Button size="sm" onClick={() => setPlanOpen(true)}>
                Plan my day
              </Button>
            </div>
          )}
          <Timeline date={date} isToday={isToday} blocks={blocks} tasksById={tasksById} />
        </Panel>

        <div className="space-y-4">
          {!isPast && (
            <Panel>
              <PanelHeader title="To schedule" subtitle="Drag onto the timeline, or tap to place in the next free gap" />
              {unscheduled.length === 0 ? (
                <EmptyState compact icon={CalendarPlus} title="Everything due is scheduled" />
              ) : (
                <ul className="-mx-1 space-y-1">
                  {unscheduled.map((t) => (
                    <li
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(TASK_DRAG_TYPE, t.id)
                        e.dataTransfer.setData("text/plain", t.title)
                        e.dataTransfer.effectAllowed = "copy"
                      }}
                      className="group flex cursor-grab items-center gap-2 rounded-xl px-2 py-2 hover:bg-surface-2/70 active:cursor-grabbing"
                    >
                      <GripVertical className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <PriorityFlag priority={t.priority} />
                          {formatDuration(t.estimateMin)}
                          {t.dueDate && <span>{relativeDayLabel(t.dueDate, today)}</span>}
                        </p>
                      </div>
                      <Button size="icon-sm" variant="ghost" aria-label={`Schedule ${t.title} in the next free gap`} onClick={() => void scheduleNext(t)}>
                        <CalendarPlus />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          <Routines date={date} items={prefs.routines.morning} title="Morning routine" icon={<Sunrise className="size-4 text-amber" />} />
          <Routines date={date} items={prefs.routines.evening} title="Evening routine" icon={<Sunset className="size-4 text-violet" />} />
          {!(daysBetween(today, date) > 0) && <ReflectionCard date={date} isToday={isToday} />}
        </div>
      </div>
    </PageTransition>
  )
}

function Routines({ date, items, title, icon }: { date: string; items: RoutineItem[]; title: string; icon: React.ReactNode }) {
  const checks = useRoutineChecks(date)
  const done = new Set(checks?.map((c) => c.itemId))
  const count = items.filter((i) => done.has(i.id)).length
  return (
    <Panel>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="font-semibold">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground tabular">
          {count}/{items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No steps yet. <Link href="/settings#routines" className="underline underline-offset-2">Add some in Settings</Link>.
        </p>
      ) : (
        <>
          <HatchBar value={items.length ? count / items.length : 0} tone="amber" height={6} className="mb-3" />
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.id}>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-sm hover:bg-surface-2/60">
                  <Checkbox checked={done.has(item.id)} onCheckedChange={() => void attempt(() => toggleRoutine(date, item.id))} />
                  <span className={cn("strike", done.has(item.id) && "is-done")}>{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

function ReflectionCard({ date, isToday }: { date: string; isToday: boolean }) {
  const reflection = useReflection(date)
  const setPlannerDate = useUI((s) => s.setPlannerDate)
  const setReflectionOpen = useUI((s) => s.setReflectionOpen)
  const open = () => {
    if (!isToday) setPlannerDate(date)
    setReflectionOpen(true)
  }
  if (reflection === undefined) return null
  const mood = reflection ? MOODS.find((m) => m.value === reflection.mood) : null
  return (
    <Panel>
      <div className="mb-3 flex items-center gap-2">
        <NotebookPen className="size-4 text-cyan" />
        <h2 className="font-semibold">Reflection</h2>
        {mood && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={cn("size-2 rounded-full", mood.hue)} /> {mood.label}
          </span>
        )}
      </div>
      {reflection ? (
        <div className="space-y-2 text-sm">
          {reflection.wins && (
            <p>
              <span className="text-xs text-muted-foreground">Went well · </span>
              {reflection.wins}
            </p>
          )}
          {reflection.improve && (
            <p>
              <span className="text-xs text-muted-foreground">Next time · </span>
              {reflection.improve}
            </p>
          )}
          <Button size="sm" variant="ghost" className="-ml-2" onClick={open}>
            Edit
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{isToday ? "Close the day: what went well, what to adjust." : "No reflection written for this day."}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={open}>
            Write reflection
          </Button>
        </>
      )}
    </Panel>
  )
}
