"use client"

import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, CornerDownLeft, GripVertical, MousePointerClick, NotebookPen, Plus, Sunrise, Sunset, WandSparkles, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
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
import { parseQuickBlock } from "@/lib/domain/quick-block"
import { recommendTasks } from "@/lib/domain/scheduling"
import { isOverdue } from "@/lib/domain/tasks"
import type { Block, RoutineItem, Task } from "@/lib/domain/types"
import { attempt, succeeded } from "@/lib/feedback"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { useLife, type Life } from "@/features/shell/use-life"
import { MOODS } from "./reflection-dialog"
import { KIND_LABEL } from "./block-editor"
import { DayJump } from "./day-jump"
import { addBlock } from "./quick-create"
import { TASK_DRAG_TYPE, Timeline, taskLength } from "./timeline"

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
  const isToday = date === today
  const isPast = daysBetween(today, date) < 0
  const now = new Date(useNow(60_000))
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const tasksById = useMemo(() => new Map(data.tasks.map((t) => [t.id, t])), [data.tasks])
  // a task chosen from "To schedule", waiting for a tap on the timeline
  const [placing, setPlacing] = useState<Task | null>(null)
  const timeline = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!placing) return
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlacing(null)
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [placing])
  const choose = (t: Task) => {
    setPlacing((p) => (p?.id === t.id ? null : t))
    timeline.current?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

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
    const len = taskLength(task)
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
              <span aria-hidden className="mx-0.5 h-5 w-px bg-line" />
              <DayJump date={date} onPick={(d) => setPlannerDate(d === today ? null : d)} />
            </div>
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
          <CalendarClock className="size-5 shrink-0 text-amber" />
          {/* wide enough to read; the buttons wrap below it on a phone */}
          <div className="min-w-[12rem] flex-1">
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
        <div ref={timeline} className="min-w-0 scroll-mt-24">
          <Panel className="p-3 sm:p-5">
            {!isPast && <QuickAdd date={date} isToday={isToday} nowMin={nowMin} dayStart={prefs.dayStartMin} dayEnd={prefs.dayEndMin} blocks={blocks} />}
            {placing && <PlacingBar task={placing} onStop={() => setPlacing(null)} />}
            {blocks.length === 0 && !isPast && (
              <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line p-4">
                <WandSparkles className="size-5 text-violet" />
                <p className="flex-1 text-sm text-muted-foreground">An empty day. Type a block above, draw one on the timeline, or let LIFE OS suggest a plan.</p>
                <Button size="sm" onClick={() => setPlanOpen(true)}>
                  Plan my day
                </Button>
              </div>
            )}
            <Timeline date={date} isToday={isToday} blocks={blocks} tasksById={tasksById} suggestions={unscheduled} placing={placing} onPlaced={() => setPlacing(null)} />
          </Panel>
        </div>

        <div className="space-y-4">
          {!isPast && (
            <Panel>
              <PanelHeader title="To schedule" subtitle="Tap one, then tap a time on the timeline. Or drag it there, or put it in the next free gap." />
              {unscheduled.length === 0 ? (
                <EmptyState compact tone="clear" icon={CalendarPlus} title="Everything due is scheduled" />
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
                      className={cn("group flex cursor-grab items-center gap-1 rounded-xl px-1 py-1 transition-colors hover:bg-surface-2/70 active:cursor-grabbing", placing?.id === t.id && "bg-violet/15 ring-1 ring-violet/50")}
                    >
                      <GripVertical className="size-4 shrink-0 text-muted-foreground/50" aria-hidden />
                      <button type="button" aria-pressed={placing?.id === t.id} onClick={() => choose(t)} className="min-w-0 flex-1 rounded-lg px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <p className="truncate text-sm font-medium">{t.title}</p>
                        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <PriorityFlag priority={t.priority} />
                          {formatDuration(t.estimateMin)}
                          {t.dueDate && <span>{relativeDayLabel(t.dueDate, today)}</span>}
                        </p>
                      </button>
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
                  <span className={cn("strike strike-text", done.has(item.id) && "is-done")}>{item.label}</span>
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

/**
 * The quickest way in: type a block in one line ("Gym 6pm 1h", "Revise anatomy 2-3:30pm",
 * "Call home 20m"). Below it, where it will go, as you type; Enter adds it and keeps the
 * field ready for the next. Without a time it goes in the next free gap that fits.
 */
function QuickAdd({ date, isToday, nowMin, dayStart, dayEnd, blocks }: { date: string; isToday: boolean; nowMin: number; dayStart: number; dayEnd: number; blocks: Block[] }) {
  const [text, setText] = useState("")
  const parsed = useMemo(() => parseQuickBlock(text, { nowMin, isToday, dayStart, dayEnd, blocks }), [text, nowMin, isToday, dayStart, dayEnd, blocks])
  const add = async () => {
    if (!parsed.ok) return
    const b = parsed.block
    if (await addBlock({ date, start: b.start, end: b.end, title: b.title, kind: b.kind })) setText("")
  }
  const hint = !text.trim()
    ? "Try \u201cGym 6pm 1h\u201d, \u201cRevise anatomy 2-3:30pm\u201d or \u201cCall home 20m\u201d."
    : parsed.ok
      ? `${parsed.block.title} \u00b7 ${formatClock(parsed.block.start)}\u2013${formatClock(parsed.block.end)} \u00b7 ${formatDuration(parsed.block.end - parsed.block.start)} \u00b7 ${KIND_LABEL[parsed.block.kind]}${parsed.block.placed === "gap" ? " \u00b7 next free gap" : ""}`
      : parsed.reason === "no-title"
        ? "Add what it\u2019s for, like \u201cGym 6pm\u201d."
        : parsed.reason === "no-gap"
          ? `No free ${formatDuration(parsed.minutes)} left${isToday ? " today" : ""}. Give it a time, like \u201c${parsed.title} 6pm\u201d.`
          : ""
  return (
    <form
      className="mb-4"
      onSubmit={(e) => {
        e.preventDefault()
        void add()
      }}
    >
      <div className="flex h-11 items-center gap-2 rounded-control border border-line bg-surface pr-1.5 pl-3.5 transition-shadow focus-within:ring-2 focus-within:ring-ring">
        <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a block: what, when, how long"
          aria-label="Add a time block"
          aria-describedby="quick-add-hint"
          enterKeyHint="done"
          maxLength={160}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {text.trim() && (
          <Button type="submit" size="sm" disabled={!parsed.ok} className="h-8">
            Add <CornerDownLeft className="size-3.5" />
          </Button>
        )}
      </div>
      <p id="quick-add-hint" aria-live="polite" className={cn("mt-1.5 min-h-4 truncate px-3.5 text-xs tabular", parsed.ok ? "text-foreground/80" : "text-muted-foreground")}>
        {hint}
      </p>
    </form>
  )
}

/**
 * While a task waits for a tap on the timeline: what's being placed and how long, floating
 * above the tab bar so neither showing nor dropping it moves the timeline under your finger.
 * Portalled out of the glass panel, whose backdrop filter would otherwise pin it inside.
 */
function PlacingBar({ task, onStop }: { task: Task; onStop: () => void }) {
  return createPortal(
    <div
      className="fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+4.75rem)] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-violet/40 bg-popover py-2 pr-1.5 pl-3.5 text-popover-foreground shadow-2xl animate-in fade-in-0 slide-in-from-bottom-2 md:bottom-6"
      role="status"
    >
      <MousePointerClick className="size-4 shrink-0 text-violet" aria-hidden />
      <p className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{task.title}</span>
        <span className="block text-xs text-muted-foreground tabular">Tap a time on the timeline · {formatDuration(taskLength(task))}</span>
      </p>
      <Button size="icon-sm" variant="ghost" aria-label="Stop placing" onClick={onStop}>
        <X />
      </Button>
    </div>,
    document.body,
  )
}
