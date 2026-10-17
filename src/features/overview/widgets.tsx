"use client"

import {
  ArrowUpRight,
  Brain,
  CalendarClock,
  Check,
  ChevronDown,
  Flame,
  Lightbulb,
  Lock,
  Play,
  Plus,
  Repeat,
  Sparkles,
  Timer,
  Trophy,
  TriangleAlert,
  WandSparkles,
} from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { motion } from "motion/react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { HabitMark } from "@/components/os/habit-mark"
import { ChartFrame } from "@/components/os/chart"
import { Icon } from "@/components/os/icon"
import { RollingText } from "@/components/os/rolling-text"
import { Panel, PanelHeader } from "@/components/os/panel"
import { AreaBadge, EmptyState, HatchBar, PriorityFlag, RingGauge } from "@/components/os/visuals"
import { useNow } from "@/lib/db/hooks"
import { toggleHabitLog } from "@/lib/db/repo"
import { ACCENT_CLASSES } from "@/lib/domain/areas"
import { addDays, daysBetween, formatClock, formatDay, formatDuration, relativeDayLabel, startOfWeek, toISODate } from "@/lib/domain/dates"
import type { Briefing } from "@/lib/domain/briefing"
import { elapsedMs, formatTimer, remainingMs } from "@/lib/domain/focus"
import { currentStreak, habitsForDay, logsByHabit, overallConsistency } from "@/lib/domain/habits"
import type { Insight } from "@/lib/domain/insights"
import { findConflicts } from "@/lib/domain/planner"
import type { DailyScore, RadarValue } from "@/lib/domain/scores"
import { isOverdue } from "@/lib/domain/tasks"
import type { Block, Task } from "@/lib/domain/types"
import { ACHIEVEMENTS, focusStreak, type XPBreakdown, type LevelInfo, type Stats } from "@/lib/domain/xp"
import { attempt } from "@/lib/feedback"
import { useFocus } from "@/lib/stores/focus"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import type { Life } from "@/features/shell/use-life"
import { toggleDone, useSettling, wasJustCompleted } from "@/features/tasks/task-actions"
import { KIND_LABEL } from "@/features/planner/block-editor"

/* ── greeting & score ───────────────────────────────── */

// the charts library loads after Overview has drawn (see charts.tsx); the boxes keep their size meanwhile
const LifeRadar = dynamic(() => import("./charts").then((m) => m.LifeRadar), { ssr: false })
const FocusWeek = dynamic(() => import("./charts").then((m) => m.FocusWeek), { ssr: false })

export function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return { hello: "Good morning", line: "Let's make today count." }
  if (hour >= 12 && hour < 17) return { hello: "Good afternoon", line: "Keep the momentum going." }
  if (hour >= 17 && hour < 21) return { hello: "Good evening", line: "Finish strong, then rest." }
  return { hello: "Good night", line: "Rest is part of the plan." }
}

