import { describe, expect, it } from "vitest"
import { arrangeBoard, settlePending } from "@/features/tasks/board-layout"
import { makeTask } from "./helpers"

const ids = (list: { id: string }[]) => list.map((t) => t.id)

describe("Kanban board layout", () => {
  const a = makeTask({ id: "a", status: "todo", dueDate: "2026-03-10" })
  const b = makeTask({ id: "b", status: "todo", dueDate: "2026-03-12" })
  const c = makeTask({ id: "c", status: "in_progress" })
  const d = makeTask({ id: "d", status: "done", completedAt: "2026-03-08T10:00:00.000Z" })
  const e = makeTask({ id: "e", status: "done", completedAt: "2026-03-09T10:00:00.000Z" })
  const tasks = [b, a, c, d, e]

  it("sorts open work by due date and finished work most recent first", () => {
    const cols = arrangeBoard(tasks, new Map(), null)
    expect(ids(cols.todo)).toEqual(["a", "b"])
    expect(ids(cols.in_progress)).toEqual(["c"])
    expect(ids(cols.done)).toEqual(["e", "d"])
  })

  it("shows the dragged card in the column it is over, so it lands where it stays", () => {
    const cols = arrangeBoard(tasks, new Map(), { id: "a", over: "in_progress" })
    expect(ids(cols.todo)).toEqual(["b"])
    expect(ids(cols.in_progress)).toContain("a")
    // over nothing: it stays where it was
    expect(ids(arrangeBoard(tasks, new Map(), { id: "a", over: null }).todo)).toContain("a")
  })

  it("shows a dropped move at once, before the database reports it, with an arrival in Done on top", () => {
    const cols = arrangeBoard(tasks, new Map([["b", "done"]]), null)
    expect(ids(cols.todo)).toEqual(["a"])
    expect(ids(cols.done)).toEqual(["b", "e", "d"])
  })

  it("forgets pending moves once the tasks show them, and keeps the rest", () => {
    const pending = new Map([
      ["a", "done" as const],
      ["c", "done" as const],
      ["gone", "todo" as const],
    ])
    const byId = new Map(tasks.map((t) => [t.id, t.id === "a" ? { ...t, status: "done" as const } : t]))
    expect([...settlePending(pending, byId)]).toEqual([["c", "done"]])
    // nothing to forget: the same map comes back, so no re-render
    const steady = new Map([["c", "done" as const]])
    expect(settlePending(steady, byId)).toBe(steady)
  })
})
