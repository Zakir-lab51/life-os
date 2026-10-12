import { describe, expect, it } from "vitest"
import { createFlowClock } from "@/lib/design/flow-clock"

/*
  Regression: while a dialog or drawer was open the flow was drawn at its fixed resting
  time, and on close it jumped back to the live time: the background visibly snapped.
*/
describe("Liquid flow clock", () => {
  it("runs with the frames while animating", () => {
    const c = createFlowClock(10)
    c.tick(1000, true)
    expect(c.tick(1033, true)).toBeCloseTo(10.033, 3)
    expect(c.tick(1066, true)).toBeCloseTo(10.066, 3)
  })

  it("holds while paused and carries on from the same frame", () => {
    const c = createFlowClock(10)
    c.tick(1000, true)
    const before = c.tick(1033, true)
    // a drawer open for two seconds
    expect(c.tick(1500, false)).toBe(before)
    expect(c.tick(3000, false)).toBe(before)
    // first frame after it closes: no jump
    expect(c.tick(3033, true)).toBe(before)
    expect(c.tick(3066, true)).toBeCloseTo(before + 0.033, 3)
  })

  it("treats a long gap without pause notice (a hidden tab) as one frame", () => {
    const c = createFlowClock(10)
    c.tick(1000, true)
    expect(c.tick(9000, true)).toBeCloseTo(10 + 1 / 30, 3)
  })
})
