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

  it("reads p1–p4 as priority", () => {
    expect(parseCapture("Book flights p1", today)).toMatchObject({ title: "Book flights", priority: 1 })
  })

  it("understands next week, next <day>, in N days and weeks", () => {
    // today is Monday 9 March
    expect(parseCapture("Plan trip next week", today)).toMatchObject({ title: "Plan trip", dueDate: "2026-03-16" })
    expect(parseCapture("Viva prep next fri", today)).toMatchObject({ title: "Viva prep", dueDate: "2026-03-20" })
    expect(parseCapture("Renew card in 3 days", today)).toMatchObject({ title: "Renew card", dueDate: "2026-03-12" })
    expect(parseCapture("Dentist in 2 weeks", today).dueDate).toBe("2026-03-23")
    expect(parseCapture("Call tonight", today).dueDate).toBe(today)
  })

  it("reads dates written with a month name or day/month", () => {
    expect(parseCapture("Exam 14 apr", today)).toMatchObject({ title: "Exam", dueDate: "2026-04-14" })
    expect(parseCapture("Exam apr 14", today).dueDate).toBe("2026-04-14")
    expect(parseCapture("Fees 14/10", today).dueDate).toBe("2026-10-14")
    expect(parseCapture("Fees 14/10/2027", today).dueDate).toBe("2027-10-14")
    // a date already past this year means next year
    expect(parseCapture("Birthday 2 feb", today).dueDate).toBe("2027-02-02")
  })

  it("leaves numbers that aren't dates alone", () => {
    expect(parseCapture("Read 20 pages", today)).toMatchObject({ title: "Read 20 pages", dueDate: null })
    expect(parseCapture("Fix 31/02", today)).toMatchObject({ title: "Fix 31/02", dueDate: null })
  })
})
