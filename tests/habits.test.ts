import { describe, expect, it } from "vitest"
import { addDays } from "@/lib/domain/dates"
import { bestStreak, completionRate, currentStreak, isDueOn } from "@/lib/domain/habits"
import { makeHabit } from "./helpers"

const today = "2026-03-20" // Friday
const days = (from: string, count: number) => Array.from({ length: count }, (_, i) => addDays(from, i))

describe("habit streaks", () => {
  const daily = makeHabit({ startDate: "2026-03-01" })

  it("counts consecutive days and doesn't break just because today isn't done yet", () => {
    const done = new Set(days("2026-03-15", 5)) // 15..19
    expect(currentStreak(daily, done, today).current).toBe(5)
    done.add(today)
    expect(currentStreak(daily, done, today).current).toBe(6)
  })

  it("forgives one missed day per week as a rest day", () => {
    // done 10..19 except the 16th
    const done = new Set(days("2026-03-10", 10).filter((d) => d !== "2026-03-16"))
    const s = currentStreak(daily, done, today)
    expect(s.current).toBe(9)
    expect(s.restDaysUsed).toBe(1)
  })

  it("forgives a single miss yesterday when there's a streak behind it", () => {
    const done = new Set(days("2026-03-10", 9)) // 10..18, missed 19
    expect(currentStreak(daily, done, today).current).toBe(9)
  })

  it("ends the streak on two misses close together", () => {
    // missed 16 and 18: the 18th is forgiven as a rest day, the 16th ends it → 19th and 17th count
    const done = new Set(days("2026-03-10", 10).filter((d) => d !== "2026-03-16" && d !== "2026-03-18"))
    const s = currentStreak(daily, done, today)
    expect(s.current).toBe(2)
    expect(s.restDaysUsed).toBe(1)
  })

  it("is zero with no check-ins", () => {
    expect(currentStreak(daily, new Set(), today).current).toBe(0)
  })

  it("only looks at scheduled weekdays", () => {
    const monWedFri = makeHabit({ startDate: "2026-03-01", schedule: { kind: "weekdays", days: [1, 3, 5] } })
    expect(isDueOn(monWedFri, "2026-03-17")).toBe(false) // Tuesday
    const done = new Set(["2026-03-09", "2026-03-11", "2026-03-13", "2026-03-16", "2026-03-18"])
    expect(currentStreak(monWedFri, done, today).current).toBe(5)
  })

  it("counts weekly-target habits in weeks, with the current week still in progress", () => {
    const weekly = makeHabit({ startDate: "2026-02-23", schedule: { kind: "weekly", times: 2 } })
    // week of Mar 2: 2 check-ins, week of Mar 9: 3 check-ins, current week (Mar 16): 1 so far
    const done = new Set(["2026-03-03", "2026-03-05", "2026-03-09", "2026-03-10", "2026-03-12", "2026-03-17"])
    const s = currentStreak(weekly, done, today)
    expect(s.unit).toBe("week")
    expect(s.current).toBe(2)
  })

  it("finds the best streak in the history", () => {
    const done = new Set([...days("2026-03-01", 4), ...days("2026-03-08", 7)])
    expect(bestStreak(daily, done, today)).toBe(7)
  })
})

describe("habit completion rate", () => {
  it("is the share of due days that were checked in", () => {
    const h = makeHabit({ startDate: "2026-03-01" })
    const done = new Set(days("2026-03-14", 5))
    expect(completionRate(h, done, "2026-03-11", "2026-03-20")).toBe(0.5)
  })

  it("is null before the habit started", () => {
    const h = makeHabit({ startDate: "2026-03-25" })
    expect(completionRate(h, new Set(), "2026-03-01", "2026-03-20")).toBeNull()
  })
})
