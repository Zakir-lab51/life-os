import { describe, expect, it } from "vitest"
import { nextDueAfterCompletion, nextOccurrence } from "@/lib/domain/recurrence"
import { completeTask, createsCycle, dueBucket, isBlocked, reopenTask, taskProgress } from "@/lib/domain/tasks"
import { localDate, makeTask } from "./helpers"

// 2026-03-09 is a Monday
describe("recurrence", () => {
  it("steps daily, weekly and monthly rules", () => {
    expect(nextOccurrence({ freq: "daily", interval: 1 }, "2026-03-09")).toBe("2026-03-10")
    expect(nextOccurrence({ freq: "daily", interval: 3 }, "2026-03-09")).toBe("2026-03-12")
    expect(nextOccurrence({ freq: "weekly", interval: 1 }, "2026-03-09")).toBe("2026-03-16")
    expect(nextOccurrence({ freq: "monthly", interval: 1 }, "2026-03-09")).toBe("2026-04-09")
  })

  it("clamps monthly rules to the end of shorter months", () => {
    expect(nextOccurrence({ freq: "monthly", interval: 1 }, "2026-01-31")).toBe("2026-02-28")
  })

  it("picks the next listed weekday, then wraps to the following week", () => {
    const monWedFri = { freq: "weekly" as const, interval: 1, weekdays: [1, 3, 5] }
    expect(nextOccurrence(monWedFri, "2026-03-09")).toBe("2026-03-11") // Mon → Wed
    expect(nextOccurrence(monWedFri, "2026-03-13")).toBe("2026-03-16") // Fri → next Mon
    const biweeklyMon = { freq: "weekly" as const, interval: 2, weekdays: [1] }
    expect(nextOccurrence(biweeklyMon, "2026-03-09")).toBe("2026-03-23")
  })

  it("never schedules the next instance on or before the completion day", () => {
    // overdue daily task due 5 days ago, finished today → due tomorrow
    expect(nextDueAfterCompletion({ freq: "daily", interval: 1 }, "2026-03-04", "2026-03-09")).toBe("2026-03-10")
    // finished early: next is computed from the due date
    expect(nextDueAfterCompletion({ freq: "weekly", interval: 1 }, "2026-03-16", "2026-03-13")).toBe("2026-03-23")
  })
})

describe("task completion", () => {
  it("marks a plain task done with a timestamp and no follow-up", () => {
    const now = localDate("2026-03-09", 15)
    const { completed, next } = completeTask(makeTask(), now, () => "new")
    expect(completed.status).toBe("done")
    expect(completed.completedAt).toBe(now.toISOString())
    expect(next).toBeNull()
  })

  it("spawns the next instance of a recurring task with fresh subtasks and a shifted reminder", () => {
    const task = makeTask({
      id: "orig",
      dueDate: "2026-03-09",
      recurrence: { freq: "weekly", interval: 1 },
      reminderAt: localDate("2026-03-09", 8).toISOString(),
      subtasks: [{ id: "s1", title: "Step", done: true }],
    })
    const { completed, next } = completeTask(task, localDate("2026-03-09", 15), () => "copy")
    expect(next).not.toBeNull()
    expect(next!.id).toBe("copy")
    expect(next!.dueDate).toBe("2026-03-16")
    expect(next!.status).toBe("todo")
    expect(next!.seriesId).toBe("orig")
    expect(next!.subtasks[0].done).toBe(false)
    expect(new Date(next!.reminderAt!).getTime()).toBe(localDate("2026-03-16", 8).getTime())
    expect(completed.nextId).toBe("copy")
  })

  it("reopening clears completion", () => {
    const done = completeTask(makeTask(), localDate("2026-03-09"), () => "x").completed
    const reopened = reopenTask(done, localDate("2026-03-09"))
    expect(reopened.status).toBe("todo")
    expect(reopened.completedAt).toBeNull()
  })
})

describe("dependencies and progress", () => {
  it("blocks a task until its prerequisites are done; deleted prerequisites don't block", () => {
    const a = makeTask({ id: "a" })
    const b = makeTask({ id: "b", dependsOn: ["a", "ghost"] })
    const byId = new Map([a, b].map((t) => [t.id, t]))
    expect(isBlocked(b, byId)).toBe(true)
    byId.set("a", { ...a, status: "done" })
    expect(isBlocked(b, byId)).toBe(false)
  })

  it("detects dependency cycles", () => {
    const a = makeTask({ id: "a", dependsOn: ["b"] })
    const b = makeTask({ id: "b", dependsOn: ["c"] })
    const c = makeTask({ id: "c" })
    const byId = new Map([a, b, c].map((t) => [t.id, t]))
    expect(createsCycle("c", "a", byId)).toBe(true)
    expect(createsCycle("a", "c", byId)).toBe(false)
    expect(createsCycle("a", "a", byId)).toBe(true)
  })

  it("measures progress from subtasks", () => {
    const t = makeTask({ subtasks: [{ id: "1", title: "x", done: true }, { id: "2", title: "y", done: false }] })
    expect(taskProgress(t)).toBe(0.5)
    expect(taskProgress({ ...t, status: "done" })).toBe(1)
  })

  it("buckets tasks by due date", () => {
    const today = "2026-03-09"
    expect(dueBucket(makeTask({ dueDate: "2026-03-08" }), today)).toBe("overdue")
    expect(dueBucket(makeTask({ dueDate: today }), today)).toBe("today")
    expect(dueBucket(makeTask({ dueDate: "2026-03-20" }), today)).toBe("upcoming")
    expect(dueBucket(makeTask(), today)).toBe("someday")
  })
})
