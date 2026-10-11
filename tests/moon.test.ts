import { describe, expect, it } from "vitest"
import { moonPath, moonPhase, moonPhaseName } from "@/lib/domain/moon"

describe("moon phase (the sidebar watch)", () => {
  it("matches known new and full moons to within a few hours", () => {
    // 11 Jan 2024 11:57 UTC was a new moon, 25 Jan 2024 17:54 UTC a full moon
    const newMoon = moonPhase(new Date(Date.UTC(2024, 0, 11, 11, 57)))
    expect(Math.min(newMoon, 1 - newMoon)).toBeLessThan(0.01)
    expect(moonPhase(new Date(Date.UTC(2024, 0, 25, 17, 54)))).toBeCloseTo(0.5, 1)
    expect(moonPhaseName(moonPhase(new Date(Date.UTC(2024, 0, 25, 17, 54))))).toBe("Full moon")
    expect(moonPhaseName(moonPhase(new Date(Date.UTC(2024, 0, 18, 3, 52))))).toBe("First quarter")
  })

  it("stays within 0..1 for dates before the reference", () => {
    const p = moonPhase(new Date(Date.UTC(1990, 5, 1)))
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThan(1)
  })

  it("draws a full disc at full moon and nothing at new moon", () => {
    // full: left limb + a terminator bulging right with the full radius
    expect(moonPath(10, 10, 5, 0.5)).toBe("M10 5 A5 5 0 0 0 10 15 A5 5 0 0 0 10 5 Z")
    // new: right limb and a terminator over the same right half, so no area
    expect(moonPath(10, 10, 5, 0)).toBe("M10 5 A5 5 0 0 1 10 15 A5 5 0 0 0 10 5 Z")
    // first quarter: the right half, closed by a straight terminator
    expect(moonPath(10, 10, 5, 0.25)).toBe("M10 5 A5 5 0 0 1 10 15 A0 5 0 0 0 10 5 Z")
  })
})
