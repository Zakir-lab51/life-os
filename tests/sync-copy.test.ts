// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest"
import { readSync, writeSync } from "@/lib/db/cloud"
import { LifeDB } from "@/lib/db/db"
import { copyTables } from "@/features/sync/sync"

const now = "2026-10-14T09:00:00.000Z"
const task = (id: string, title: string) => ({ id, title, notes: "", status: "todo", priority: 3, area: "work", tags: [], subtasks: [], estimateMin: 30, dueDate: null, order: 0, createdAt: now, updatedAt: now }) as never

const opened: LifeDB[] = []
const fresh = (name: string) => {
  const d = new LifeDB(name)
  opened.push(d)
  return d
}
afterEach(async () => {
  for (const d of opened.splice(0)) await d.delete()
})

describe("moving data between this device's own copy and the synced one", () => {
  it("copies every table, notifications included, and leaves the source as it was", async () => {
    const own = fresh("own-a")
    const synced = fresh("synced-a")
    await own.tasks.put(task("t_1", "Revise anatomy"))
    await own.habitLogs.put({ id: "h_1:2026-10-14", habitId: "h_1", date: "2026-10-14", createdAt: now } as never)
    await own.notifications.put({ id: "n_1", at: now, read: 0, href: null, kind: "info", title: "Hi", body: "" } as never)
    await copyTables(own, synced, false)
    expect((await synced.tasks.get("t_1"))?.title).toBe("Revise anatomy")
    expect(await synced.habitLogs.count()).toBe(1)
    expect(await synced.notifications.count()).toBe(1)
    expect(await own.tasks.count()).toBe(1)
  })

  it("adds to what's there, or replaces it when asked", async () => {
    const from = fresh("from-b")
    const to = fresh("to-b")
    await from.tasks.put(task("t_1", "From this device"))
    await to.tasks.put(task("t_2", "Already there"))
    await copyTables(from, to, false)
    expect((await to.tasks.toArray()).map((t) => t.id).sort()).toEqual(["t_1", "t_2"])
    await copyTables(from, to, true)
    expect((await to.tasks.toArray()).map((t) => t.id)).toEqual(["t_1"])
  })
})

describe("the sync setting", () => {
  it("round-trips, and anything unexpected reads as off", () => {
    writeSync({ start: "account", ready: false })
    expect(readSync()).toEqual({ start: "account", ready: false })
    localStorage.setItem("life-os.sync", '{"start":"elsewhere"}')
    expect(readSync()).toBeNull()
    localStorage.setItem("life-os.sync", "not json")
    expect(readSync()).toBeNull()
    writeSync(null)
    expect(readSync()).toBeNull()
  })
})
