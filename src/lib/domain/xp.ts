import { addDays, toISODate } from "./dates"
import { bestStreak, logsByHabit } from "./habits"
import type { FocusSession, Goal, GoalHorizon, Habit, HabitLog, ISODate, Reflection, Task } from "./types"

/*
  XP rewards meaningful activity, with guard rails:
  - focus XP is capped per day so marathon sessions earn nothing extra;
  - nothing is ever subtracted for missed days;
  - undoing an action removes exactly the XP it earned (XP is derived from
    the records themselves, never stored separately).
*/
export const XP_RULES = {
  task: 10,
  importantTaskBonus: 5,
  habit: 5,
  focusPer5Min: 1,
  focusDailyCapMin: 240,
  reflection: 10,
  milestone: 15,
} as const

/** XP for achieving a goal grows with its horizon. */
export const GOAL_XP: Record<GoalHorizon, number> = { week: 20, month: 40, quarter: 60, year: 100, "five-year": 150 }

export interface XPInput {
  tasks: Task[]
  habitLogs: HabitLog[]
  sessions: FocusSession[]
  reflections: Reflection[]
  goals?: Goal[]
}

export interface XPBreakdown {
  total: number
  tasks: number
  habits: number
  focus: number
  reflections: number
  goals: number
}

export function computeXP({ tasks, habitLogs, sessions, reflections, goals = [] }: XPInput): XPBreakdown {
  const taskXP = tasks
    .filter((t) => t.status === "done")
    .reduce((acc, t) => acc + XP_RULES.task + (t.priority <= 2 ? XP_RULES.importantTaskBonus : 0), 0)

  const habitXP = habitLogs.length * XP_RULES.habit

  const minutesByDay = new Map<ISODate, number>()
  for (const s of sessions) minutesByDay.set(s.date, (minutesByDay.get(s.date) ?? 0) + s.actualSec / 60)
  let focusXP = 0
  for (const minutes of minutesByDay.values()) {
    focusXP += Math.floor(Math.min(minutes, XP_RULES.focusDailyCapMin) / 5) * XP_RULES.focusPer5Min
  }

  const reflectionXP = reflections.length * XP_RULES.reflection
  const goalXP = goals.reduce((acc, g) => acc + g.milestones.filter((m) => m.doneAt).length * XP_RULES.milestone + (g.status === "done" ? GOAL_XP[g.horizon] : 0), 0)
  return {
    total: taskXP + habitXP + focusXP + reflectionXP + goalXP,
    tasks: taskXP,
    habits: habitXP,
    focus: focusXP,
    reflections: reflectionXP,
    goals: goalXP,
  }
}

/** XP needed to go from level L to L+1. */
export function xpForNextLevel(level: number) {
  return 100 + (level - 1) * 50
}

export interface LevelInfo {
  level: number
  title: string
  intoLevel: number
  needed: number
  progress: number
}

const TITLES = ["Initiate", "Apprentice", "Builder", "Navigator", "Architect", "Strategist", "Pathfinder", "Visionary", "Luminary", "Sage"]

export function levelFromXP(xp: number): LevelInfo {
  let level = 1
  let rest = Math.max(0, Math.floor(xp))
  while (rest >= xpForNextLevel(level)) {
    rest -= xpForNextLevel(level)
    level++
  }
  const needed = xpForNextLevel(level)
  return {
    level,
    title: TITLES[Math.min(TITLES.length - 1, Math.floor((level - 1) / 2))],
    intoLevel: rest,
    needed,
    progress: rest / needed,
  }
}

export interface Stats {
  tasksDone: number
  importantDone: number
  focusMinutes: number
  longestSessionMin: number
  habitCheckins: number
  bestHabitStreak: number
  reflections: number
  activeDays: number
  earlyTasks: number
  goalsDone: number
  milestonesDone: number
}

