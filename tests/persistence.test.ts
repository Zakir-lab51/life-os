import { beforeEach, describe, expect, it } from "vitest"
import { db } from "@/lib/db/db"
import {
  BlockedError,
  ValidationError,
  completeTaskById,
  createGoal,
  createHabit,
  createTask,
  deleteTasks,
  ensurePrefs,
  recordFocusSession,
  reopenTaskById,
  restoreTasks,
  toggleHabitLog,
  updatePrefs,
  updateTask,
  wipeAllData,
} from "@/lib/db/repo"
import { exportBackup, parseBackup, restoreBackup } from "@/lib/db/backup"
import { removeDemo, seedDemo } from "@/lib/db/demo"
import { todayISO } from "@/lib/domain/dates"
import { makeSession } from "./helpers"

beforeEach(async () => {
  await wipeAllData()
})

describe("persistence", () => {
  it("stores tasks and reads them back after reopening the database", async () => {
    const t = await createTask({ title: "  Write report  ", tags: ["#Work", "work"], estimateMin: 45 })
    db.close()
    await db.open()
    const stored = await db.tasks.get(t.id)
    expect(stored?.title).toBe("Write report")
    expect(stored?.tags).toEqual(["work"])
    expect(stored?.estimateMin).toBe(45)
  })

  it("rejects invalid input with field messages", async () => {
    await expect(createTask({ title: "   " })).rejects.toBeInstanceOf(ValidationError)
    await expect(createTask({ title: "x", estimateMin: 1 })).rejects.toThrow("At least 5 minutes")
  })

  it("completes recurring tasks once, and undoing removes the untouched next instance", async () => {
    const t = await createTask({ title: "Daily review", dueDate: todayISO(), recurrence: { freq: "daily", interval: 1 } })
    const result = await completeTaskById(t.id)
    expect(result?.next).toBeTruthy()
    expect(await db.tasks.count()).toBe(2)
    expect(await db.activity.where("type").equals("task.completed").count()).toBe(1)

    // completing again is a no-op (no duplicate instance, no duplicate event)
    expect(await completeTaskById(t.id)).toBeNull()
    expect(await db.tasks.count()).toBe(2)

    await reopenTaskById(t.id)
    expect(await db.tasks.count()).toBe(1)
    expect(await db.activity.where("type").equals("task.completed").count()).toBe(0)
  })

  it("refuses to complete a task whose prerequisite is open, and blocks dependency cycles", async () => {
    const a = await createTask({ title: "Collect readings" })
    const b = await createTask({ title: "Write record", dependsOn: [a.id] })
    await expect(completeTaskById(b.id)).rejects.toBeInstanceOf(BlockedError)
    await expect(updateTask(a.id, { dependsOn: [b.id] })).rejects.toBeInstanceOf(ValidationError)
    await completeTaskById(a.id)
    await expect(completeTaskById(b.id)).resolves.toBeTruthy()
  })

  it("supports undo after delete", async () => {
    const t = await createTask({ title: "Keep me" })
    const snapshot = await deleteTasks([t.id])
    expect(await db.tasks.count()).toBe(0)
    await restoreTasks(snapshot)
    expect((await db.tasks.get(t.id))?.title).toBe("Keep me")
  })

  it("toggles habit check-ins without duplicates and refuses future days", async () => {
    const h = await createHabit({ name: "Meditate", startDate: "2026-01-01" })
    const today = todayISO()
    expect(await toggleHabitLog(h.id, today)).toBe(true)
    expect(await toggleHabitLog(h.id, today)).toBe(false)
    expect(await toggleHabitLog(h.id, today)).toBe(true)
    expect(await db.habitLogs.count()).toBe(1)
    await expect(toggleHabitLog(h.id, "2999-01-01")).rejects.toThrow()
  })

  it("records a focus session exactly once", async () => {
    const s = makeSession()
    expect(await recordFocusSession(s)).toBe(true)
    expect(await recordFocusSession(s)).toBe(false)
    expect(await db.focusSessions.count()).toBe(1)
    expect(await db.activity.count()).toBe(1)
  })

  it("validates prefs", async () => {
    await ensurePrefs()
    await expect(updatePrefs({ dayStartMin: 20 * 60, dayEndMin: 20 * 60 + 30 })).rejects.toBeInstanceOf(ValidationError)
    const p = await updatePrefs({ name: "Zakir" })
    expect(p.name).toBe("Zakir")
  })

  it("round-trips a full backup", async () => {
    await ensurePrefs()
    await seedDemo()
    const before = { tasks: await db.tasks.count(), logs: await db.habitLogs.count(), sessions: await db.focusSessions.count(), goals: await db.goals.count(), goalLogs: await db.goalLogs.count() }
    expect(before.goals).toBeGreaterThan(0)
    const json = JSON.stringify(await exportBackup())

    await wipeAllData()
    expect(await db.tasks.count()).toBe(0)

    await restoreBackup(parseBackup(json))
    expect(await db.tasks.count()).toBe(before.tasks)
    expect(await db.habitLogs.count()).toBe(before.logs)
    expect(await db.focusSessions.count()).toBe(before.sessions)
    expect(await db.goals.count()).toBe(before.goals)
    expect(await db.goalLogs.count()).toBe(before.goalLogs)
  })

  it("rejects files that aren't LIFE OS backups", () => {
    expect(() => parseBackup("not json")).toThrow("valid JSON")
    expect(() => parseBackup(JSON.stringify({ app: "other" }))).toThrow("LIFE OS backup")
  })

  it("removes demo data without touching the user's own records", async () => {
    const mine = await createTask({ title: "My real task" })
    await seedDemo()
    expect(await db.tasks.count()).toBeGreaterThan(10)
    // the demo's goals hang together: every link points at a demo record
    const goals = await db.goals.toArray()
    const ids = new Set(goals.map((g) => g.id))
    expect(goals.length).toBeGreaterThan(5)
    expect(goals.every((g) => g.demo && (!g.parentId || ids.has(g.parentId)))).toBe(true)
    expect((await db.tasks.toArray()).filter((t) => t.goalId).every((t) => ids.has(t.goalId!))).toBe(true)
    // link the user's own records to demo goals; removing the demo must keep them, unlinked
    const demoGoal = goals.find((g) => g.horizon === "five-year")!
    await updateTask(mine.id, { goalId: demoGoal.id })
    const ownGoal = await createGoal({ title: "My own goal", horizon: "year", startDate: todayISO(), parentId: demoGoal.id })
    await removeDemo()
    const left = await db.tasks.toArray()
    expect(left.map((t) => t.id)).toEqual([mine.id])
    expect(left[0].goalId).toBeNull()
    expect(await db.habits.count()).toBe(0)
    expect(await db.focusSessions.count()).toBe(0)
    expect((await db.goals.toArray()).map((g) => [g.id, g.parentId])).toEqual([[ownGoal.id, null]])
    expect(await db.goalLogs.count()).toBe(0)
  })
})
