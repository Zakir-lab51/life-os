import { addDays, addMonths, daysBetween, fromISODate, startOfWeek, toISODate } from "./dates"
import type { Goal, GoalHorizon, GoalLog, HabitLog, ISODate, Task } from "./types"
import { GOAL_HORIZONS } from "./types"

/*
  Goal maths. Progress, its history and the forecast are all derived from the
  records themselves (milestones, linked tasks, habit check-ins, logged values),
  so they can't drift from what actually happened.
*/

export const HORIZON_META: Record<GoalHorizon, { label: string; adjective: string; short: string }> = {
  week: { label: "Week", adjective: "Weekly", short: "W" },
  month: { label: "Month", adjective: "Monthly", short: "M" },
  quarter: { label: "Quarter", adjective: "Quarterly", short: "Q" },
  year: { label: "Year", adjective: "Yearly", short: "Y" },
  "five-year": { label: "Five years", adjective: "Five-year", short: "5Y" },
}

export const horizonRank = (h: GoalHorizon) => GOAL_HORIZONS.indexOf(h)

/**
 * A sensible deadline for a horizon starting on `start`: the end of that week, month,
 * quarter or year, or five years on. When less than a quarter of the period is left
 * (a yearly goal set in mid-October, a weekly one on Sunday) it rolls to the end of the next one.
 */
export function defaultDueDate(horizon: GoalHorizon, start: ISODate, weekStartsOn: 0 | 1 = 1): ISODate {
  const d = fromISODate(start)
  const periodEnd = (offset: number): ISODate => {
    switch (horizon) {
      case "week":
        return addDays(startOfWeek(start, weekStartsOn), 6 + offset * 7)
      case "month":
        return toISODate(new Date(d.getFullYear(), d.getMonth() + 1 + offset, 0))
      case "quarter":
        return toISODate(new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3 + 3 + offset * 3, 0))
      default:
        return toISODate(new Date(d.getFullYear() + offset, 11, 31))
    }
  }
  if (horizon === "five-year") return addDays(addMonths(start, 60), -1)
  const length = { week: 7, month: 30, quarter: 91, year: 365 }[horizon]
  const end = periodEnd(0)
  return daysBetween(start, end) + 1 < length / 4 ? periodEnd(1) : end
}

export interface GoalContext {
  tasks: Task[]
  habitLogs: HabitLog[]
  goalLogs: GoalLog[]
}

export interface GoalProgress {
  /** 0..1 */
  ratio: number
  current: number
  total: number
  /** "3 of 5 milestones", "12 / 24 books", … */
  label: string
  /** Nothing to measure yet (no milestones, no linked tasks). */
  empty: boolean
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 }))

export const linkedTasks = (goal: Goal, tasks: Task[]) => tasks.filter((t) => t.goalId === goal.id)
const habitCheckIns = (goal: Goal, habitId: string, logs: HabitLog[]) => logs.filter((l) => l.habitId === habitId && l.date >= goal.startDate)
const logsFor = (goal: Goal, logs: GoalLog[]) => logs.filter((l) => l.goalId === goal.id).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

export function goalProgress(goal: Goal, ctx: GoalContext): GoalProgress {
  const m = goal.measure
  switch (m.kind) {
    case "milestones": {
      const total = goal.milestones.length
      const done = goal.milestones.filter((x) => x.doneAt).length
      return { ratio: total ? done / total : 0, current: done, total, label: total ? `${done} of ${plural(total, "milestone")}` : "No milestones yet", empty: !total }
    }
    case "tasks": {
      const tasks = linkedTasks(goal, ctx.tasks)
      const done = tasks.filter((t) => t.status === "done").length
      return { ratio: tasks.length ? done / tasks.length : 0, current: done, total: tasks.length, label: tasks.length ? `${done} of ${plural(tasks.length, "task")}` : "No linked tasks yet", empty: !tasks.length }
    }
    case "target": {
      const logs = logsFor(goal, ctx.goalLogs)
      const current = logs.length ? logs[logs.length - 1].value : m.start
      const ratio = clamp01((current - m.start) / (m.target - m.start))
      const unit = m.unit ? ` ${m.unit}` : ""
      return { ratio, current, total: m.target, label: `${fmt(current)} / ${fmt(m.target)}${unit}`, empty: false }
    }
    case "habit": {
      const n = habitCheckIns(goal, m.habitId, ctx.habitLogs).length
      return { ratio: clamp01(n / m.target), current: n, total: m.target, label: `${n} of ${plural(m.target, "check-in")}`, empty: false }
    }
  }
}

export interface HistoryPoint {
  date: ISODate
  ratio: number
}

