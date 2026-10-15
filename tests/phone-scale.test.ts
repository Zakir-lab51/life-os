import { describe, expect, it } from "vitest"
import { MIN_LAYOUT_WIDTH, PHONE_SCALE, PHONE_SCALE_SCRIPT, phoneLayoutWidth } from "@/lib/phone-scale"

describe("phone scale", () => {
  it("lays a phone out a step narrower, so the browser draws it larger", () => {
    expect(phoneLayoutWidth(375)).toBe(333)
    expect(phoneLayoutWidth(390)).toBe(347)
    expect(phoneLayoutWidth(430)).toBe(382)
    expect(375 / phoneLayoutWidth(375)).toBeCloseTo(PHONE_SCALE, 2)
  })

  it("never narrower than the pages are built for", () => {
    expect(phoneLayoutWidth(360)).toBe(MIN_LAYOUT_WIDTH)
    expect(phoneLayoutWidth(340)).toBe(MIN_LAYOUT_WIDTH)
    // a screen already that narrow stays 1:1
    expect(phoneLayoutWidth(320)).toBe(320)
  })

  it("the head script scales a phone, and leaves a screen that reports no size at 1:1", () => {
    const viewport = (width: number, height: number) => {
      const meta = { content: "" }
      const doc = { createElement: () => meta, head: { appendChild: () => undefined } }
      const media = () => ({ matches: height >= width, addEventListener: () => undefined })
      new Function("document", "screen", "matchMedia", PHONE_SCALE_SCRIPT)(doc, { width, height }, media)
      return meta.content
    }
    expect(viewport(390, 844)).toBe("width=347, initial-scale=1.1239, viewport-fit=cover")
    expect(viewport(1180, 820)).toBe("width=device-width, initial-scale=1, viewport-fit=cover")
    // a hidden or embedded browser can report 0 × 0; it used to get "width=0, initial-scale=NaN"
    expect(viewport(0, 0)).toBe("width=device-width, initial-scale=1, viewport-fit=cover")
  })
})
