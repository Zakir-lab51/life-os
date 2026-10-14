import { addDays, daysBetween, startOfWeek, toISODate } from "./dates"
import { logsByHabit, overallConsistency } from "./habits"
import type { LifeData } from "./scores"
import type { ISODate, Task } from "./types"

/** The week to review: on the first two days of a week the one just ended, otherwise this one so far. */
export function reviewWeek(today: ISODate, weekStartsOn: 0 | 1 = 1): { start: ISODate; end: ISODate } {
  const thisWeek = startOfWeek(today, weekStartsOn)
  const start = daysBetween(thisWeek, today) < 2 ? addDays(thisWeek, -7) : thisWeek
  return { start, end: addDays(start, 6) }
}

export interface WeekSummary {
  /** Finished during the week, most recent first. */
  completed: Task[]
  /** Due during the week (up to today) and still open. */
  slipped: Task[]
  focusMin: number
  /** Share of due habit check-ins kept, or null with no habits due. */
  habitRate: number | null
  /** Goal values logged and milestones reached. */
  goalSteps: number
}

export function weekSummary(data: LifeData, start: ISODate, end: ISODate, today: ISODate): WeekSummary {
  const until = end < today ? end : today
  const inWeek = (d: ISODate) => d >= start && d <= end
  const day = (iso: string) => toISODate(new Date(iso))
  const completed = data.tasks
    .filter((t) => t.status === "done" && t.completedAt && inWeek(day(t.completedAt)))
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
  const slipped = data.tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate >= start && t.dueDate <= until).sort((a, b) => a.priority - b.priority)
  const focusMin = Math.round(data.sessions.filter((s) => inWeek(s.date)).reduce((sum, s) => sum + s.actualSec, 0) / 60)
  const habitRate = overallConsistency(data.habits, logsByHabit(data.habitLogs), start, until)
  const milestones = data.goals.flatMap((g) => g.milestones).filter((m) => m.doneAt && inWeek(day(m.doneAt))).length
  const goalSteps = data.goalLogs.filter((l) => inWeek(l.date)).length + milestones
  return { completed, slipped, focusMin, habitRate, goalSteps }
}
