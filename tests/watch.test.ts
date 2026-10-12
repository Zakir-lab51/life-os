import { describe, expect, it } from "vitest"
import { IDLE_TIMER, type TimerState } from "@/lib/domain/focus"
import { watchReadout } from "@/lib/domain/watch"

// Monday 12 October 2026, 17:42:30 local time
const at = new Date(2026, 9, 12, 17, 42, 30)
const day = { dayStart: 7 * 60, dayEnd: 23 * 60, focusMin: 25 }

describe("digital watch readout", () => {
  it("tells the time as the locale writes it, with the day and date", () => {
    const us = watchReadout(at, IDLE_TIMER, { ...day, locale: "en-US" })
    expect([us.hour, us.minute, us.period]).toEqual(["5", "42", "PM"])
    expect(us.weekday).toBe("MON")
    expect(us.day).toBe(12)
    const gb = watchReadout(at, IDLE_TIMER, { ...day, locale: "en-GB" })
    expect([gb.hour, gb.minute, gb.period]).toEqual(["17", "42", null])
  })

  it("shows how much of the day is left", () => {
    // 17:42 in a 07:00–23:00 day: 318 of 960 minutes left
    expect(watchReadout(at, IDLE_TIMER, day).dayLeft).toBeCloseTo(318 / 960, 3)
    expect(watchReadout(new Date(2026, 9, 12, 23, 30), IDLE_TIMER, day).dayLeft).toBe(0)
  })

  it("offers focus when idle, and counts a running session down with its progress", () => {
    const idle = watchReadout(at, IDLE_TIMER, day)
    expect(idle.focus).toMatchObject({ state: "idle", text: "Focus · 25m", progress: null })
    const running: TimerState = { ...IDLE_TIMER, status: "running", phase: "focus", startedAt: at.getTime() - 10 * 60_000, resumedAt: at.getTime() - 10 * 60_000, accumulatedMs: 0, plannedMs: 25 * 60_000 }
    const r = watchReadout(at, running, day)
    expect(r.focus.text).toBe("15:00")
    expect(r.focus.progress).toBeCloseTo(0.4, 5)
    expect(r.focus.rest).toBe(false)
    expect(r.label).toContain("Focus running, 15:00 left")
  })

  it("marks a paused session, a break, and the open-ended stopwatch", () => {
    const paused: TimerState = { ...IDLE_TIMER, status: "paused", phase: "focus", accumulatedMs: 5 * 60_000, plannedMs: 25 * 60_000 }
    expect(watchReadout(at, paused, day).focus.text).toBe("Paused 20:00")
    const rest: TimerState = { ...IDLE_TIMER, status: "running", phase: "short", resumedAt: at.getTime() - 60_000, plannedMs: 5 * 60_000 }
    expect(watchReadout(at, rest, day).focus.rest).toBe(true)
    const stopwatch: TimerState = { ...IDLE_TIMER, status: "running", phase: "focus", resumedAt: at.getTime() - 90_000, plannedMs: null }
    expect(watchReadout(at, stopwatch, day).focus).toMatchObject({ text: "01:30", progress: null })
  })
})
