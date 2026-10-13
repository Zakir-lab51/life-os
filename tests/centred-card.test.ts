import { describe, expect, it } from "vitest"
import { GUTTER, centredLeft } from "@/features/planner/centred-card"

// a phone's timeline: 260 px wide, a 1 px border, the hour labels beyond it
const width = 260
const span = (left: number, w: number) => ({ fromLabels: left + GUTTER + 1, toRight: width - (left + w) })

describe("cards on the timeline", () => {
  it("centre under the block they belong to", () => {
    // a full-width block: the card's centre is the timeline's
    expect(centredLeft(0.5, width, 230, 1) + 230 / 2).toBe(width / 2)
    // the right of two side-by-side blocks
    expect(centredLeft(0.75, 600, 200, 1) + 100).toBe(450)
  })

  it("stay inside, from the hour labels to the right edge", () => {
    // the right-hand lane of a phone: a centred 230 px card would run off the right
    const left = centredLeft(0.75, width, 230, 1)
    expect(span(left, 230).toRight).toBe(4)
    // a card as wide as the room, from the labels' edge to the right
    const wide = centredLeft(0.5, width, 305, 1)
    expect(span(wide, 305).fromLabels).toBeGreaterThanOrEqual(4)
    expect(span(wide, 305).toRight).toBeGreaterThanOrEqual(4)
  })

  it("sit evenly when they nearly fill the room, not against one side", () => {
    const left = centredLeft(0.5, width, 305, 1)
    const { fromLabels, toRight } = span(left, 305)
    expect(Math.abs(fromLabels - toRight)).toBeLessThanOrEqual(1)
  })
})
