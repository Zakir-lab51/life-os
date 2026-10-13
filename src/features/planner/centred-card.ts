import { useLayoutEffect, type RefObject } from "react"

/** The hour labels' column beside the timeline (`w-14`), which a card may reach into. */
export const GUTTER = 56
/** A card's least distance from the timeline's edges. */
const MARGIN = 4

/**
 * Where a card `cardWidth` wide goes (its `left`, counted from inside the timeline's left
 * border) to centre on `at` of a timeline `width` wide, kept between the hour labels' outer
 * edge and the timeline's right edge. A card that nearly fills that room sits evenly in it
 * rather than against one side.
 */
export function centredLeft(at: number, width: number, cardWidth: number, border = 0) {
  const min = -(GUTTER + border) + MARGIN
  const max = width - MARGIN - cardWidth
  if (max - min < 16) return (min + max) / 2
  return Math.max(min, Math.min(max, at * width - cardWidth / 2))
}

/**
 * Centres a card floating on the timeline (a block's toolbar, the new-block card) under what
 * it belongs to, then nudges it back inside if it would run past the hour labels on the left
 * or the timeline's right edge, so it sits evenly instead of hanging off one side.
 * `at` is that centre as a fraction of the timeline's width (the middle of the block's lane).
 * It sets `left` directly, before paint, and again whenever the card or timeline resizes.
 */
export function useCentredCard(ref: RefObject<HTMLElement | null>, at: number) {
  useLayoutEffect(() => {
    const card = ref.current
    const host = card?.offsetParent
    if (!card || !(host instanceof HTMLElement)) return
    const place = () => {
      card.style.left = `${Math.round(centredLeft(at, host.clientWidth, card.offsetWidth, host.clientLeft))}px`
    }
    place()
    const watch = new ResizeObserver(place)
    watch.observe(host)
    watch.observe(card)
    return () => watch.disconnect()
  }, [ref, at])
}
