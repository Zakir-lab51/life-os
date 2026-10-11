import { describe, expect, it } from "vitest"
import { findConflicts, freeSlots, planDay } from "@/lib/domain/planner"
import { recommendTasks } from "@/lib/domain/scheduling"
import { makeHabit, makeTask } from "./helpers"

const H = 60

describe("planner", () => {
  it("finds overlapping blocks", () => {
    const conflicts = findConflicts([
      { id: "a", start: 9 * H, end: 10 * H },
      { id: "b", start: 9 * H + 30, end: 11 * H },
      { id: "c", start: 11 * H, end: 12 * H },
    ])
    expect([...conflicts].sort()).toEqual(["a", "b"])
  })

  it("computes free gaps around existing blocks", () => {
    const slots = freeSlots([{ start: 10 * H, end: 11 * H }], 8 * H, 12 * H)
    expect(slots).toEqual([
      { start: 8 * H, end: 10 * H },
      { start: 11 * H, end: 12 * H },
    ])
  })

  it("plans into free time only, never before now, never over existing blocks", () => {
    const tasks = [makeTask({ id: "big", priority: 1, estimateMin: 60, dueDate: "2026-03-10" }), makeTask({ id: "small", estimateMin: 15 })]
    const ranked = recommendTasks(tasks, { today: "2026-03-10", freeMinutes: 600 })
    const existing = [{ start: 10 * H, end: 11 * H, taskId: null }]
    const { suggestions } = planDay({ ranked, existing, habitsDue: [], dayStart: 8 * H, dayEnd: 18 * H, notBefore: 9 * H + 5 })

    for (const s of suggestions) {
      expect(s.start).toBeGreaterThanOrEqual(9 * H + 15) // rounded up to the next quarter hour
      for (const e of existing) expect(s.end <= e.start || s.start >= e.end).toBe(true)
    }
    const all = [...existing.map((e, i) => ({ id: `e${i}`, ...e })), ...suggestions.map((s) => ({ id: s.key, start: s.start, end: s.end }))]
    expect(findConflicts(all).size).toBe(0)

    const big = suggestions.find((s) => s.taskId === "big")!
    expect(big.kind).toBe("focus")
    expect(suggestions.some((s) => s.kind === "break")).toBe(true)
  })

  it("groups habits into their preferred part of the day", () => {
    const { suggestions } = planDay({
      ranked: [],
      existing: [],
      habitsDue: [makeHabit({ name: "Meditate", timeOfDay: "morning" }), makeHabit({ name: "Read", timeOfDay: "evening" })],
      dayStart: 7 * H,
      dayEnd: 22 * H,
      notBefore: 0,
    })
    const morning = suggestions.find((s) => s.key === "habits-morning")!
    const evening = suggestions.find((s) => s.key === "habits-evening")!
    expect(morning.start).toBe(7 * H)
    expect(evening.start).toBe(17 * H)
  })

  it("reports tasks that don't fit", () => {
    const ranked = recommendTasks([makeTask({ id: "x", estimateMin: 120 })], { today: "2026-03-10", freeMinutes: 30 })
    const { suggestions, unscheduled } = planDay({ ranked, existing: [], habitsDue: [], dayStart: 8 * H, dayEnd: 8 * H + 30, notBefore: 0 })
    expect(suggestions).toHaveLength(0)
    expect(unscheduled[0].title).toBe("Task")
  })
})
