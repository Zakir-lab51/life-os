import { addDays, daysBetween, startOfWeek, weekday } from "./dates"
import type { Habit, HabitLog, ISODate } from "./types"

export function logsByHabit(logs: HabitLog[]): Map<string, Set<ISODate>> {
  const map = new Map<string, Set<ISODate>>()
  for (const l of logs) {
    let set = map.get(l.habitId)
    if (!set) map.set(l.habitId, (set = new Set()))
    set.add(l.date)
  }
  return map
}

/** Is a check-in expected on this day? Weekly-count habits accept any day. */
export function isDueOn(habit: Habit, date: ISODate): boolean {
  if (daysBetween(habit.startDate, date) < 0) return false
  switch (habit.schedule.kind) {
    case "daily":
      return true
    case "weekdays":
      return habit.schedule.days.includes(weekday(date))
    case "weekly":
      return true
  }
}

export function weekCount(done: Set<ISODate>, date: ISODate, weekStartsOn: 0 | 1): number {
  const start = startOfWeek(date, weekStartsOn)
  let n = 0
  for (let i = 0; i < 7; i++) if (done.has(addDays(start, i))) n++
  return n
}

export interface StreakInfo {
  /** Days for daily/weekday habits, weeks for weekly-count habits. */
  current: number
  unit: "day" | "week"
  /** Missed due days forgiven by the rest-day rule within the current streak. */
  restDaysUsed: number
}

/**
 * Kind streaks:
 *  - today being unfinished never breaks a streak (it still has time);
 *  - one missed due day per rolling 7 days is treated as a rest day, so a
 *    single slip doesn't wipe out weeks of effort. Two misses close together
 *    do end the streak.
 */
export function currentStreak(habit: Habit, done: Set<ISODate>, today: ISODate, weekStartsOn: 0 | 1 = 1): StreakInfo {
  if (habit.schedule.kind === "weekly") {
    const target = habit.schedule.times
    let weeks = 0
    let cursor = startOfWeek(today, weekStartsOn)
    if (weekCount(done, cursor, weekStartsOn) >= target) weeks++
    cursor = addDays(cursor, -7)
    while (daysBetween(habit.startDate, addDays(cursor, 6)) >= 0) {
      if (weekCount(done, cursor, weekStartsOn) >= target) weeks++
      else break
      cursor = addDays(cursor, -7)
    }
    return { current: weeks, unit: "week", restDaysUsed: 0 }
  }

  let streak = 0
  let restDaysUsed = 0
  let lastRest: ISODate | null = null
  // a miss only becomes a rest day once an earlier check-in proves the streak continues
  let pendingRest = false
  let day = today
  if (isDueOn(habit, today) && !done.has(today)) day = addDays(today, -1)

  for (let guard = 0; guard < 3660; guard++) {
    if (daysBetween(habit.startDate, day) < 0) break
    if (isDueOn(habit, day)) {
      if (done.has(day)) {
        if (pendingRest) {
          restDaysUsed++
          pendingRest = false
        }
        streak++
      } else {
        const restAllowed = !pendingRest && (lastRest === null || daysBetween(day, lastRest) >= 7)
        if (!restAllowed) break
        pendingRest = true
        lastRest = day
      }
    }
    day = addDays(day, -1)
  }
  return { current: streak, unit: "day", restDaysUsed }
}

