import { describe, expect, it } from "vitest"
import { centredLeft } from "@/features/planner/centred-card"

// a phone's timeline from 74 to 334 px (hour labels from 18), on a 375 px screen
const area = [22, 330] as const
const screen = [12, 363] as const
const gaps = (left: number, w: number, [from, to]: readonly [number, number]) => ({ left: left - from, right: to - (left + w) })

describe("cards on the timeline", () => {
  it("centre under the block they belong to", () => {
    // a full-width block: the card's centre is the block's
    expect(centredLeft(204, 230, area, screen) + 230 / 2).toBe(204)
  })

  it("stay inside the timeline when they fit there", () => {
    // the right-hand lane: a centred 230 px card would run past the right edge
    const left = centredLeft(269, 230, area, screen)
    expect(gaps(left, 230, area).right).toBe(0)
  })

  it("sit evenly when they nearly fill the room, not against one side", () => {
    const { left, right } = gaps(centredLeft(204, 300, area, screen), 300, area)
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1)
  })

  it("spread across the screen when wider than the timeline, clear of its edges", () => {
    const left = centredLeft(204, 340, area, screen)
    const { left: l, right: r } = gaps(left, 340, screen)
    expect(l).toBeGreaterThanOrEqual(0)
    expect(r).toBeGreaterThanOrEqual(0)
    expect(Math.abs(l - r)).toBeLessThanOrEqual(1)
  })
})
