import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db/db"
import { exportBackup, parseBackup, restoreBackup } from "@/lib/db/backup"
import { ValidationError, createGoal, createHabit, createTask, deleteGoal, logGoalValue, restoreGoal, setGoalStatus, toggleMilestone, updateGoal, wipeAllData } from "@/lib/db/repo"
import { todayISO, addDays } from "@/lib/domain/dates"
import { defaultDueDate, forecastGoal, goalHistory, goalProgress, parentCandidates, type GoalContext } from "@/lib/domain/goals"
import type { Goal } from "@/lib/domain/types"
import { computeXP } from "@/lib/domain/xp"
import { migratePrefs } from "@/lib/db/defaults"
import { QUICK_ACTIONS } from "@/lib/domain/types"
import { makeTask } from "./helpers"

const goal = (g: Partial<Goal> = {}): Goal => ({
  id: "g1",
  title: "Goal",
  why: "",
  horizon: "month",
  area: "personal",
  startDate: "2026-03-01",
  dueDate: "2026-03-31",
  measure: { kind: "milestones" },
  milestones: [],
  habitIds: [],
  parentId: null,
  status: "active",
  completedAt: null,
  order: 1,
  createdAt: "2026-03-01T09:00:00.000Z",
  updatedAt: "2026-03-01T09:00:00.000Z",
  ...g,
})
const none: GoalContext = { tasks: [], habitLogs: [], goalLogs: [] }

describe("goal progress", () => {
  it("measures milestones, linked tasks, a number target and habit check-ins", () => {
    const ms = goal({ milestones: [{ id: "a", title: "A", due: null, doneAt: "2026-03-05T10:00:00.000Z" }, { id: "b", title: "B", due: null, doneAt: null }] })
    expect(goalProgress(ms, none)).toMatchObject({ ratio: 0.5, label: "1 of 2 milestones" })

    const tasks = [makeTask({ goalId: "g1", status: "done" }), makeTask({ goalId: "g1" }), makeTask({ goalId: "g1" }), makeTask()]
    expect(goalProgress(goal({ measure: { kind: "tasks" } }), { ...none, tasks }).label).toBe("1 of 3 tasks")

    const target = goal({ measure: { kind: "target", unit: "km", start: 10, target: 30 } })
    const logs = [
      { id: "g1:2026-03-02", goalId: "g1", date: "2026-03-02", value: 14, note: "", createdAt: "" },
      { id: "g1:2026-03-09", goalId: "g1", date: "2026-03-09", value: 20, note: "", createdAt: "" },
    ]
    expect(goalProgress(target, { ...none, goalLogs: logs })).toMatchObject({ ratio: 0.5, current: 20, label: "20 / 30 km" })

    const habit = goal({ measure: { kind: "habit", habitId: "h1", target: 4 } })
    const habitLogs = ["2026-02-27", "2026-03-02", "2026-03-04", "2026-03-05", "2026-03-07", "2026-03-08"].map((date) => ({ id: `h1:${date}`, habitId: "h1", date, createdAt: "" }))
    // check-ins before the start don't count, and progress never passes 100%
    expect(goalProgress(habit, { ...none, habitLogs })).toMatchObject({ ratio: 1, current: 5 })
  })

  it("says plainly when there's nothing to measure yet", () => {
    expect(goalProgress(goal(), none)).toMatchObject({ ratio: 0, empty: true, label: "No milestones yet" })
    expect(goalProgress(goal({ measure: { kind: "tasks" } }), none).label).toBe("No linked tasks yet")
  })

  it("builds a step history from the start date", () => {
    const g = goal({ milestones: [1, 2, 3, 4].map((i) => ({ id: `m${i}`, title: `M${i}`, due: null, doneAt: i <= 2 ? `2026-03-0${i * 3}T12:00:00.000Z` : null })) })
    const h = goalHistory(g, none, "2026-03-10")
    expect(h[0]).toEqual({ date: "2026-03-01", ratio: 0 })
    expect(h.map((p) => p.ratio)).toEqual([0, 0.25, 0.5, 0.5])
    expect(h[h.length - 1].date).toBe("2026-03-10")
  })
})

