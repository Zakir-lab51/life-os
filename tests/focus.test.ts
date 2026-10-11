import { describe, expect, it } from "vitest"
import { IDLE_TIMER, elapsedMs, finishesAt, isFinished, nextPhase, pause, remainingMs, resume, start, formatTimer, type FocusPhase } from "@/lib/domain/focus"

const MIN = 60_000

describe("focus timer accuracy", () => {
  it("measures elapsed time from timestamps, so missed ticks in a background tab don't matter", () => {
    const t0 = 1_000_000
    const s = start(IDLE_TIMER, { now: t0, sessionId: "a", plannedMs: 25 * MIN })
    // no ticks at all for 10 minutes (tab throttled / laptop asleep)
    expect(elapsedMs(s, t0 + 10 * MIN)).toBe(10 * MIN)
    expect(remainingMs(s, t0 + 10 * MIN)).toBe(15 * MIN)
    expect(isFinished(s, t0 + 25 * MIN)).toBe(true)
    expect(finishesAt(s)).toBe(t0 + 25 * MIN)
  })

  it("excludes paused time", () => {
    const t0 = 0
    let s = start(IDLE_TIMER, { now: t0, sessionId: "a", plannedMs: 25 * MIN })
    s = pause(s, t0 + 5 * MIN)
    expect(elapsedMs(s, t0 + 60 * MIN)).toBe(5 * MIN) // an hour later, still 5 minutes in
    s = resume(s, t0 + 60 * MIN)
    expect(elapsedMs(s, t0 + 62 * MIN)).toBe(7 * MIN)
    expect(finishesAt(s)).toBe(t0 + 60 * MIN + 20 * MIN)
  })

  it("never reports negative remaining time", () => {
    const s = start(IDLE_TIMER, { now: 0, sessionId: "a", plannedMs: MIN })
    expect(remainingMs(s, 10 * MIN)).toBe(0)
  })

  it("has no end for the stopwatch", () => {
    const s = start(IDLE_TIMER, { now: 0, sessionId: "a", plannedMs: null, mode: "stopwatch" })
    expect(remainingMs(s, 99 * MIN)).toBeNull()
    expect(isFinished(s, 99 * MIN)).toBe(false)
  })
})

describe("pomodoro cycle", () => {
  it("alternates focus and short breaks, with a long break every N focus sessions", () => {
    let state: { phase: FocusPhase; cycle: number } = { phase: "focus", cycle: 0 }
    const seen: string[] = []
    for (let i = 0; i < 8; i++) {
      state = nextPhase(state.phase, state.cycle, 4)
      seen.push(state.phase)
    }
    expect(seen).toEqual(["short", "focus", "short", "focus", "short", "focus", "long", "focus"])
  })

  it("formats times", () => {
    expect(formatTimer(25 * MIN)).toBe("25:00")
    expect(formatTimer(61 * MIN + 5000)).toBe("1:01:05")
  })
})
