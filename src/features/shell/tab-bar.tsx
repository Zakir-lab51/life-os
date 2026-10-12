"use client"

import { Menu } from "lucide-react"
import { animate, motion, useMotionValue, useReducedMotionConfig, useSpring, useTransform, useVelocity } from "motion/react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState, type PointerEvent } from "react"
import { useUI } from "@/lib/stores/ui"
import { cn } from "@/lib/utils"
import { NAV, navForPath, type NavKey } from "./nav"
import { NavIcon } from "./nav-icon"
import { followPointer, nearestSlot, type Slots } from "./tab-geometry"

/*
  Phones: a floating glass tab bar at the bottom, within thumb reach, instead of the
  desktop sidebar squeezed into a drawer. The four most-used places, plus More, which
  opens the full drawer; each with the same flat app icon as in the sidebar. While you're
  in a section that isn't one of the four, More wears that section's icon and name.
  Hidden from 768 px up, where the top bar's drawer and the sidebar take over.

  The highlighter is liquid: it springs to the tab you pick, stretching along its way and
  settling back into shape. Press anywhere on the bar and slide, and it lifts and follows
  your finger like a lens, lighting the tab beneath; let go and it snaps to that tab and
  opens it (More opens the drawer). A tap is still a tap: dragging starts after 8 px. It
  moves by transform only, driven by motion values (no re-render per frame).
*/
const MORE_TINT: [string, string] = ["oklch(0.62 0.03 270)", "oklch(0.4 0.04 275)"]
const TABS: NavKey[] = ["overview", "today", "tasks", "habits"]
const MORE = TABS.length
const DRAG_START = 8 // px of sideways movement before a press becomes a drag
const GLIDE = { type: "spring", stiffness: 520, damping: 34, mass: 0.9 } as const

export function TabBar() {
  const pathname = usePathname()
  const router = useRouter()
  const active = navForPath(pathname)
  const setMobileNav = useUI((s) => s.setMobileNav)
  const elsewhere = !TABS.includes(active.key)
  const tabs = NAV.filter((n) => TABS.includes(n.key))
  const current = elsewhere ? MORE : TABS.indexOf(active.key)
  const reduced = useReducedMotionConfig()

  const bar = useRef<HTMLElement>(null)
  const cells = useRef<(HTMLElement | null)[]>([])
  const [slots, setSlots] = useState<Slots | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const drag = useRef<{ id: number; startX: number; moved: boolean } | null>(null)
  const swallowClick = useRef(false)

  // the highlighter: where it is, and how it stretches with its speed and lifts while held
  const x = useMotionValue(0)
  const speed = useVelocity(x)
  const stretch = useSpring(useTransform(speed, [-2400, 0, 2400], [0.32, 0, 0.32], { clamp: true }), { stiffness: 420, damping: 32 })
  const lift = useMotionValue(1)
  const scaleX = useTransform(() => (1 + stretch.get()) * lift.get())
  const scaleY = useTransform(() => (1 - stretch.get() * 0.35) * lift.get())

  // measure the tabs (and again whenever the bar changes size)
  useEffect(() => {
    const el = bar.current
    if (!el) return
    const measure = () => {
      const list = cells.current.filter((c): c is HTMLElement => !!c)
      if (list.length) setSlots({ lefts: list.map((c) => c.offsetLeft), width: list[0].offsetWidth })
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // glide to the current tab; jump there on first measure, after a resize, or with reduced motion
  const placed = useRef(false)
  useEffect(() => {
    if (!slots || drag.current?.moved) return
    const target = slots.lefts[current]
    if (!placed.current || reduced) {
      x.jump(target)
      placed.current = true
      return
    }
    const run = animate(x, target, GLIDE)
    return () => run.stop()
  }, [current, slots, reduced, x])

  const relX = (e: PointerEvent) => e.clientX - (bar.current?.getBoundingClientRect().left ?? 0)

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !slots) return
    drag.current = { id: e.pointerId, startX: e.clientX, moved: false }
  }
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId || !slots) return
    if (!d.moved) {
      if (Math.abs(e.clientX - d.startX) < DRAG_START) return
      d.moved = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // the pointer is already gone (released, or taken by the system): follow it uncaptured
      }
      x.stop()
      animate(lift, 1.12, reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 26 })
    }
    const to = followPointer(relX(e), slots)
    x.set(to)
    const over = nearestSlot(to, slots)
    if (over !== dragOver) setDragOver(over)
  }
  const settle = (to: number) => {
    if (!slots) return
    animate(lift, 1, reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 24 })
    if (reduced) x.jump(slots.lefts[to])
    else animate(x, slots.lefts[to], GLIDE)
  }
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId || !d.moved || !slots) return
    // the click that follows a drag isn't a tap
    swallowClick.current = true
    setTimeout(() => (swallowClick.current = false), 0)
    const to = nearestSlot(x.get(), slots)
    setDragOver(null)
    if (to === MORE) {
      // More opens the drawer; the highlighter goes back to where you are
      settle(current)
      setMobileNav(true, "right")
    } else {
      settle(to)
      if (to !== current) router.push(tabs[to].href)
    }
  }
  const onPointerCancel = () => {
    if (!drag.current?.moved) {
      drag.current = null
      return
    }
    drag.current = null
    setDragOver(null)
    settle(current)
  }

  const lit = (i: number) => (dragOver === null ? i === current : i === dragOver)
  const cell = "pressable relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[1.4rem] text-[10px] font-semibold outline-none transition-colors duration-200 [--press-scale:0.92] focus-visible:ring-2 focus-visible:ring-ring"
  return (
    <nav
      ref={bar}
      aria-label="Tabs"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClickCapture={(e) => {
        if (!swallowClick.current) return
        e.preventDefault()
        e.stopPropagation()
      }}
      className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex h-16 touch-none items-stretch gap-1 rounded-[1.75rem] p-1.5 select-none md:hidden"
    >
      {slots && <motion.span aria-hidden className="glass-pill pointer-events-none absolute top-1.5 bottom-1.5 left-0 rounded-[1.4rem]" style={{ x, scaleX, scaleY, width: slots.width }} />}
      {tabs.map((item, i) => (
        <Link
          key={item.key}
          ref={(el) => {
            cells.current[i] = el
          }}
          href={item.href}
          draggable={false}
          aria-current={i === current ? "page" : undefined}
          className={cn(cell, lit(i) ? "text-pill-foreground" : "text-foreground/70")}
        >
          <NavIcon icon={item.icon} tint={item.tint} active={lit(i)} className="[--icon-size:1.6rem]" />
          <span className="relative max-w-full truncate">{item.label}</span>
        </Link>
      ))}
      <button
        ref={(el) => {
          cells.current[MORE] = el
        }}
        type="button"
        onClick={() => setMobileNav(true, "right")}
        aria-label="More: all sections"
        className={cn(cell, lit(MORE) ? "text-pill-foreground" : "text-foreground/70")}
      >
        <NavIcon icon={elsewhere ? active.icon : Menu} tint={elsewhere ? active.tint : MORE_TINT} active={lit(MORE)} className="[--icon-size:1.6rem]" />
        <span className="relative max-w-full truncate">{elsewhere ? active.label : "More"}</span>
      </button>
    </nav>
  )
}