describe("goal forecast", () => {
  const target = (values: [string, number][]) => {
    const g = goal({ measure: { kind: "target", unit: "", start: 0, target: 100 } })
    const ctx = { ...none, goalLogs: values.map(([date, value]) => ({ id: `g1:${date}`, goalId: "g1", date, value, note: "", createdAt: "" })) }
    return { g, ctx }
  }

  it("compares progress with an even pace to the deadline", () => {
    // halfway through March (day 15 of 30)
    const today = "2026-03-16"
    for (const [value, outlook] of [
      [70, "ahead"],
      [50, "on-track"],
      [20, "behind"],
    ] as const) {
      const { g, ctx } = target([["2026-03-10", value]])
      const p = goalProgress(g, ctx)
      expect(forecastGoal(g, p, goalHistory(g, ctx, today), today).outlook).toBe(outlook)
    }
  })

  it("predicts the finish from the recent pace", () => {
    const { g, ctx } = target([
      ["2026-03-02", 10],
      ["2026-03-11", 40],
    ])
    const today = "2026-03-11"
    const f = forecastGoal(g, goalProgress(g, ctx), goalHistory(g, ctx, today), today)
    // 40% in 10 days → 4%/day → 60% left takes 15 more days
    expect(f.pacePerDay).toBeCloseTo(0.04)
    expect(f.predicted).toBe("2026-03-26")
  })

  it("counts progress made on the start day, but waits a few days before predicting", () => {
    const { g, ctx } = target([["2026-03-01", 20]])
    const first = forecastGoal(g, goalProgress(g, ctx), goalHistory(g, ctx, "2026-03-01"), "2026-03-01")
    expect(first.early).toBe(true)
    expect(first.predicted).toBeNull()
    const later = forecastGoal(g, goalProgress(g, ctx), goalHistory(g, ctx, "2026-03-05"), "2026-03-05")
    // 20% in 4 days → 5%/day → 80% left takes 16 more days
    expect(later.pacePerDay).toBeCloseTo(0.05)
    expect(later.predicted).toBe("2026-03-21")
  })

  it("handles finished, overdue and not-started goals", () => {
    const { g, ctx } = target([["2026-03-05", 100]])
    expect(forecastGoal(g, goalProgress(g, ctx), [], "2026-03-06").outlook).toBe("ready")
    expect(forecastGoal({ ...g, status: "done" }, goalProgress(g, ctx), [], "2026-03-06").outlook).toBe("complete")
    const late = target([["2026-03-05", 30]])
    expect(forecastGoal(late.g, goalProgress(late.g, late.ctx), [], "2026-04-02").outlook).toBe("overdue")
    expect(forecastGoal(goal(), goalProgress(goal(), none), [], "2026-03-20").outlook).toBe("not-started")
  })
})

describe("horizons and the roadmap", () => {
  it("suggests a deadline at the end of the horizon", () => {
    expect(defaultDueDate("week", "2026-03-11", 1)).toBe("2026-03-15") // Wed → Sun
    expect(defaultDueDate("month", "2026-02-10")).toBe("2026-02-28")
    expect(defaultDueDate("quarter", "2026-05-02")).toBe("2026-06-30")
    expect(defaultDueDate("year", "2026-05-02")).toBe("2026-12-31")
    expect(defaultDueDate("five-year", "2026-05-02")).toBe("2031-05-01")
  })

  it("adds the New goal quick action to older prefs once, and respects turning it off", () => {
    const older = migratePrefs({ quickActions: ["task", "focus"] })
    expect(older.quickActions).toEqual(["task", "goal", "focus"])
    const off = migratePrefs({ quickActions: ["task", "focus"], seenQuickActions: [...QUICK_ACTIONS] })
    expect(off.quickActions).toEqual(["task", "focus"])
  })

  it("rolls the deadline on when little of the period is left", () => {
    expect(defaultDueDate("week", "2026-03-14", 1)).toBe("2026-03-15") // Sat: 2 days is enough
    expect(defaultDueDate("week", "2026-03-15", 1)).toBe("2026-03-22") // Sun: just today left
    expect(defaultDueDate("month", "2026-02-20")).toBe("2026-02-28")
    expect(defaultDueDate("month", "2026-02-22")).toBe("2026-03-31")
    expect(defaultDueDate("quarter", "2026-06-10")).toBe("2026-09-30")
    expect(defaultDueDate("year", "2026-08-31")).toBe("2026-12-31")
    expect(defaultDueDate("year", "2026-10-11")).toBe("2027-12-31")
  })

  it("only lets a goal serve a longer-horizon goal that isn't below it", () => {
    const vision = goal({ id: "v", horizon: "five-year" })
    const year = goal({ id: "y", horizon: "year", parentId: "v" })
    const month = goal({ id: "m", horizon: "month", parentId: "y" })
    expect(parentCandidates(month, [vision, year, month]).map((g) => g.id)).toEqual(["v", "y"])
    expect(parentCandidates(vision, [vision, year, month])).toEqual([])
  })

  it("earns XP for milestones and achieved goals", () => {
    const g = goal({ horizon: "year", status: "done", milestones: [{ id: "a", title: "A", due: null, doneAt: "2026-03-05T10:00:00.000Z" }] })
    expect(computeXP({ tasks: [], habitLogs: [], sessions: [], reflections: [], goals: [g] }).goals).toBe(115)
  })
})

