import { describe, expect, it } from "vitest"
import { bezelFor, lensShift, maxLensShift, squircle } from "@/lib/design/lens"

describe("liquid glass lens", () => {
  it("rises from the edge to a flat top", () => {
    expect(squircle(0)).toBe(0)
    expect(squircle(1)).toBe(1)
    expect(squircle(0.5)).toBeGreaterThan(0.9) // a squircle is mostly flat
  })

  it("pulls the backdrop inwards only across the rim", () => {
    const bezel = 20
    const thickness = 25
    expect(lensShift(0, bezel, thickness)).toBe(0)
    expect(lensShift(bezel, bezel, thickness)).toBe(0)
    expect(lensShift(30, bezel, thickness)).toBe(0)
    for (let d = 0.5; d < bezel; d += 0.5) expect(lensShift(d, bezel, thickness)).toBeGreaterThan(0)
  })

  it("bends most in a thin band at the edge, then fades towards the flat top", () => {
    const bezel = 20
    const thickness = 25
    const samples = Array.from({ length: 199 }, (_, i) => lensShift(((i + 1) / 200) * bezel, bezel, thickness))
    const peak = samples.indexOf(Math.max(...samples))
    expect(peak / 200).toBeLessThan(0.15)
    for (let i = peak + 1; i < samples.length; i++) expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] + 1e-9)
    expect(maxLensShift(bezel, thickness)).toBeGreaterThan(8)
    expect(maxLensShift(bezel, thickness)).toBeLessThan(16)
  })

  it("bends more through thicker glass, and not at all with no glass (n = 1)", () => {
    expect(maxLensShift(20, 30)).toBeGreaterThan(maxLensShift(20, 20))
    expect(lensShift(4, 20, 25, 1)).toBeCloseTo(0)
  })

  it("sizes the rim to the surface", () => {
    expect(bezelFor(1200, 400, 24).bezel).toBeCloseTo(21.6)
    expect(bezelFor(1200, 400, 60).bezel).toBe(22) // capped
    expect(bezelFor(200, 30, 15).bezel).toBeCloseTo(13.5)
    expect(bezelFor(200, 20, 15).bezel).toBe(9) // a thin chip: at most half its height
    expect(bezelFor(200, 120, 2).bezel).toBe(10) // square-ish corners still get a rim
    const { bezel, thickness } = bezelFor(800, 300, 20)
    expect(thickness).toBeCloseTo(bezel * 1.25)
  })
})
