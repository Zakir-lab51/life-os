import { addDays, daysBetween, toISODate } from "./dates"
import { RADAR_META } from "./areas"
import { isDueOn, logsByHabit, overallConsistency } from "./habits"
import type { FocusSession, Goal, GoalLog, Habit, HabitLog, ISODate, Prefs, Project, RadarDim, Reflection, Task } from "./types"

export interface LifeData {
  tasks: Task[]
  habits: Habit[]
  habitLogs: HabitLog[]
  sessions: FocusSession[]
  reflections: Reflection[]
  goals: Goal[]
  goalLogs: GoalLog[]
  projects: Project[]
}

export interface ScorePart {
  key: "tasks" | "focus" | "habits"
  label: string
  value: number
  weight: number
  detail: string
}

export interface DailyScore {
  score: number | null
  parts: ScorePart[]
}

const completedOn = (t: Task) => (t.completedAt ? toISODate(new Date(t.completedAt)) : null)

/**
 * Daily productivity score (0–100), from three parts:
 *  - tasks: finished that day / (finished that day + still open and due by then)
 *  - focus: minutes focused / daily focus target (only once you've used Focus at all)
 *  - habits: due daily/weekday habits checked in that day
 * Parts with nothing to measure are left out and the weights re-balance.
 */
export function dailyScore(date: ISODate, data: LifeData, prefs: Pick<Prefs, "focus">): DailyScore {
  const parts: ScorePart[] = []

  const doneThatDay = data.tasks.filter((t) => t.status === "done" && completedOn(t) === date)
  const openDue = data.tasks.filter((t) => {
    if (!t.dueDate || daysBetween(date, t.dueDate) > 0) return false
    if (daysBetween(toISODate(new Date(t.createdAt)), date) < 0) return false
    const doneOn = completedOn(t)
    return t.status !== "done" || (doneOn !== null && daysBetween(date, doneOn) > 0)
  })
  const taskDenominator = doneThatDay.length + openDue.length
  if (taskDenominator > 0) {
    parts.push({
      key: "tasks",
      label: "Tasks",
      value: doneThatDay.length / taskDenominator,
      weight: 0.45,
      detail: `${doneThatDay.length} of ${taskDenominator} due or finished`,
    })
  }

  if (data.sessions.length > 0 && prefs.focus.dailyTargetMin > 0) {
    const minutes = data.sessions.filter((s) => s.date === date).reduce((a, s) => a + s.actualSec / 60, 0)
    parts.push({
      key: "focus",
      label: "Focus",
      value: Math.min(1, minutes / prefs.focus.dailyTargetMin),
      weight: 0.3,
      detail: `${Math.round(minutes)} of ${prefs.focus.dailyTargetMin} min`,
    })
  }

  const byHabit = logsByHabit(data.habitLogs)
  const dueHabits = data.habits.filter((h) => !h.archivedAt && h.schedule.kind !== "weekly" && isDueOn(h, date))
  if (dueHabits.length > 0) {
    const kept = dueHabits.filter((h) => byHabit.get(h.id)?.has(date)).length
    parts.push({
      key: "habits",
      label: "Habits",
      value: kept / dueHabits.length,
      weight: 0.25,
      detail: `${kept} of ${dueHabits.length} habits`,
    })
  }

  if (!parts.length) return { score: null, parts }
  const totalWeight = parts.reduce((a, p) => a + p.weight, 0)
  const score = Math.round((parts.reduce((a, p) => a + p.value * p.weight, 0) / totalWeight) * 100)
  return { score, parts }
}

export interface RadarValue {
  dim: RadarDim
  label: string
  value: number | null
  detail: string
  how: string
}

