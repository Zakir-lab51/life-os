"use client"

import { useEffect } from "react"

/*
  Moves a soft light across whichever glass surface the pointer is over, like
  visionOS: the glass utility in globals.css draws a radial highlight at
  (--mx, --my) that fades in on hover. One listener for the
  whole app, updated at most once a frame. On touch screens the glass lights up
  where a finger rests instead (data-lit), and fades as it lifts; a touch that turns
  into a scroll within a moment doesn't light anything, so scrolling stays calm.
*/
const TOUCH_DELAY = 70 // ms a finger must rest before the glass lights

const place = (glass: HTMLElement, x: number, y: number) => {
  const r = glass.getBoundingClientRect()
  glass.style.setProperty("--mx", `${Math.round(x - r.left)}px`)
  glass.style.setProperty("--my", `${Math.round(y - r.top)}px`)
}

export function GlassPointer() {
  useEffect(() => {
    const fine = matchMedia("(hover: hover) and (pointer: fine)").matches
    let frame = 0
    let last: PointerEvent | null = null
    const update = () => {
      frame = 0
      const target = last?.target
      const glass = target instanceof Element ? target.closest<HTMLElement>(".glass") : null
      if (glass && last) place(glass, last.clientX, last.clientY)
    }
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return
      last = e
      if (!frame) frame = requestAnimationFrame(update)
    }

    let lit: HTMLElement | null = null
    let pending: (() => void) | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let fade: ReturnType<typeof setTimeout> | undefined
    const release = () => {
      clearTimeout(timer)
      pending = null
      lit?.removeAttribute("data-lit")
      lit = null
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return
      clearTimeout(fade)
      release()
      const glass = e.target instanceof Element ? e.target.closest<HTMLElement>(".glass") : null
      if (!glass) return
      const { clientX, clientY } = e
      pending = () => {
        pending = null
        place(glass, clientX, clientY)
        glass.setAttribute("data-lit", "")
        lit = glass
      }
      timer = setTimeout(() => pending?.(), TOUCH_DELAY)
    }
    // a quick tap still glows: light on release, then let it fade
    const up = () => {
      clearTimeout(timer)
      pending?.()
      fade = setTimeout(release, 90)
    }

    if (fine) window.addEventListener("pointermove", move, { passive: true })
    window.addEventListener("pointerdown", down, { passive: true })
    window.addEventListener("pointerup", up, { passive: true })
    window.addEventListener("pointercancel", release, { passive: true })
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerdown", down)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", release)
      cancelAnimationFrame(frame)
      clearTimeout(fade)
      release()
    }
  }, [])
  return null
}
