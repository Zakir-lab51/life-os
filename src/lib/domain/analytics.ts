import { addDays, dayRange, daysBetween, formatDay, toISODate } from "./dates"
import { AREA_META } from "./areas"
import { isDueOn, logsByHabit } from "./habits"
import { dailyScore, type LifeData } from "./scores"
import { AREAS, type Area, type ISODate, type Prefs } from "./types"

export interface DayPoint {
  date: ISODate
  label: string
  tasksDone: number
  focusMin: number
  /** 0–100, or null when no habits were due. */
  habitRate: number | null
  score: number | null
  activity: number
}

/** One row per day with everything the analytics charts need, all from stored records. */
export function dailySeries(data: LifeData, from: ISODate, to: ISODate, prefs: Pick<Prefs, "focus">): DayPoint[] {
  const byHabit = logsByHabit(data.habitLogs)
  const doneByDay = new Map<ISODate, number>()
  for (const t of data.tasks) {
    if (t.status !== "done" || !t.completedAt) continue
    const d = toISODate(new Date(t.completedAt))
    doneByDay.set(d, (doneByDay.get(d) ?? 0) + 1)
  }
  const focusByDay = new Map<ISODate, number>()
  for (const s of data.sessions) focusByDay.set(s.date, (focusByDay.get(s.date) ?? 0) + s.actualSec / 60)
  const logsByDay = new Map<ISODate, number>()
  for (const l of data.habitLogs) logsByDay.set(l.date, (logsByDay.get(l.date) ?? 0) + 1)
  const reflectionDays = new Set(data.reflections.map((r) => r.date))

  return dayRange(from, to).map((date) => {
    const due = data.habits.filter((h) => !h.archivedAt && h.schedule.kind !== "weekly" && isDueOn(h, date))
    const kept = due.filter((h) => byHabit.get(h.id)?.has(date)).length
    const tasksDone = doneByDay.get(date) ?? 0
    const focusMin = Math.round(focusByDay.get(date) ?? 0)
    const sessions = data.sessions.filter((s) => s.date === date).length
    return {
      date,
      label: formatDay(date, daysBetween(from, to) > 31 ? "d MMM" : "EEE d"),
      tasksDone,
      focusMin,
      habitRate: due.length ? Math.round((kept / due.length) * 100) : null,
      score: dailyScore(date, data, prefs).score,
      activity: tasksDone + sessions + (logsByDay.get(date) ?? 0) + (reflectionDays.has(date) ? 1 : 0),
    }
  })
}

export interface Summary {
  tasksDone: number
  focusMin: number
  habitRate: number | null
  avgScore: number | null
  activeDays: number
  completionRate: number | null
}

export function summarize(points: DayPoint[], data: LifeData, from: ISODate, to: ISODate): Summary {
  const scores = points.map((p) => p.score).filter((s): s is number => s !== null)
  const rates = points.map((p) => p.habitRate).filter((s): s is number => s !== null)
  const inRange = (d: ISODate) => daysBetween(from, d) >= 0 && daysBetween(d, to) >= 0
  const done = data.tasks.filter((t) => t.status === "done" && t.completedAt && inRange(toISODate(new Date(t.completedAt)))).length
  const openDue = data.tasks.filter((t) => t.status !== "done" && t.dueDate && daysBetween(t.dueDate, to) >= 0).length
  return {
    tasksDone: points.reduce((a, p) => a + p.tasksDone, 0),
    focusMin: points.reduce((a, p) => a + p.focusMin, 0),
    habitRate: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null,
    avgScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    activeDays: points.filter((p) => p.activity > 0).length,
    completionRate: done + openDue > 0 ? Math.round((done / (done + openDue)) * 100) : null,
  }
}

export interface AreaPoint {
  area: Area
  label: string
  tasks: number
  focusMin: number
  habits: number
}

export function areaBreakdown(data: LifeData, from: ISODate, to: ISODate): AreaPoint[] {
  const inRange = (d: ISODate) => daysBetween(from, d) >= 0 && daysBetween(d, to) >= 0
  const habitArea = new Map(data.habits.map((h) => [h.id, h.area]))
  return AREAS.map((area) => ({
    area,
    label: AREA_META[area].label,
    tasks: data.tasks.filter((t) => t.area === area && t.status === "done" && t.completedAt && inRange(toISODate(new Date(t.completedAt)))).length,
    focusMin: Math.round(data.sessions.filter((s) => s.area === area && inRange(s.date)).reduce((a, s) => a + s.actualSec / 60, 0)),
    habits: data.habitLogs.filter((l) => inRange(l.date) && habitArea.get(l.habitId) === area).length,
  }))
}

/** Same-length window right before [from, to], for period-over-period deltas. */
export function previousRange(from: ISODate, to: ISODate) {
  const len = daysBetween(from, to) + 1
  return { from: addDays(from, -len), to: addDays(from, -1) }
}
