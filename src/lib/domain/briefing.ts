import { addDays, daysBetween, formatDuration, startOfWeek, toISODate } from "./dates"
import { habitsForDay, logsByHabit, overallConsistency, type HabitDayStatus } from "./habits"
import { freeSlots, totalFree } from "./planner"
import { recommendTasks, type Recommendation } from "./scheduling"
import { isOverdue } from "./tasks"
import type { Block, ISODate, Prefs, Task } from "./types"
import type { LifeData } from "./scores"

export interface FocusSuggestion {
  taskId: string
  title: string
  minutes: number
  /** Start minute of the first free slot that fits, if any. */
  at: number | null
}

export interface WeeklyProgress {
  key: "tasks" | "focus" | "habits"
  label: string
  value: number
  target: number
  unit: string
}

export interface Briefing {
  headline: string
  priorities: Recommendation[]
  unfinished: Task[]
  upcoming: Block[]
  habitsLeft: HabitDayStatus[]
  focus: FocusSuggestion[]
  weekly: WeeklyProgress[]
  /** Plain-language description of the rules used, shown under "How this works". */
  rules: string[]
}

export interface BriefingInput {
  data: LifeData
  blocks: Block[]
  prefs: Pick<Prefs, "focus" | "dayStartMin" | "dayEndMin" | "weeklyTargets" | "weekStartsOn">
  today: ISODate
  nowMin: number
}

export function buildBriefing({ data, blocks, prefs, today, nowMin }: BriefingInput): Briefing {
  const todayBlocks = blocks.filter((b) => b.date === today)
  const from = Math.max(prefs.dayStartMin, nowMin)
  const freeMinutes = totalFree(todayBlocks, from, prefs.dayEndMin)

  const ranked = recommendTasks(data.tasks, { today, freeMinutes }, 8)
  const priorities = ranked.slice(0, 3)
  const top = new Set(priorities.map((r) => r.task.id))

  const unfinished = data.tasks
    .filter((t) => !top.has(t.id) && (isOverdue(t, today) || (t.status !== "done" && t.priority <= 2 && t.dueDate !== null && daysBetween(today, t.dueDate) <= 2)))
    .sort((a, b) => a.priority - b.priority || (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))
    .slice(0, 4)

  const upcoming = todayBlocks.filter((b) => b.end > nowMin).sort((a, b) => a.start - b.start).slice(0, 4)

  const byHabit = logsByHabit(data.habitLogs)
  const habitsLeft = habitsForDay(data.habits, byHabit, today, prefs.weekStartsOn).filter(
    (s) => !s.done && (!s.progress || s.progress.count < s.progress.target),
  )

  const slots = freeSlots(todayBlocks, from, prefs.dayEndMin)
  const focus: FocusSuggestion[] = priorities
    .filter((r) => r.task.estimateMin >= 25)
    .slice(0, 2)
    .map((r) => {
      const minutes = r.task.estimateMin <= prefs.focus.focusMin ? prefs.focus.focusMin : Math.min(90, r.task.estimateMin)
      const slot = slots.find((s) => s.end - s.start >= minutes)
      return { taskId: r.task.id, title: r.task.title, minutes, at: slot ? slot.start : null }
    })

  const weekStart = startOfWeek(today, prefs.weekStartsOn)
  const inWeek = (d: ISODate) => daysBetween(weekStart, d) >= 0 && daysBetween(d, today) >= 0
  const tasksThisWeek = data.tasks.filter((t) => t.status === "done" && t.completedAt && inWeek(toISODate(new Date(t.completedAt)))).length
  const focusThisWeek = Math.round(data.sessions.filter((s) => inWeek(s.date)).reduce((a, s) => a + s.actualSec / 60, 0))
  const habitRate = overallConsistency(data.habits, byHabit, weekStart, today)
  const weekly: WeeklyProgress[] = [
    { key: "tasks", label: "Tasks finished", value: tasksThisWeek, target: prefs.weeklyTargets.tasks, unit: "" },
    { key: "focus", label: "Focus time", value: focusThisWeek, target: prefs.weeklyTargets.focusMin, unit: "min" },
    {
      key: "habits",
      label: "Habit consistency",
      value: Math.round((habitRate ?? 0) * 100),
      target: Math.round(prefs.weeklyTargets.habitRate * 100),
      unit: "%",
    },
  ]

  const overdueCount = data.tasks.filter((t) => isOverdue(t, today)).length
  let headline: string
  if (!data.tasks.some((t) => t.status !== "done") && !data.habits.length) {
    headline = "A clear slate. Capture what matters and LIFE OS will shape a plan around it."
  } else if (overdueCount > 0) {
    headline = `Start by clearing ${overdueCount === 1 ? "the overdue task" : `${overdueCount} overdue tasks`}, then move to today's priorities.`
  } else if (priorities.length) {
    const pieces = [`${priorities.length} ${priorities.length === 1 ? "priority" : "priorities"}`]
    if (habitsLeft.length) pieces.push(`${habitsLeft.length} habit${habitsLeft.length === 1 ? "" : "s"}`)
    if (focus.length) pieces.push(`${formatDuration(focus.reduce((a, f) => a + f.minutes, 0))} of focus`)
    headline = `${pieces.join(", ")} would make today a strong day.`
  } else if (habitsLeft.length) {
    headline = `No urgent tasks. ${habitsLeft.length} habit${habitsLeft.length === 1 ? "" : "s"} left to keep your streaks going.`
  } else {
    headline = "Everything due is done. Use the space for deep work or rest."
  }

  return {
    headline,
    priorities,
    unfinished,
    upcoming,
    habitsLeft,
    focus,
    weekly,
    rules: [
      "Priorities: open, unblocked tasks scored by priority plus deadline urgency, with small boosts for work already in progress, tasks that unblock others and quick wins.",
      "Needs attention: overdue tasks and high-priority tasks due within two days.",
      "Focus suggestions: priorities estimated at 25+ minutes, placed in the first free gap of your day.",
      `Free time is counted between ${minutesLabel(prefs.dayStartMin)} and ${minutesLabel(prefs.dayEndMin)}, minus anything already on your timeline.`,
    ],
  }
}

function minutesLabel(min: number) {
  const h = Math.floor(min / 60)
  const m = min % 60
  const suffix = h < 12 ? "am" : "pm"
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`
}

export function previousWeekRange(today: ISODate, weekStartsOn: 0 | 1) {
  const thisStart = startOfWeek(today, weekStartsOn)
  return { from: addDays(thisStart, -7), to: addDays(thisStart, -1) }
}