const pct = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100)
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/** Life Balance radar, over the last 7 days. `null` means nothing tracked yet for that area. */
export function lifeBalance(data: LifeData, today: ISODate, prefs: Pick<Prefs, "focus">): RadarValue[] {
  const from = addDays(today, -6)
  const inWindow = (d: ISODate | null) => !!d && daysBetween(from, d) >= 0 && daysBetween(d, today) >= 0
  const byHabit = logsByHabit(data.habitLogs)

  const taskRate = (filter: (t: Task) => boolean) => {
    const pool = data.tasks.filter(filter)
    const done = pool.filter((t) => t.status === "done" && inWindow(completedOn(t))).length
    const open = pool.filter((t) => t.status !== "done" && t.dueDate && daysBetween(t.dueDate, today) >= 0).length
    return done + open > 0 ? done / (done + open) : null
  }
  const habitRate = (filter: (h: Habit) => boolean) => overallConsistency(data.habits.filter(filter), byHabit, from, today)
  const focusMin = (filter: (s: FocusSession) => boolean) =>
    data.sessions.filter((s) => inWindow(s.date) && filter(s)).reduce((a, s) => a + s.actualSec / 60, 0)

  const out: Record<RadarDim, { value: number | null; detail: string }> = {
    productivity: { value: null, detail: "" },
    learning: { value: null, detail: "" },
    health: { value: null, detail: "" },
    finance: { value: null, detail: "" },
    growth: { value: null, detail: "" },
    consistency: { value: null, detail: "" },
  }

  // Productivity
  {
    const tr = taskRate(() => true)
    const fm = focusMin(() => true)
    const fr = data.sessions.length ? Math.min(1, fm / Math.max(1, prefs.focus.dailyTargetMin * 5)) : null
    const v = avg([tr, fr].filter((x): x is number => x !== null))
    out.productivity = {
      value: v === null ? null : pct(v),
      detail: [tr !== null ? `${pct(tr)}% of due tasks done` : null, fr !== null ? `${Math.round(fm)} focus min` : null].filter(Boolean).join(" · "),
    }
  }

  // Learning
  {
    const tracked =
      data.tasks.some((t) => t.area === "study") || data.habits.some((h) => h.area === "study") || data.sessions.some((s) => s.area === "study")
    if (tracked) {
      const minutes =
        focusMin((s) => s.area === "study") +
        data.tasks.filter((t) => t.area === "study" && t.status === "done" && inWindow(completedOn(t))).length * 30 +
        data.habitLogs.filter((l) => inWindow(l.date) && data.habits.find((h) => h.id === l.habitId)?.area === "study").length * 20
      out.learning = { value: pct(minutes / 300), detail: `≈${Math.round(minutes)} learning min this week` }
    }
  }

  // Health
  {
    const r = habitRate((h) => h.area === "health")
    if (r !== null) out.health = { value: pct(r), detail: `${pct(r)}% of health check-ins kept` }
  }

  // Finance
  {
    const tr = taskRate((t) => t.area === "finance")
    const hr = habitRate((h) => h.area === "finance")
    const v = avg([tr, hr].filter((x): x is number => x !== null))
    if (v !== null) out.finance = { value: pct(v), detail: "From finance tasks and habits" }
  }

  // Personal growth
  {
    const reflections = data.reflections.filter((r) => inWindow(r.date)).length
    const rr = data.reflections.length ? Math.min(1, reflections / 5) : null
    const hr = habitRate((h) => h.area === "mind" || h.area === "personal")
    const v = avg([rr, hr].filter((x): x is number => x !== null))
    if (v !== null) out.growth = { value: pct(v), detail: `${reflections} reflection${reflections === 1 ? "" : "s"} this week` }
  }

  // Consistency
  {
    const hr = habitRate(() => true)
    const active = new Set<ISODate>()
    for (const l of data.habitLogs) if (inWindow(l.date)) active.add(l.date)
    for (const s of data.sessions) if (inWindow(s.date)) active.add(s.date)
    for (const t of data.tasks) {
      const d = completedOn(t)
      if (d && inWindow(d)) active.add(d)
    }
    const anything = data.habits.length || data.sessions.length || data.tasks.some((t) => t.status === "done")
    if (anything) {
      const ar = active.size / 7
      const v = avg([hr, ar].filter((x): x is number => x !== null))!
      out.consistency = { value: pct(v), detail: `Active ${active.size} of 7 days` }
    }
  }

  return (Object.keys(out) as RadarDim[]).map((dim) => ({
    dim,
    label: RADAR_META[dim].label,
    how: RADAR_META[dim].how,
    ...out[dim],
  }))
}
