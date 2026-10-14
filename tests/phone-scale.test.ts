import { describe, expect, it } from "vitest"
import { MIN_LAYOUT_WIDTH, PHONE_SCALE, phoneLayoutWidth } from "@/lib/phone-scale"

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
})