export function HeroWidget({ life, score }: { life: Life; score: DailyScore }) {
  const now = new Date(useNow(1000))
  const g = greetingFor(now.getHours())
  const name = life.prefs.name.trim()
  return (
    <Panel className="overflow-hidden @3xl/main:col-span-2">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-violet/20 blur-3xl" />
      <div className="relative flex flex-col gap-6 @2xl:flex-row @2xl:items-center @2xl:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-2 text-[2rem] leading-[1.08] font-semibold tracking-tight sm:text-[2.5rem]">
            {g.hello}
            {name ? `, ${name}` : ""}.
            <span className="block text-muted-foreground">{g.line}</span>
          </h1>
          <p className="mt-4 text-[2.6rem] leading-none font-semibold tracking-tight" aria-label="Current time">
            <RollingText text={now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} className="tabular" />
            <RollingText text={String(now.getSeconds()).padStart(2, "0")} className="ml-1 align-top text-base font-medium text-muted-foreground tabular" />
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <RingGauge value={score.score} size={150} stroke={12} label={score.score === null ? "Productivity score: no data yet" : `Productivity score ${score.score} out of 100`}>
            <div>
              <RollingText text={String(score.score ?? "–")} className="text-[2.75rem] leading-none font-semibold tracking-tight tabular" />
              <div className="mt-1 text-[11px] text-muted-foreground">today&apos;s score</div>
            </div>
          </RingGauge>
          <ul className="min-w-40 flex-1 space-y-2.5 text-sm @2xl:flex-none">
            {score.parts.length === 0 ? (
              <li className="max-w-40 text-xs text-muted-foreground">Your score appears after your first task, habit or focus session today.</li>
            ) : (
              score.parts.map((p) => (
                <li key={p.key}>
                  <div className="flex justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{p.label}</span>
                    <span className="font-medium tabular">{Math.round(p.value * 100)}%</span>
                  </div>
                  <HatchBar value={p.value} tone={p.key === "tasks" ? "violet" : p.key === "focus" ? "cyan" : "mint"} height={6} className="mt-1" />
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{p.detail}</div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </Panel>
  )
}

/* ── briefing ───────────────────────────────────────── */

export function BriefingWidget({ briefing, life }: { briefing: Briefing; life: Life }) {
  const [how, setHow] = useState(false)
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  const setPlanOpen = useUI((s) => s.setPlanOpen)
  const setPlannerDate = useUI((s) => s.setPlannerDate)
  const router = useRouter()
  const focusBegin = useFocus((s) => s.begin)
  const timerStatus = useFocus((s) => s.timer.status)

  const startFocus = (taskId: string, minutes: number, title: string) => {
    if (timerStatus !== "idle") {
      toast("A timer is already running")
      router.push("/focus")
      return
    }
    focusBegin({ mode: "custom", phase: "focus", minutes, taskId })
    toast.success(`Focus started · ${minutes} min`, { description: title })
    router.push("/focus")
  }

  const empty = !briefing.priorities.length && !briefing.unfinished.length && !briefing.habitsLeft.length && !briefing.upcoming.length

  return (
    <Panel className="@3xl/main:col-span-2 @5xl/main:row-span-2">
      <PanelHeader
        title="Daily briefing"
        subtitle="Rule-based · updates as you work"
        icon={Sparkles}
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPlannerDate(null)
              router.push("/today")
              setPlanOpen(true)
            }}
          >
            <WandSparkles /> Plan my day
          </Button>
        }
      />
      <p className="text-[1.05rem] leading-snug font-medium text-balance">{briefing.headline}</p>

      {empty ? (
        <EmptyState
          compact
          icon={Sparkles}
          title="Nothing on your plate yet"
          body="Capture a few tasks or add a habit, and your briefing will rank what to do first."
          action={
            <Button size="sm" onClick={() => useUI.getState().setCapture(true)}>
              <Plus /> Capture a task
            </Button>
          }
        />
      ) : (
        <div className="mt-5 grid gap-5 @2xl:grid-cols-[1.25fr_1fr]">
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Top priorities</h3>
            {briefing.priorities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open tasks right now.</p>
            ) : (
              <ol className="space-y-2">
                {briefing.priorities.map((r, i) => (
                  <li key={r.task.id} className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2/50 p-3">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold", i === 0 ? "bg-violet text-primary-foreground" : "bg-surface-3")}>{String(i + 1).padStart(2, "0")}</span>
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => openTaskEditor(r.task.id)} className="text-left font-medium hover:underline">
                        {r.task.title}
                      </button>
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.reasons.slice(0, 3).join(" · ")}</p>
                    </div>
                    <Checkbox className="mt-1.5 size-5 rounded-full" checked={false} onCheckedChange={() => void toggleDone(r.task)} aria-label={`Complete ${r.task.title}`} />
                  </li>
                ))}
              </ol>
            )}

            {briefing.focus.length > 0 && (
              <>
                <h3 className="mt-5 mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Suggested focus</h3>
                <ul className="space-y-2">
                  {briefing.focus.map((f) => (
                    <li key={f.taskId} className="flex items-center gap-3 rounded-2xl border border-line p-3">
                      <Timer className="size-4 shrink-0 text-cyan" />
                      <div className="min-w-0 flex-1 text-sm">
                        <span className="font-medium">{formatDuration(f.minutes)}</span> on <span className="font-medium">{f.title}</span>
                        <span className="block text-xs text-muted-foreground">{f.at !== null ? `Free from ${formatClock(f.at)}` : "No free gap that long today: try a shorter session"}</span>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => startFocus(f.taskId, f.minutes, f.title)}>
                        <Play /> Start
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="space-y-5">
            {briefing.unfinished.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  <TriangleAlert className="size-3.5 text-amber" /> Needs attention
                </h3>
                <ul className="space-y-1">
                  {briefing.unfinished.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => openTaskEditor(t.id)} className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                        <PriorityFlag priority={t.priority} />
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        {t.dueDate && <span className={cn("shrink-0 text-xs", isOverdue(t, life.today) ? "text-foreground" : "text-muted-foreground")}>{relativeDayLabel(t.dueDate, life.today)}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {briefing.habitsLeft.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Habits to complete</h3>
                <div className="flex flex-wrap gap-1.5">
                  {briefing.habitsLeft.map(({ habit, progress }) => (
                    <button
                      key={habit.id}
                      type="button"
                      onClick={async () => {
                        const done = await attempt(() => toggleHabitLog(habit.id, life.today))
                        if (done) toast.success(`${habit.name} · checked in`)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-control border border-line py-1.5 pr-3 pl-1.5 text-sm transition-colors hover:border-foreground/30"
                    >
                      <span className={cn("grid size-6 place-items-center rounded-full", ACCENT_CLASSES[habit.color].soft, ACCENT_CLASSES[habit.color].text)}>
                        <Icon name={habit.icon} className="size-3.5" />
                      </span>
                      {habit.name}
                      {progress && <span className="text-xs text-muted-foreground tabular">{progress.count}/{progress.target}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {briefing.upcoming.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">Still on today&apos;s timeline</h3>
                <ul className="space-y-1 text-sm">
                  {briefing.upcoming.map((b) => (
                    <li key={b.id} className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-xs text-muted-foreground tabular">{formatClock(b.start)}</span>
                      <span className="truncate">{b.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <button type="button" onClick={() => setHow((h) => !h)} aria-expanded={how} className="mt-5 flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn("size-3.5 transition-transform", how && "rotate-180")} /> How this briefing works
      </button>
      {how && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {briefing.rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/* ── today's tasks ─────────────────────────────────── */

export function TodayWidget({ life }: { life: Life }) {
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  // a task just ticked stays put while its line is drawn, then glides down to the finished ones
  const settling = useSettling()
  const { open, doneToday } = useMemo(() => {
    const { tasks } = life.data
    const listedOpen = (t: Task) => t.status !== "done" || settling.has(t.id)
    const open = tasks
      .filter((t) => listedOpen(t) && t.dueDate && daysBetween(t.dueDate, life.today) >= 0)
      .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : a.priority - b.priority))
    // oldest first, so the one you just finished lands at the very bottom
    const doneToday = tasks
      .filter((t) => !listedOpen(t) && t.completedAt && toISODate(new Date(t.completedAt)) === life.today)
      .sort((a, b) => (a.completedAt ?? "").localeCompare(b.completedAt ?? ""))
    return { open, doneToday }
  }, [life, settling])
  const openCount = open.filter((t) => t.status !== "done").length

  return (
    <Panel>
      <PanelHeader
        title="Today"
        subtitle={`${openCount} open · ${doneToday.length + open.length - openCount} done`}
        action={
          <Button size="icon-sm" variant="outline" aria-label="Add a task for today" onClick={() => openTaskEditor(null, { dueDate: life.today })}>
            <Plus />
          </Button>
        }
      />
      {open.length === 0 && doneToday.length === 0 ? (
        <EmptyState compact tone="clear" icon={Check} title="Nothing due today" body="Add a task, or pull one forward from Tasks." />
      ) : (
        // one list, so a finished task's row moves (and glides) rather than being rebuilt
        <ul className="-mx-2 space-y-0.5">
          {[...open.slice(0, 7), ...doneToday.slice(-3)].map((t) => (
            <TaskLine key={t.id} task={t} today={life.today} onOpen={() => openTaskEditor(t.id)} />
          ))}
        </ul>
      )}
      {open.length > 7 && (
        <Link href="/tasks" className="mt-2 text-xs text-muted-foreground hover:text-foreground">
          +{open.length - 7} more in Tasks
        </Link>
      )}
    </Panel>
  )
}

function TaskLine({ task, today, onOpen }: { task: Task; today: string; onOpen: () => void }) {
  const done = task.status === "done"
  const overdue = isOverdue(task, today)
  return (
    <motion.li layout="position" className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2/70">
      <Checkbox className="size-[18px] rounded-full" checked={done} celebrate={wasJustCompleted(task.id)} onCheckedChange={() => void toggleDone(task)} aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`} />
      <button type="button" onClick={onOpen} className={cn("strike min-w-0 flex-1 truncate text-left text-sm", done && "is-done")}>
        <span className="strike-text">{task.title}</span>
      </button>
      {task.dependsOn.length > 0 && !done && <Lock className="size-3 text-muted-foreground" aria-label="Waiting on another task" />}
      {overdue ? <span className="shrink-0 rounded-control bg-rose/20 px-1.5 text-[10px] font-semibold">late</span> : <PriorityFlag priority={task.priority} />}
    </motion.li>
  )
}

/* ── life balance radar ─────────────────────────────── */

export function RadarWidget({ values }: { values: RadarValue[] }) {
  const tracked = values.filter((v) => v.value !== null)
  // short axis labels keep the chart from clipping in narrow cards; the tooltip and table use full names
  const data = values.map((v) => ({ label: v.label, axis: v.label === "Personal Growth" ? "Growth" : v.label, value: v.value ?? 0, raw: v.value }))
  return (
    <ChartFrame
      title="Life balance"
      subtitle="Last 7 days, from your own records"
      table={{ columns: ["Area", "Score", "Based on"], rows: values.map((v) => [v.label, v.value === null ? "Not tracked" : v.value, v.detail || v.how]) }}
    >
      {tracked.length < 3 ? (
        <EmptyState compact icon={Brain} title="Not enough data yet" body="Track a few tasks, habits or focus sessions across different areas to see your balance." />
      ) : (
        // long axis labels may reach a few px past the chart, into the card's padding, instead of being cut off
        <div className="h-[230px] [&_.recharts-surface]:overflow-visible">
          <LifeRadar values={values} data={data} />
        </div>
      )}
      {values.some((v) => v.value === null) && tracked.length >= 3 && (
        <p className="mt-1 text-[11px] text-muted-foreground">Not tracked yet: {values.filter((v) => v.value === null).map((v) => v.label).join(", ")} (shown at the centre).</p>
      )}
    </ChartFrame>
  )
}

/* ── habits ─────────────────────────────────────────── */

export function HabitsWidget({ life }: { life: Life }) {
  const openHabitEditor = useUI((s) => s.openHabitEditor)
  const byHabit = useMemo(() => logsByHabit(life.data.habitLogs), [life])
  const items = habitsForDay(life.data.habits, byHabit, life.today, life.prefs.weekStartsOn)
  const done = items.filter((i) => i.done).length
  return (
    <Panel>
      <PanelHeader title="Habits" subtitle={items.length ? `${done} of ${items.length} today` : "Nothing due today"} icon={Repeat} tone="mint" />
      {life.data.habits.filter((h) => !h.archivedAt).length === 0 ? (
        <EmptyState compact icon={Repeat} title="No habits yet" action={<Button size="sm" onClick={() => openHabitEditor(null)}><Plus /> New habit</Button>} />
      ) : (
        <ul className="space-y-1.5">
          {items.map(({ habit, done, progress }) => {
            const streak = currentStreak(habit, byHabit.get(habit.id) ?? new Set(), life.today, life.prefs.weekStartsOn)
            return (
              <li key={habit.id}>
                <button
                  type="button"
                  aria-pressed={done}
                  onClick={async () => {
                    const now = await attempt(() => toggleHabitLog(habit.id, life.today))
                    if (now) toast.success(`${habit.name} · checked in`, { description: streak.current > 0 ? `Streak: ${streak.current + (habit.schedule.kind === "weekly" ? 0 : 1)}` : undefined })
                  }}
                  className={cn("flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-all", done ? "border-transparent bg-surface-2/60" : "border-line hover:border-foreground/25")}
                >
                  <HabitMark habit={habit} done={done} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm font-medium", done && "text-muted-foreground")}>{habit.name}</span>
                    <span className="text-xs text-muted-foreground">{progress ? `${progress.count}/${progress.target} this week` : habit.timeOfDay === "anytime" ? "Any time" : habit.timeOfDay}</span>
                  </span>
                  {streak.current > 0 && (
                    <span className="flex items-center gap-1 text-xs font-medium tabular" title={`${streak.current}-${streak.unit} streak`}>
                      <Flame className="size-3.5 text-amber" />
                      {streak.current}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

/* ── focus ──────────────────────────────────────────── */

export function FocusWidget({ life }: { life: Life }) {
  const router = useRouter()
  const timer = useFocus((s) => s.timer)
  const begin = useFocus((s) => s.begin)
  const now = useNow(1000)
  const { todayMin, week, streak } = useMemo(() => {
    const todayMin = Math.round(life.data.sessions.filter((s) => s.date === life.today).reduce((a, s) => a + s.actualSec / 60, 0))
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(life.today, i - 6)
      return { date: d, label: formatDay(d, "EEEEE"), minutes: Math.round(life.data.sessions.filter((s) => s.date === d).reduce((a, s) => a + s.actualSec / 60, 0)) }
    })
    return { todayMin, week, streak: focusStreak(life.data.sessions, life.today) }
  }, [life])
  const target = life.prefs.focus.dailyTargetMin

  return (
    <Panel>
      <PanelHeader title="Focus" subtitle={streak > 1 ? `${streak}-day focus streak` : "Deep work today"} icon={Timer} tone="cyan" />
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className="text-4xl font-semibold tracking-tight">{todayMin}</span>
          <span className="ml-1 text-sm text-muted-foreground">/ {target} min</span>
        </div>
        {timer.status === "idle" ? (
          <Button
            size="sm"
            onClick={() => {
              begin({ mode: "pomodoro", phase: "focus", minutes: life.prefs.focus.focusMin })
              router.push("/focus")
            }}
          >
            <Play /> {life.prefs.focus.focusMin} min
          </Button>
        ) : (
          <Link href="/focus" className="rounded-control bg-violet/15 px-3 py-1.5 text-sm font-semibold tabular">
            {formatTimer(remainingMs(timer, now) ?? elapsedMs(timer, now))}
          </Link>
        )}
      </div>
      <HatchBar value={target ? todayMin / target : 0} tone="cyan" className="mt-3" height={8} />
      <div className="mt-4 h-[92px]" aria-label="Focus minutes, last 7 days">
        <FocusWeek week={week} />
      </div>
    </Panel>
  )
}

/* ── schedule ───────────────────────────────────────── */

export function ScheduleWidget({ life, blocks }: { life: Life; blocks: Block[] }) {
  const router = useRouter()
  const setPlanOpen = useUI((s) => s.setPlanOpen)
  const setPlannerDate = useUI((s) => s.setPlannerDate)
  const now = new Date(useNow(60_000))
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const conflicts = findConflicts(blocks)
  const rest = blocks.filter((b) => b.end > nowMin)
  const current = rest.find((b) => b.start <= nowMin)
  return (
    <Panel>
      <PanelHeader
        title="Up next"
        subtitle={rest.length ? `${rest.length} block${rest.length === 1 ? "" : "s"} left today` : "Timeline is clear"}
        action={
          <Link href="/today" aria-label="Open My Day" className="grid size-8 place-items-center rounded-full border border-line text-muted-foreground hover:text-foreground">
            <ArrowUpRight className="size-4" />
          </Link>
        }
      />
      {conflicts.size > 0 && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <TriangleAlert className="size-3.5 text-amber" /> {conflicts.size} blocks overlap today
        </p>
      )}
      {rest.length === 0 ? (
        <EmptyState
          compact
          icon={CalendarClock}
          title="Nothing scheduled"
          action={
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPlannerDate(null)
                router.push("/today")
                setPlanOpen(true)
              }}
            >
              <WandSparkles /> Plan my day
            </Button>
          }
        />
      ) : (
        <ol className="relative space-y-3 border-l border-line pl-4">
          {rest.slice(0, 5).map((b) => (
            <li key={b.id} className="relative">
              <span className={cn("absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-background", b === current ? "bg-violet" : "bg-surface-3")} />
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">{b.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground tabular">{formatClock(b.start)}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {KIND_LABEL[b.kind]} · {formatDuration(b.end - b.start)}
                {b === current && " · now"}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="sr-only">Today is {life.today}</p>
    </Panel>
  )
}

/* ── deadlines ──────────────────────────────────────── */

export function DeadlinesWidget({ life }: { life: Life }) {
  const openTaskEditor = useUI((s) => s.openTaskEditor)
  const items = life.data.tasks
    .filter((t) => t.status !== "done" && t.dueDate && daysBetween(life.today, t.dueDate) > 0 && daysBetween(life.today, t.dueDate) <= 14)
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
    .slice(0, 5)
  return (
    <Panel>
      <PanelHeader title="Upcoming deadlines" subtitle="Next two weeks" icon={CalendarClock} tone="lilac" />
      {items.length === 0 ? (
        <EmptyState compact tone="clear" icon={CalendarClock} title="No deadlines ahead" />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => openTaskEditor(t.id)} className="group flex w-full items-center gap-3 py-2.5 text-left">
                <span className="w-14 shrink-0 text-xs leading-tight text-muted-foreground">
                  {formatDay(t.dueDate!, "EEE, d")}
                  <span className="block text-foreground">{relativeDayLabel(t.dueDate!, life.today)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <AreaBadge area={t.area} className="mt-1" />
                </span>
                <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/* ── weekly targets (meters, styled after the reference "Tasks progress") ── */

export function WeeklyWidget({ briefing, life }: { briefing: Briefing; life: Life }) {
  const lastWeek = useMemo(() => {
    const thisStart = startOfWeek(life.today, life.prefs.weekStartsOn)
    const from = addDays(thisStart, -7)
    const elapsed = daysBetween(thisStart, life.today)
    const to = addDays(from, elapsed)
    const inRange = (d: string) => daysBetween(from, d) >= 0 && daysBetween(d, to) >= 0
    const habitRate = overallConsistency(life.data.habits, logsByHabit(life.data.habitLogs), from, to)
    return {
      tasks: life.data.tasks.filter((t) => t.status === "done" && t.completedAt && inRange(toISODate(new Date(t.completedAt)))).length,
      focus: Math.round(life.data.sessions.filter((s) => inRange(s.date)).reduce((a, s) => a + s.actualSec / 60, 0)),
      habits: habitRate === null ? null : Math.round(habitRate * 100),
    }
  }, [life])

  return (
    <Panel className="@3xl/main:col-span-2">
      <PanelHeader title="This week" subtitle="Progress toward your weekly targets" icon={Trophy} tone="violet" />
      <div className="grid grid-cols-3 gap-3 sm:gap-5">
        {briefing.weekly.map((w) => {
          const pct = w.target > 0 ? Math.min(1, w.value / w.target) : 0
          let change = "–"
          if (w.key === "habits") {
            if (lastWeek.habits !== null) {
              const d = w.value - lastWeek.habits
              change = `${d > 0 ? "+" : ""}${d} pts`
            }
          } else {
            const prev = w.key === "tasks" ? lastWeek.tasks : lastWeek.focus
            if (prev > 0) {
              const d = Math.round(((w.value - prev) / prev) * 100)
              change = `${d > 0 ? "+" : ""}${d}%`
            }
          }
          return (
            <div key={w.key} className="flex flex-col">
              <div className="truncate border-b border-line pb-1.5 text-[11px] text-muted-foreground tabular" title="Compared with the same point last week">
                {change}
                {change !== "–" && " vs last week"}
              </div>
              <div className="mt-2 text-sm font-medium">{w.label}</div>
              <div className={cn("hatch relative mt-3 h-36 overflow-hidden rounded-2xl", w.key === "tasks" ? "bg-violet/10" : w.key === "focus" ? "bg-cyan/10" : "bg-mint/10")} role="meter" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={w.label}>
                <div
                  className={cn("absolute inset-x-0 bottom-0 rounded-2xl transition-[height] duration-700", w.key === "tasks" ? "bg-violet" : w.key === "focus" ? "bg-cyan" : "bg-mint")}
                  style={{ height: `${Math.max(pct * 100, pct > 0 ? 6 : 0)}%` }}
                />
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-2">
                <span className="text-lg font-semibold">{Math.round(pct * 100)}%</span>
                <span className="text-xs text-muted-foreground tabular">
                  {w.key === "focus" ? formatDuration(w.value) : w.value}
                  {w.unit === "%" ? "%" : ""} / {w.key === "focus" ? formatDuration(w.target) : w.target}
                  {w.unit === "%" ? "%" : ""}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Targets live in <Link href="/settings#targets" className="underline underline-offset-2">Settings</Link>.
      </p>
    </Panel>
  )
}

/* ── level & XP ─────────────────────────────────────── */

export function XPWidget({ xp, level, stats }: { xp: XPBreakdown; level: LevelInfo; stats: Stats }) {
  const next = ACHIEVEMENTS.filter((a) => !a.check(stats))
    .map((a) => ({ a, p: a.progress(stats) }))
    .sort((x, y) => y.p[0] / y.p[1] - x.p[0] / x.p[1])[0]
  return (
    <Panel>
      <PanelHeader title={`Level ${level.level}`} subtitle={level.title} icon={Trophy} tone="amber" />
      <div className="flex items-center gap-4">
        <RingGauge value={level.progress * 100} size={84} stroke={8} tone="amber" label={`${level.intoLevel} of ${level.needed} XP to the next level`}>
          <span className="text-sm font-semibold">{Math.round(level.progress * 100)}%</span>
        </RingGauge>
        <dl className="grid flex-1 grid-cols-1 gap-x-4 gap-y-1 text-xs @xs:grid-cols-2">
          {(
            [
              ["Tasks", xp.tasks],
              ["Habits", xp.habits],
              ["Focus", xp.focus],
              ["Reflect", xp.reflections],
              ["Goals", xp.goals],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="font-medium tabular">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {xp.total} XP total · {level.needed - level.intoLevel} to level {level.level + 1}
      </p>
      {next && (
        <div className="mt-3 rounded-2xl border border-line p-3">
          <div className="flex items-center gap-2 text-sm">
            <Icon name={next.a.icon} className="size-4 text-amber" />
            <span className="font-medium">{next.a.title}</span>
            <span className="ml-auto text-xs text-muted-foreground tabular">
              {next.p[0]}/{next.p[1]}
            </span>
          </div>
          <HatchBar value={next.p[0] / next.p[1]} tone="amber" height={6} className="mt-2" />
          <p className="mt-1 text-[11px] text-muted-foreground">{next.a.description}</p>
        </div>
      )}
    </Panel>
  )
}

/* ── insight ────────────────────────────────────────── */

export function InsightWidget({ insights }: { insights: Insight[] }) {
  const [i, setI] = useState(0)
  const insight = insights[i % Math.max(1, insights.length)]
  return (
    <Panel>
      <PanelHeader
        title="Insight"
        subtitle={insights.length > 1 ? `${(i % insights.length) + 1} of ${insights.length}` : "From your own data"}
        icon={Lightbulb}
        tone="amber"
        action={
          insights.length > 1 ? (
            <Button size="xs" variant="ghost" onClick={() => setI((x) => x + 1)}>
              Next
            </Button>
          ) : undefined
        }
      />
      {!insight ? (
        <p className="text-sm text-muted-foreground">Insights appear once LIFE OS has a few days of your tasks, habits and focus sessions to learn from. Nothing here is made up.</p>
      ) : (
        <div className="flex flex-1 flex-col">
          <p className="text-lg leading-snug font-semibold text-balance">{insight.title}</p>
          <p className="mt-2 text-sm text-muted-foreground">{insight.body}</p>
          <p className="mt-3 rounded-xl bg-surface-2/70 px-3 py-2 text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">Why: </span>
            {insight.basis}
          </p>
          {insight.href && (
            <Link href={insight.href} className="mt-3 inline-flex items-center gap-1 self-start text-xs font-medium text-muted-foreground hover:text-foreground">
              Open <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </div>
      )}
    </Panel>
  )
}