/** Longest streak ever, using the same rest-day rule. */
export function bestStreak(habit: Habit, done: Set<ISODate>, today: ISODate, weekStartsOn: 0 | 1 = 1): number {
  if (habit.schedule.kind === "weekly") {
    const target = habit.schedule.times
    let best = 0
    let run = 0
    let cursor = startOfWeek(habit.startDate, weekStartsOn)
    while (daysBetween(cursor, today) >= 0) {
      if (weekCount(done, cursor, weekStartsOn) >= target) best = Math.max(best, ++run)
      else if (daysBetween(cursor, startOfWeek(today, weekStartsOn)) !== 0) run = 0
      cursor = addDays(cursor, 7)
    }
    return best
  }

  let best = 0
  let run = 0
  let lastRest: ISODate | null = null
  for (let day = habit.startDate; daysBetween(day, today) >= 0; day = addDays(day, 1)) {
    if (!isDueOn(habit, day)) continue
    if (done.has(day)) {
      run++
      best = Math.max(best, run)
    } else if (day === today) {
      continue
    } else if (run > 0 && (lastRest === null || daysBetween(lastRest, day) >= 7)) {
      lastRest = day
    } else {
      run = 0
      lastRest = null
    }
  }
  return best
}

/** Share of due check-ins completed in [from, to]. Weekly habits count weeks that hit their target. */
export function completionRate(habit: Habit, done: Set<ISODate>, from: ISODate, to: ISODate, weekStartsOn: 0 | 1 = 1): number | null {
  const start = daysBetween(habit.startDate, from) < 0 ? habit.startDate : from
  if (daysBetween(start, to) < 0) return null

  if (habit.schedule.kind === "weekly") {
    let weeks = 0
    let hit = 0
    for (let w = startOfWeek(start, weekStartsOn); daysBetween(w, to) >= 0; w = addDays(w, 7)) {
      weeks++
      if (weekCount(done, w, weekStartsOn) >= habit.schedule.times) hit++
    }
    return weeks ? hit / weeks : null
  }

  let due = 0
  let hit = 0
  for (let d = start; daysBetween(d, to) >= 0; d = addDays(d, 1)) {
    if (!isDueOn(habit, d)) continue
    due++
    if (done.has(d)) hit++
  }
  return due ? hit / due : null
}

export interface HabitDayStatus {
  habit: Habit
  done: boolean
  /** Weekly-count habits: check-ins so far this week and the target. */
  progress?: { count: number; target: number }
}

/** Habits that still matter today, with their status. */
export function habitsForDay(habits: Habit[], byHabit: Map<string, Set<ISODate>>, date: ISODate, weekStartsOn: 0 | 1 = 1): HabitDayStatus[] {
  return habits
    .filter((h) => !h.archivedAt && isDueOn(h, date))
    .map((h) => {
      const done = byHabit.get(h.id) ?? new Set<ISODate>()
      if (h.schedule.kind === "weekly") {
        const count = weekCount(done, date, weekStartsOn)
        return { habit: h, done: done.has(date), progress: { count, target: h.schedule.times } }
      }
      return { habit: h, done: done.has(date) }
    })
}

/**
 * Due check-ins completed / due check-ins, across all habits, for each day in
 * the range. Weekly-count habits are counted once their week's target is met.
 */
export function overallConsistency(habits: Habit[], byHabit: Map<string, Set<ISODate>>, from: ISODate, to: ISODate): number | null {
  let due = 0
  let hit = 0
  for (const h of habits) {
    if (h.archivedAt) continue
    const done = byHabit.get(h.id) ?? new Set<ISODate>()
    if (h.schedule.kind === "weekly") {
      const rate = completionRate(h, done, from, to)
      if (rate !== null) {
        due += 1
        hit += rate
      }
      continue
    }
    for (let d = from; daysBetween(d, to) >= 0; d = addDays(d, 1)) {
      if (!isDueOn(h, d)) continue
      due++
      if (done.has(d)) hit++
    }
  }
  return due ? hit / due : null
}

export function describeSchedule(habit: Habit): string {
  const s = habit.schedule
  if (s.kind === "daily") return "Every day"
  if (s.kind === "weekly") return `${s.times}× a week`
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  if (s.days.length === 5 && [1, 2, 3, 4, 5].every((d) => s.days.includes(d))) return "Weekdays"
  if (s.days.length === 2 && s.days.includes(0) && s.days.includes(6)) return "Weekends"
  return s.days.slice().sort((a, b) => a - b).map((d) => names[d]).join(" · ")
}
