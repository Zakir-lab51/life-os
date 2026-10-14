import { describe, expect, it } from "vitest"
import { reviewWeek, weekSummary } from "@/lib/domain/review"
import type { LifeData } from "@/lib/domain/scores"

const empty: LifeData = { tasks: [], habits: [], habitLogs: [], sessions: [], reflections: [], goals: [], goalLogs: [] }
const task = (o: Record<string, unknown>) => ({ id: String(Math.random()), title: "t", priority: 3, status: "todo", dueDate: null, completedAt: null, ...o }) as never

describe("weekly review", () => {
  it("looks back at last week on the first two days of a week, otherwise this one", () => {
    // weeks start on Monday: 12 Oct 2026 is a Monday
    expect(reviewWeek("2026-10-12")).toEqual({ start: "2026-10-05", end: "2026-10-11" })
    expect(reviewWeek("2026-10-13")).toEqual({ start: "2026-10-05", end: "2026-10-11" })
    expect(reviewWeek("2026-10-14")).toEqual({ start: "2026-10-12", end: "2026-10-18" })
    expect(reviewWeek("2026-10-18")).toEqual({ start: "2026-10-12", end: "2026-10-18" })
    // weeks starting on Sunday
    expect(reviewWeek("2026-10-11", 0)).toEqual({ start: "2026-10-04", end: "2026-10-10" })
  })

  it("counts what was finished, what slipped, focus and goal steps in the week", () => {
    const data: LifeData = {
      ...empty,
      tasks: [
        task({ title: "Done in week", status: "done", completedAt: "2026-10-13T10:00:00" }),
        task({ title: "Done before", status: "done", completedAt: "2026-10-01T10:00:00" }),
        task({ title: "Slipped", dueDate: "2026-10-13", priority: 1 }),
        task({ title: "Not due yet", dueDate: "2026-10-17" }),
      ],
      sessions: [{ id: "s1", date: "2026-10-14", actualSec: 3600 }, { id: "s2", date: "2026-10-20", actualSec: 600 }] as never,
      goalLogs: [{ id: "g:2026-10-15", goalId: "g", date: "2026-10-15", value: 3 }] as never,
    }
    const s = weekSummary(data, "2026-10-12", "2026-10-18", "2026-10-15")
    expect(s.completed.map((t) => t.title)).toEqual(["Done in week"])
    expect(s.slipped.map((t) => t.title)).toEqual(["Slipped"])
    expect(s.focusMin).toBe(60)
    expect(s.goalSteps).toBe(1)
    expect(s.habitRate).toBeNull()
  })
})
