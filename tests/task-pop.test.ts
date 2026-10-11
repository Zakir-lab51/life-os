import { beforeEach, describe, expect, it, vi } from "vitest"
import { createTask, wipeAllData } from "@/lib/db/repo"
import { db } from "@/lib/db/db"
import { toggleDone, wasJustCompleted } from "@/features/tasks/task-actions"

beforeEach(async () => {
  await wipeAllData()
  vi.useRealTimers()
})

describe("a ticked task's pop survives its row being rebuilt", () => {
  it("marks a task as just completed when you complete it, for a moment", async () => {
    vi.useFakeTimers({ toFake: ["performance"] })
    const task = await createTask({ title: "Write up practical record" })
    expect(wasJustCompleted(task.id)).toBe(false)
    await toggleDone(task)
    expect((await db.tasks.get(task.id))?.status).toBe("done")
    expect(wasJustCompleted(task.id)).toBe(true)
    vi.advanceTimersByTime(1001)
    expect(wasJustCompleted(task.id)).toBe(false)
  })

  it("doesn't mark reopening", async () => {
    const task = await createTask({ title: "Call home" })
    await toggleDone(task)
    const done = (await db.tasks.get(task.id))!
    await new Promise((r) => setTimeout(r, 1050))
    await toggleDone(done)
    expect((await db.tasks.get(task.id))?.status).not.toBe("done")
    expect(wasJustCompleted(task.id)).toBe(false)
  })
})
