/*
  Switches theme with a circular reveal: the new theme spreads from `from` (usually the
  button that was pressed) using the View Transitions API. Without that API, or when
  motion is reduced, it simply switches. The classes are set by hand inside the
  transition so the browser can snapshot the new look; next-themes then stores the choice.
*/
export function switchTheme(next: "light" | "dark" | "system", setTheme: (t: string) => void, from?: { x: number; y: number }) {
  const root = document.documentElement
  const resolved = next === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : next
  const apply = () => {
    root.classList.remove("light", "dark")
    root.classList.add(resolved)
    root.style.colorScheme = resolved
    setTheme(next)
  }
  const reduce = root.dataset.motion === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches
  if (reduce || !from || !("startViewTransition" in document) || root.classList.contains(resolved)) return apply()
  const radius = Math.hypot(Math.max(from.x, innerWidth - from.x), Math.max(from.y, innerHeight - from.y))
  const transition = document.startViewTransition(apply)
  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${from.x}px ${from.y}px)`, `circle(${radius}px at ${from.x}px ${from.y}px)`] },
        { duration: 700, easing: "cubic-bezier(0.32, 0.72, 0, 1)", pseudoElement: "::view-transition-new(root)" },
      )
    })
    // the reveal can be cut short (say, by a resize); the theme still switches, just without it
    .catch(() => {})
  transition.finished.catch(() => {})
  transition.updateCallbackDone.catch(() => {})
}

/** The centre of an element, for `from`. */
export const centreOf = (el: Element) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}
