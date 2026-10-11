"use client"

import Lenis from "lenis"
import { useEffect } from "react"

/*
  Wheel and trackpad scrolling glide instead of stepping (Lenis): each notch of a
  mouse wheel eases the page towards its target rather than jumping, which is what
  makes scrolling on Windows feel fluid. Touch scrolling is left to the device (its
  own momentum is already the smoothest there is). Scrollable areas inside the page
  (the sidebar, dialogs, menus, the roadmap) scroll natively. While a dialog or menu
  holds the page still (Radix marks <body> with data-scroll-locked), so does Lenis.
  Off when motion is reduced, by the system setting or in Settings.
*/
export function SmoothScroll({ reduced }: { reduced: boolean }) {
  useEffect(() => {
    if (reduced || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.085,
      allowNestedScroll: true,
      stopInertiaOnNavigate: true,
    })
    const body = document.body
    const sync = () => (body.hasAttribute("data-scroll-locked") ? lenis.stop() : lenis.start())
    const mo = new MutationObserver(sync)
    mo.observe(body, { attributes: true, attributeFilter: ["data-scroll-locked"] })
    sync()
    return () => {
      mo.disconnect()
      lenis.destroy()
    }
  }, [reduced])
  return null
}