/** Progress over time as a step series from the start date to `today` (or the completion date). */
export function goalHistory(goal: Goal, ctx: GoalContext, today: ISODate): HistoryPoint[] {
  const end = goal.completedAt ? toISODate(new Date(goal.completedAt)) : today
  const events: { date: ISODate; ratio: number }[] = []
  const m = goal.measure
  const day = (iso: string) => toISODate(new Date(iso))

  if (m.kind === "milestones") {
    const total = goal.milestones.length
    const dates = goal.milestones.filter((x) => x.doneAt).map((x) => day(x.doneAt!)).sort()
    dates.forEach((d, i) => events.push({ date: d, ratio: total ? (i + 1) / total : 0 }))
  } else if (m.kind === "tasks") {
    const tasks = linkedTasks(goal, ctx.tasks)
    const dates = tasks.filter((t) => t.status === "done" && t.completedAt).map((t) => day(t.completedAt!)).sort()
    dates.forEach((d, i) => events.push({ date: d, ratio: tasks.length ? (i + 1) / tasks.length : 0 }))
  } else if (m.kind === "target") {
    for (const l of logsFor(goal, ctx.goalLogs)) events.push({ date: l.date, ratio: clamp01((l.value - m.start) / (m.target - m.start)) })
  } else {
    const dates = habitCheckIns(goal, m.habitId, ctx.habitLogs).map((l) => l.date).sort()
    dates.forEach((d, i) => events.push({ date: d, ratio: clamp01((i + 1) / m.target) }))
  }

  // one point per day: the last value reached that day, clamped to the goal's own span
  const byDay = new Map<ISODate, number>()
  for (const e of events) {
    const d = e.date < goal.startDate ? goal.startDate : e.date
    if (d <= end) byDay.set(d, e.ratio)
  }
  const points: HistoryPoint[] = [{ date: goal.startDate, ratio: byDay.get(goal.startDate) ?? 0 }]
  for (const [date, ratio] of [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (date === goal.startDate) continue
    points.push({ date, ratio })
  }
  if (points[points.length - 1].date < end) points.push({ date: end, ratio: points[points.length - 1].ratio })
  return points
}

/** Progress reached by a given day, read from a history series. */
export function ratioOn(history: HistoryPoint[], date: ISODate): number {
  let r = 0
  for (const p of history) {
    if (p.date > date) break
    r = p.ratio
  }
  return r
}

export type Outlook = "complete" | "ready" | "ahead" | "on-track" | "behind" | "overdue" | "no-deadline" | "not-started"

export interface Forecast {
  outlook: Outlook
  /** Where progress "should" be today if it moved evenly from start to deadline (null without a deadline). */
  expected: number | null
  /** Recent pace, in progress per day (0..1 scale). */
  pacePerDay: number
  /** When it will be done at the recent pace (null if there's no recent progress, it's too early to tell, or it's done). */
  predicted: ISODate | null
  /** Fewer than three days since the start: too soon to forecast a finish date. */
  early: boolean
  /** Days until the deadline (negative once it's passed). */
  daysLeft: number | null
}

export const OUTLOOK_META: Record<Outlook, { label: string; tone: "mint" | "violet" | "amber" | "rose" | "muted" }> = {
  complete: { label: "Achieved", tone: "mint" },
  ready: { label: "Ready to complete", tone: "mint" },
  ahead: { label: "Ahead", tone: "mint" },
  "on-track": { label: "On track", tone: "violet" },
  behind: { label: "Behind", tone: "amber" },
  overdue: { label: "Overdue", tone: "rose" },
  "no-deadline": { label: "No deadline", tone: "muted" },
  "not-started": { label: "Not started", tone: "muted" },
}

/**
 * Compares progress with an even pace from start to deadline, and predicts the
 * finish from the recent pace (the last 28 days, or since the start if shorter, counting
 * progress made on the start day itself). Within ±10% of the even pace counts as on
 * track; early days are never "behind", and the first three days get no finish date.
 */
export function forecastGoal(goal: Goal, progress: GoalProgress, history: HistoryPoint[], today: ISODate): Forecast {
  const daysLeft = goal.dueDate ? daysBetween(today, goal.dueDate) : null
  const elapsed = Math.max(0, daysBetween(goal.startDate, today))
  const span = goal.dueDate ? Math.max(1, daysBetween(goal.startDate, goal.dueDate)) : null
  const expected = span ? clamp01(elapsed / span) : null

  const window = Math.min(28, Math.max(1, elapsed))
  const from = addDays(today, -window)
  const base = from <= goal.startDate ? 0 : ratioOn(history, from)
  const pacePerDay = Math.max(0, (progress.ratio - base) / window)
  const early = elapsed < 3
  const predicted = progress.ratio >= 1 || pacePerDay <= 0 || early ? null : addDays(today, Math.ceil((1 - progress.ratio) / pacePerDay))

  let outlook: Outlook
  if (goal.status === "done") outlook = "complete"
  else if (progress.ratio >= 1) outlook = "ready"
  else if (daysLeft !== null && daysLeft < 0) outlook = "overdue"
  else if (progress.ratio === 0 && (progress.empty || elapsed < 3)) outlook = "not-started"
  else if (expected === null) outlook = "no-deadline"
  else if (expected < 0.1) outlook = "on-track"
  else if (progress.ratio >= expected + 0.1) outlook = "ahead"
  else if (progress.ratio >= expected - 0.1) outlook = "on-track"
  else outlook = "behind"

  return { outlook, expected, pacePerDay, predicted, early, daysLeft }
}

/** Every goal's progress and forecast in one pass. */
export function evaluateGoals(goals: Goal[], ctx: GoalContext, today: ISODate) {
  return new Map(
    goals.map((g) => {
      const progress = goalProgress(g, ctx)
      const history = goalHistory(g, ctx, today)
      return [g.id, { progress, history, forecast: forecastGoal(g, progress, history, today) }] as const
    }),
  )
}
export type GoalEvaluation = ReturnType<typeof evaluateGoals> extends Map<string, infer V> ? V : never

/** Goals that may serve as `goal`'s parent: longer horizon, not itself or one of its descendants. */
export function parentCandidates(goal: Pick<Goal, "id" | "horizon">, goals: Goal[]): Goal[] {
  const descendants = new Set<string>()
  const walk = (id: string) => {
    for (const g of goals) if (g.parentId === id && !descendants.has(g.id)) {
      descendants.add(g.id)
      walk(g.id)
    }
  }
  walk(goal.id)
  return goals.filter((g) => g.id !== goal.id && !descendants.has(g.id) && g.status !== "archived" && horizonRank(g.horizon) > horizonRank(goal.horizon))
}
