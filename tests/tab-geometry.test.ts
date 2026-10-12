import { describe, expect, it } from "vitest"
import { clampToSlots, followPointer, nearestSlot } from "@/features/shell/tab-geometry"

// five 77 px tabs, 4 px apart, starting 6 px in (the phone tab bar at 448 px wide)
const slots = { lefts: [6, 87, 168, 249, 330], width: 77 }

describe("tab bar highlighter", () => {
  it("centres under the finger while dragged", () => {
    expect(followPointer(206, slots)).toBeCloseTo(167.5)
  })

  it("stays on the bar, between the first tab and the last", () => {
    expect(followPointer(0, slots)).toBe(6)
    expect(followPointer(1000, slots)).toBe(330)
    expect(clampToSlots(-50, slots)).toBe(6)
  })

  it("snaps to the tab it is most over when let go", () => {
    expect(nearestSlot(6, slots)).toBe(0)
    expect(nearestSlot(120, slots)).toBe(1) // nearer 87 than 168
    expect(nearestSlot(130, slots)).toBe(2) // past halfway
    expect(nearestSlot(330, slots)).toBe(4)
  })
})
