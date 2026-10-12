/** Where the phone tab bar's highlighter can sit: each tab's left edge, and the tabs' width. */
export interface Slots {
  lefts: number[]
  width: number
}

/** Keeps a dragged highlighter on the bar, between the first tab and the last. */
export function clampToSlots(x: number, { lefts }: Slots): number {
  return Math.min(lefts[lefts.length - 1], Math.max(lefts[0], x))
}

/** The tab a highlighter at `x` is most over, so letting go snaps to it. */
export function nearestSlot(x: number, { lefts }: Slots): number {
  let best = 0
  for (let i = 1; i < lefts.length; i++) if (Math.abs(lefts[i] - x) < Math.abs(lefts[best] - x)) best = i
  return best
}

/** Where the highlighter goes for a finger at `pointerX` (relative to the bar): centred under it. */
export function followPointer(pointerX: number, slots: Slots): number {
  return clampToSlots(pointerX - slots.width / 2, slots)
}