describe("goals in the database", () => {
  beforeEach(async () => {
    await wipeAllData()
  })

  it("validates goals and parent links", async () => {
    await expect(createGoal({ title: " ", startDate: todayISO() })).rejects.toBeInstanceOf(ValidationError)
    await expect(createGoal({ title: "Bad dates", startDate: "2026-05-10", dueDate: "2026-05-01" })).rejects.toThrow("before the start")
    const year = await createGoal({ title: "Year", horizon: "year", startDate: todayISO() })
    const month = await createGoal({ title: "Month", horizon: "month", startDate: todayISO(), parentId: year.id })
    await expect(createGoal({ title: "Bigger", horizon: "five-year", startDate: todayISO(), parentId: month.id })).rejects.toThrow("longer horizon")
    await expect(updateGoal(year.id, { horizon: "week" })).rejects.toThrow()
  })

  it("logs milestones and achievements once, and undoes cleanly", async () => {
    const g = await createGoal({ title: "Run a 10K", startDate: todayISO(), milestones: [{ id: "m1", title: "5K", due: null, doneAt: null }] })
    expect(await toggleMilestone(g.id, "m1")).toBe(true)
    await setGoalStatus(g.id, "done")
    await setGoalStatus(g.id, "done")
    expect(await db.activity.where("type").equals("goal.completed").count()).toBe(1)
    expect(await db.activity.where("type").equals("milestone.completed").count()).toBe(1)
    await setGoalStatus(g.id, "active")
    expect(await db.activity.where("type").equals("goal.completed").count()).toBe(0)
    expect((await db.goals.get(g.id))?.completedAt).toBeNull()
  })

  it("keeps one logged value per day and refuses future days", async () => {
    const g = await createGoal({ title: "Read", startDate: todayISO(), measure: { kind: "target", unit: "books", start: 0, target: 12 } })
    await logGoalValue(g.id, { date: todayISO(), value: 2 })
    await logGoalValue(g.id, { date: todayISO(), value: 3 })
    expect((await db.goalLogs.toArray()).map((l) => l.value)).toEqual([3])
    await expect(logGoalValue(g.id, { date: addDays(todayISO(), 1), value: 4 })).rejects.toThrow("future")
  })

  it("deletes a goal without losing linked tasks, sub-goals or habits, and restores it", async () => {
    const year = await createGoal({ title: "Year", horizon: "year", startDate: todayISO() })
    const month = await createGoal({ title: "Month", horizon: "month", startDate: todayISO(), parentId: year.id })
    const task = await createTask({ title: "Linked", goalId: year.id })
    await createHabit({ name: "Habit", startDate: todayISO() })
    const snapshot = await deleteGoal(year.id)
    expect((await db.tasks.get(task.id))?.goalId).toBeNull()
    expect((await db.goals.get(month.id))?.parentId).toBeNull()
    await restoreGoal(snapshot)
    expect((await db.tasks.get(task.id))?.goalId).toBe(year.id)
    expect((await db.goals.get(month.id))?.parentId).toBe(year.id)
  })

  it("includes goals in backups and still reads backups made before goals existed", async () => {
    const g = await createGoal({ title: "Save up", startDate: todayISO(), measure: { kind: "target", unit: "₹", start: 0, target: 50000 } })
    await logGoalValue(g.id, { date: todayISO(), value: 12000 })
    const backup = await exportBackup()
    expect(backup.data.goals).toHaveLength(1)
    expect(backup.data.goalLogs).toHaveLength(1)

    const old = JSON.parse(JSON.stringify(backup))
    delete old.data.goals
    delete old.data.goalLogs
    const parsed = parseBackup(JSON.stringify(old))
    expect(parsed.data.goals).toEqual([])
    await restoreBackup(parsed)
    expect(await db.goals.count()).toBe(0)
  })
})