export function computeStats(input: XPInput & { habits: Habit[]; today: ISODate }): Stats {
  const done = input.tasks.filter((t) => t.status === "done")
  const byHabit = logsByHabit(input.habitLogs)
  const active = new Set<ISODate>()
  for (const t of done) if (t.completedAt) active.add(toISODate(new Date(t.completedAt)))
  for (const l of input.habitLogs) active.add(l.date)
  for (const s of input.sessions) active.add(s.date)
  for (const r of input.reflections) active.add(r.date)

  return {
    tasksDone: done.length,
    importantDone: done.filter((t) => t.priority <= 2).length,
    focusMinutes: Math.round(input.sessions.reduce((a, s) => a + s.actualSec, 0) / 60),
    longestSessionMin: Math.round(Math.max(0, ...input.sessions.map((s) => s.actualSec)) / 60),
    habitCheckins: input.habitLogs.length,
    bestHabitStreak: Math.max(0, ...input.habits.map((h) => bestStreak(h, byHabit.get(h.id) ?? new Set(), input.today))),
    reflections: input.reflections.length,
    activeDays: active.size,
    earlyTasks: done.filter((t) => t.completedAt && new Date(t.completedAt).getHours() < 9).length,
    goalsDone: (input.goals ?? []).filter((g) => g.status === "done").length,
    milestonesDone: (input.goals ?? []).reduce((acc, g) => acc + g.milestones.filter((m) => m.doneAt).length, 0),
  }
}

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  check: (s: Stats) => boolean
  progress: (s: Stats) => [number, number]
}

const a = (id: string, title: string, description: string, icon: string, value: (s: Stats) => number, goal: number): Achievement => ({
  id,
  title,
  description,
  icon,
  check: (s) => value(s) >= goal,
  progress: (s) => [Math.min(goal, value(s)), goal],
})

export const ACHIEVEMENTS: Achievement[] = [
  a("first-task", "First step", "Finish your first task", "CircleCheck", (s) => s.tasksDone, 1),
  a("tasks-25", "Momentum", "Finish 25 tasks", "Rocket", (s) => s.tasksDone, 25),
  a("tasks-100", "Centurion", "Finish 100 tasks", "Crown", (s) => s.tasksDone, 100),
  a("important-10", "What matters", "Finish 10 high-priority tasks", "Target", (s) => s.importantDone, 10),
  a("focus-60", "Deep diver", "Log 1 hour of focus", "Timer", (s) => s.focusMinutes, 60),
  a("focus-600", "Flow state", "Log 10 hours of focus", "Brain", (s) => s.focusMinutes, 600),
  a("long-session", "Locked in", "Complete a 50-minute focus session", "Hourglass", (s) => s.longestSessionMin, 50),
  a("habit-first", "Seed planted", "Check in a habit for the first time", "Leaf", (s) => s.habitCheckins, 1),
  a("streak-7", "One week strong", "Reach a 7-day habit streak", "Flame", (s) => s.bestHabitStreak, 7),
  a("streak-30", "Unbreakable", "Reach a 30-day habit streak", "Medal", (s) => s.bestHabitStreak, 30),
  a("reflect-7", "Know thyself", "Write 7 daily reflections", "PenLine", (s) => s.reflections, 7),
  a("early-bird", "Early bird", "Finish 5 tasks before 9 am", "Sunrise", (s) => s.earlyTasks, 5),
  a("active-14", "Showing up", "Be active on 14 different days", "CalendarDays", (s) => s.activeDays, 14),
  a("goal-first", "Goal getter", "Achieve your first goal", "Trophy", (s) => s.goalsDone, 1),
  a("milestones-10", "Stepping stones", "Reach 10 milestones", "Flag", (s) => s.milestonesDone, 10),
]

/** Focus streak: consecutive days, ending today or yesterday, with at least one focus session. */
export function focusStreak(sessions: FocusSession[], today: ISODate): number {
  const days = new Set(sessions.map((s) => s.date))
  let day = days.has(today) ? today : addDays(today, -1)
  let n = 0
  while (days.has(day)) {
    n++
    day = addDays(day, -1)
  }
  return n
}
