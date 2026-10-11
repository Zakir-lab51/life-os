import { describe, expect, it } from "vitest"
import { QUALITY, framesTooSlow, useQuality } from "@/lib/design/quality"

const frames = (ms: number, n = 90) => Array.from({ length: n }, () => ms)

describe("rendering quality", () => {
  it("calls 60 and 120 fps fine, and sustained slowness slow", () => {
    expect(framesTooSlow(frames(16.7))).toBe(false)
    expect(framesTooSlow(frames(8.3))).toBe(false)
    expect(framesTooSlow(frames(25))).toBe(true) // 40 fps
  })

  it("calls frequent long frames slow even when most are quick", () => {
    const stutter = [...frames(8.3, 80), ...frames(40, 12)]
    expect(framesTooSlow(stutter)).toBe(true)
    const oneHiccup = [...frames(8.3, 89), 120]
    expect(framesTooSlow(oneHiccup)).toBe(false)
  })

  it("needs a real sample before judging", () => {
    expect(framesTooSlow(frames(50, 10))).toBe(false)
  })

  it("steps down one level at a time and stops at still", () => {
    expect(useQuality.getState().level).toBe(0)
    useQuality.getState().stepDown()
    expect(useQuality.getState().level).toBe(1)
    for (let i = 0; i < 5; i++) useQuality.getState().stepDown()
    expect(useQuality.getState().level).toBe(3)
  })

  it("sheds the costliest effects first", () => {
    expect(QUALITY[0]).toMatchObject({ tilesBend: true, chromeBends: true })
    expect(QUALITY[1]).toMatchObject({ tilesBend: false, chromeBends: true })
    expect(QUALITY[2]).toMatchObject({ tilesBend: false, chromeBends: false })
    expect(QUALITY[3].flowFps).toBe(0)
    for (const l of [0, 1, 2] as const) expect(QUALITY[l].flowFps).toBeGreaterThan(0)
  })
})
