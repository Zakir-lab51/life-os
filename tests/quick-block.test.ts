import { describe, expect, it } from "vitest"
import { parseQuickBlock, type QuickContext } from "@/lib/domain/quick-block"

// planning tomorrow (no "now" to respect), a 07:00–23:00 day, nothing booked
const day: QuickContext = { nowMin: 0, isToday: false, dayStart: 7 * 60, dayEnd: 23 * 60, blocks: [] }
const hm = (h: number, m = 0) => h * 60 + m
const parse = (text: string, ctx: QuickContext = day) => {
  const r = parseQuickBlock(text, ctx)
  if (!r.ok) throw new Error(`${text}: ${r.reason}`)
  return r.block
}

describe("quick block: one line to a time block", () => {
  it("takes a time and a length out of the words", () => {
    expect(parse("Gym 6pm 1h")).toMatchObject({ title: "Gym", start: hm(18), end: hm(19), placed: "typed" })
    expect(parse("Deep work at 14:00 for 90m")).toMatchObject({ title: "Deep work", start: hm(14), end: hm(15, 30), kind: "focus" })
    expect(parse("Standup 9:30 15 min")).toMatchObject({ title: "Standup", start: hm(9, 30), end: hm(9, 45) })
    expect(parse("Anatomy 1h30 at 4pm")).toMatchObject({ title: "Anatomy", start: hm(16), end: hm(17, 30) })
  })

  it("reads ranges, letting the start borrow the end's am/pm", () => {
    expect(parse("Revise anatomy 2-3:30pm")).toMatchObject({ title: "Revise anatomy", start: hm(14), end: hm(15, 30), kind: "focus" })
    expect(parse("Meeting 11 to 12")).toMatchObject({ title: "Meeting", start: hm(11), end: hm(12) })
    expect(parse("Class 9-10:30")).toMatchObject({ start: hm(9), end: hm(10, 30) })
  })

  it("picks am or pm by what fits your day and hasn't passed", () => {
    expect(parse("Lunch at 1")).toMatchObject({ title: "Lunch", start: hm(13), kind: "break" })
    // at 10 am today, "at 7" means this evening
    expect(parse("Run at 7", { ...day, isToday: true, nowMin: hm(10) })).toMatchObject({ start: hm(19) })
    expect(parse("Run at 7")).toMatchObject({ start: hm(7) })
    expect(parse("Call at noon")).toMatchObject({ title: "Call", start: hm(12), end: hm(12, 30) })
  })

  it("never takes a bare number for a time", () => {
    const r = parse("Read 20 pages")
    expect(r.title).toBe("Read 20 pages")
    expect(r.placed).toBe("gap")
  })

  it("puts a block without a time in the next free gap that fits", () => {
    const ctx: QuickContext = { ...day, isToday: true, nowMin: hm(10, 7), blocks: [{ start: hm(10, 15), end: hm(11) }] }
    // from 10:15 on, the first 20-minute gap opens at 11:00
    expect(parse("Call home 20m", ctx)).toMatchObject({ title: "Call home", start: hm(11), end: hm(11, 20), placed: "gap" })
  })

  it("explains what's missing", () => {
    expect(parseQuickBlock("  ", day)).toMatchObject({ ok: false, reason: "empty" })
    expect(parseQuickBlock("6pm 1h", day)).toMatchObject({ ok: false, reason: "no-title" })
    const full: QuickContext = { ...day, blocks: [{ start: hm(7), end: hm(23) }] }
    expect(parseQuickBlock("Call home 20m", full)).toMatchObject({ ok: false, reason: "no-gap", title: "Call home", minutes: 20 })
  })

  it("reads a repeat, and leaves look-alike words alone", () => {
    expect(parse("Physiology lecture every mon wed 10-11am")).toMatchObject({ title: "Physiology lecture", start: hm(10), end: hm(11), days: [1, 3] })
    expect(parse("Lab mondays and thursdays 2-4pm")).toMatchObject({ title: "Lab", days: [1, 4] })
    expect(parse("Gym weekdays 7am 1h")).toMatchObject({ title: "Gym", start: hm(7), days: [1, 2, 3, 4, 5] })
    expect(parse("Meditate daily 6:30am 15m")).toMatchObject({ title: "Meditate", days: [0, 1, 2, 3, 4, 5, 6] })
    expect(parse("Long run every saturday 7am").days).toEqual([6])
    expect(parse("Check monitor at 9am")).toMatchObject({ title: "Check monitor", days: null })
    expect(parse("Call on monday 6pm").days).toBeNull()
  })
})
