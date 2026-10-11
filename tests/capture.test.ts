import { describe, expect, it } from "vitest"
import { parseCapture } from "@/lib/domain/capture"

const today = "2026-03-09" // Monday

describe("quick capture", () => {
  it("pulls priority, tags, area, date and estimate out of the text", () => {
    const r = parseCapture("Revise anatomy notes tomorrow !2 #exam #Anatomy @study 1h30m", today)
    expect(r.title).toBe("Revise anatomy notes")
    expect(r.priority).toBe(2)
    expect(r.tags).toEqual(["exam", "anatomy"])
    expect(r.area).toBe("study")
    expect(r.dueDate).toBe("2026-03-10")
    expect(r.estimateMin).toBe(90)
  })

  it("understands weekday names as the next such day (today counts)", () => {
    expect(parseCapture("Gym fri", today).dueDate).toBe("2026-03-13")
    expect(parseCapture("Standup mon", today).dueDate).toBe("2026-03-09")
  })

  it("leaves ordinary words alone", () => {
    const r = parseCapture("Email @someone about the 3 reports", today)
    expect(r.title).toBe("Email @someone about the 3 reports")
    expect(r.area).toBeNull()
    expect(r.estimateMin).toBeNull()
  })

  it("never accepts a due date in the past", () => {
    expect(parseCapture("Pay bill 2026-01-01", today).dueDate).toBe(today)
  })
})
