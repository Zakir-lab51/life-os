/**
 * How far menus, popovers, dropdowns and tooltips keep from the screen's edges when they
 * have to move to fit: the page's own 16 px side margin, so they line up with the cards
 * (Radix's default is 0, flush with the glass), and on a phone they stay clear of the tab
 * bar along the bottom, opening upwards instead of over it.
 */
export function popupEdge() {
  const phone = typeof window !== "undefined" && window.matchMedia("(max-width: 767.98px)").matches
  return { top: 12, right: 16, bottom: phone ? 92 : 16, left: 16 }
}
