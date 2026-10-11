"use client"

import { useEffect } from "react"

/*
  Moves a soft light across whichever glass surface the pointer is over, like
  visionOS: the glass utility in globals.css draws a radial highlight at
  (--mx, --my) that fades in on hover. Pointer devices only; one listener for the
  whole app, updated at most once a frame.
*/
export function GlassPointer() {
  useEffect(() => {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return
    let frame = 0
    let last: PointerEvent | null = null
    const update = () => {
      frame = 0
      const target = last?.target
      const glass = target instanceof Element ? target.closest<HTMLElement>(".glass") : null
      if (!glass || !last) return
      const r = glass.getBoundingClientRect()
      glass.style.setProperty("--mx", `${Math.round(last.clientX - r.left)}px`)
      glass.style.setProperty("--my", `${Math.round(last.clientY - r.top)}px`)
    }
    const move = (e: PointerEvent) => {
      last = e
      if (!frame) frame = requestAnimationFrame(update)
    }
    window.addEventListener("pointermove", move, { passive: true })
    return () => {
      window.removeEventListener("pointermove", move)
      cancelAnimationFrame(frame)
    }
  }, [])
  return null
}
