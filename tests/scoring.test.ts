import { describe, expect, it } from "vitest"
import { dailyScore, lifeBalance, type LifeData } from "@/lib/domain/scores"
import { computeXP, levelFromXP, xpForNextLevel } from "@/lib/domain/xp"
import { recommendTasks } from "@/lib/domain/scheduling"
import { localDate, makeHabit, makeSession, makeTask } from "./helpers"

const prefs = { focus: { focusMin: 25, shortBreakMin: 5, longBreakMin: 15, longEvery: 4, autoStartBreaks: true, dailyTargetMin: 120 } }
const empty: LifeData = { tasks: [], habits: [], habitLogs: [], sessions: [], reflections: [], goals: [], goalLogs: [], projects: [] }
const day = "2026-03-10"

describe("daily productivity score", () => {
  it("is null when there is nothing to measure", () => {
    expect(dailyScore(day, empty, prefs).score).toBeNull()
  })

  it("weights tasks, focus and habits and re-balances when a part is missing", () => {
    const tasks = [
      makeTask({ dueDate: day, status: "done", completedAt: localDate(day, 10).toISOString() }),
      makeTask({ dueDate: day }),
    ]
    // tasks only: 1 of 2 → 50
    expect(dailyScore(day, { ...empty, tasks }, prefs).score).toBe(50)

    // + 120 focus minutes (target met) → (0.5*0.45 + 1*0.3) / 0.75 = 70
    const sessions = [makeSession({ date: day, actualSec: 120 * 60 })]
    expect(dailyScore(day, { ...empty, tasks, sessions }, prefs).score).toBe(70)

    // + one daily habit checked → (0.225 + 0.3 + 0.25) / 1 = 77.5 → 78
    const h = makeHabit({ startDate: "2026-03-01" })
    const habitLogs = [{ id: `${h.id}:${day}`, habitId: h.id, date: day, createdAt: "" }]
    expect(dailyScore(day, { ...empty, tasks, sessions, habits: [h], habitLogs }, prefs).score).toBe(78)
  })

  it("counts a task finished after its day as still open on that day", () => {
    const tasks = [makeTask({ dueDate: day, status: "done", completedAt: localDate("2026-03-12", 9).toISOString() })]
    expect(dailyScore(day, { ...empty, tasks }, prefs).score).toBe(0)
  })
})

describe("life balance", () => {
  it("reports untracked areas as null instead of inventing a value", () => {
    const radar = lifeBalance(empty, day, prefs)
    expect(radar.every((r) => r.value === null)).toBe(true)
  })

  it("derives health from health-area habits", () => {
    const h = makeHabit({ area: "health", startDate: "2026-02-01" })
    const habitLogs = ["2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07"].map((date) => ({ id: `${h.id}:${date}`, habitId: h.id, date, createdAt: "" }))
    const radar = lifeBalance({ ...empty, habits: [h], habitLogs }, day, prefs)
    expect(radar.find((r) => r.dim === "health")!.value).toBe(57) // 4 of 7 days
    expect(radar.find((r) => r.dim === "finance")!.value).toBeNull()
  })
})

describe("XP and levels", () => {
  it("rewards activity and caps daily focus XP", () => {
    const xp = computeXP({
      tasks: [makeTask({ status: "done", priority: 1 }), makeTask({ status: "done", priority: 4 }), makeTask()],
      habitLogs: [{ id: "a", habitId: "h", date: day, createdAt: "" }],
      sessions: [makeSession({ date: day, actualSec: 10 * 3600 })], // 10 hours in one day
      reflections: [],
    })
    expect(xp.tasks).toBe(25) // 15 + 10
    expect(xp.habits).toBe(5)
    expect(xp.focus).toBe(48) // capped at 240 min → 48
    expect(xp.total).toBe(78)
  })

  it("levels up with growing thresholds", () => {
    expect(levelFromXP(0).level).toBe(1)
    expect(levelFromXP(xpForNextLevel(1)).level).toBe(2)
    const l = levelFromXP(100 + 150 + 10)
    expect(l.level).toBe(3)
    expect(l.intoLevel).toBe(10)
  })
})

describe("task recommendations", () => {
  it("ranks overdue urgent work first and explains why", () => {
    const today = "2026-03-10"
    const overdue = makeTask({ id: "late", priority: 1, dueDate: "2026-03-07" })
    const later = makeTask({ id: "later", priority: 3, dueDate: "2026-03-20" })
    const recs = recommendTasks([later, overdue], { today, freeMinutes: 240 })
    expect(recs[0].task.id).toBe("late")
    expect(recs[0].reasons).toContain("Urgent priority")
    expect(recs[0].reasons.some((r) => r.startsWith("Overdue by 3 days"))).toBe(true)
  })

  it("leaves blocked tasks out", () => {
    const a = makeTask({ id: "a" })
    const b = makeTask({ id: "b", priority: 1, dependsOn: ["a"] })
    const ids = recommendTasks([a, b], { today: day, freeMinutes: 240 }).map((r) => r.task.id)
    expect(ids).toEqual(["a"])
  })
})
