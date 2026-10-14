import { useLayoutEffect, type RefObject } from "react"

/** The hour labels' column beside the timeline (`w-14`), which a card may reach into. */
export const GUTTER = 56
/** A card's least distance from the timeline's edges. */
const MARGIN = 4
/** ...and from the screen's, when it's wider than the timeline (a phone). */
const SCREEN_EDGE = 12

/**
 * Where a card `width` wide goes (its left edge, in the same coordinates as the rest) to
 * centre on `centre`: inside `area` (the timeline, with its hour labels) when it fits there,
 * otherwise inside `screen`, like any popup. A card that nearly fills its room sits evenly
 * in it rather than against one side.
 */
export function centredLeft(centre: number, width: number, area: readonly [number, number], screen: readonly [number, number]) {
  const [from, to] = width <= area[1] - area[0] ? area : screen
  const min = from
  const max = to - width
  if (max - min < 16) return (min + max) / 2
  return Math.max(min, Math.min(max, centre - width / 2))
}

/**
 * Centres a card floating on the timeline (a block's toolbar, the new-block card) under what
 * it belongs to, then nudges it back inside if it would run past the hour labels on the left
 * or the timeline's right edge; one wider than the timeline (on a phone) spreads across the
 * screen instead, keeping clear of its edges.
 * `at` is that centre as a fraction of the timeline's width (the middle of the block's lane).
 * It sets `left` directly, before paint, and again whenever the card or timeline resizes.
 */
export function useCentredCard(ref: RefObject<HTMLElement | null>, at: number) {
  useLayoutEffect(() => {
    const card = ref.current
    const host = card?.offsetParent
    if (!card || !(host instanceof HTMLElement)) return
    const place = () => {
      // `left` counts from inside the timeline's left border; the hour labels sit beyond it
      const inner = host.getBoundingClientRect().left + host.clientLeft
      const width = host.clientWidth
      const area = [inner - GUTTER - host.clientLeft + MARGIN, inner + width - MARGIN] as const
      const screen = [SCREEN_EDGE, document.documentElement.clientWidth - SCREEN_EDGE] as const
      card.style.left = `${Math.round(centredLeft(inner + at * width, card.offsetWidth, area, screen) - inner)}px`
    }
    place()
    const watch = new ResizeObserver(place)
    watch.observe(host)
    watch.observe(card)
    return () => watch.disconnect()
  }, [ref, at])
}
