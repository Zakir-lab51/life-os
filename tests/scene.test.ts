import { describe, expect, it } from "vitest"
import { migratePrefs } from "@/lib/db/defaults"
import { DEFAULT_DESIGN, PHOTOS } from "@/lib/design/design"
import { flowPalette, oklchToRgb } from "@/lib/design/scene"
import type { Prefs } from "@/lib/domain/types"

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
/** Relative luminance (WCAG), from sRGB 0..1. */
const luminance = ([r, g, b]: number[]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
const spread = (c: number[]) => Math.max(...c) - Math.min(...c)

describe("Liquid flow background", () => {
  it("converts OKLCH to screen colours, keeping them in gamut", () => {
    expect(oklchToRgb(1, 0, 0).map((v) => +v.toFixed(3))).toEqual([1, 1, 1])
    expect(oklchToRgb(0, 0, 0)).toEqual([0, 0, 0])
    // far too much chroma for any screen: the hue survives, the chroma gives way
    const [r, g, b] = oklchToRgb(0.6, 0.5, 30)
    for (const v of [r, g, b]) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of [r, g, b]) expect(v).toBeLessThanOrEqual(1)
    expect(r).toBeGreaterThan(b)
  })

  it("builds vibrant ribbons from the accent, deep at the bottom to bright at the top", () => {
    for (const dark of [true, false]) {
      const { ribbons, base } = flowPalette(285, 1, dark)
      expect(ribbons).toHaveLength(5)
      const lum = ribbons.map(luminance)
      for (let i = 1; i < lum.length; i++) expect(lum[i]).toBeGreaterThan(lum[i - 1])
      for (const c of ribbons) expect(spread(c)).toBeGreaterThan(0.12) // colourful, not grey
      expect(dark ? luminance(base) < lum[0] : luminance(base) > lum[4]).toBe(true)
    }
    expect(luminance(flowPalette(285, 1, false).ribbons[0])).toBeGreaterThan(luminance(flowPalette(285, 1, true).ribbons[0]))
  })

  it("keeps text readable: white text in dark mode, dark text in light mode", () => {
    const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
    // raw ribbons, before the glass tint and dimming add more contrast on top
    for (const hue of [0, 60, 120, 175, 220, 285, 330]) {
      for (const c of flowPalette(hue, 1.4, true).ribbons) expect(contrast(1, luminance(c))).toBeGreaterThan(3.5)
      for (const c of flowPalette(hue, 1.4, false).ribbons) expect(contrast(0.01, luminance(c))).toBeGreaterThan(4.5)
    }
  })

  it("turns grey for the mono look", () => {
    for (const c of flowPalette(285, 0, true).ribbons) expect(spread(c)).toBeLessThan(0.01)
  })

  it("is the default background, listed as an animated scene", () => {
    expect(DEFAULT_DESIGN.photo).toBe("flow")
    expect(PHOTOS.flow.scene).toBe("flow")
    expect(PHOTOS.flow.preview).toBeTruthy()
  })

  it("moves designs on the old default photo to it once, and then respects the choice", () => {
    const old = { design: { ...DEFAULT_DESIGN, photo: "mountains", photoDim: 0.5 } } as Partial<Prefs>
    const moved = migratePrefs(old)
    expect(moved.design.photo).toBe("flow")
    expect(moved.design.photoDim).toBe(DEFAULT_DESIGN.photoDim)
    expect(moved.designVersion).toBe(2)
    // choosing the photo again later is kept
    expect(migratePrefs({ ...old, designVersion: 2 }).design.photo).toBe("mountains")
    // other choices are never touched
    expect(migratePrefs({ design: { ...DEFAULT_DESIGN, photo: "none" } } as Partial<Prefs>).design.photo).toBe("none")
  })
})
