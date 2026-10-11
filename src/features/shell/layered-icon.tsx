"use client"

import type { LucideIcon } from "lucide-react"
import { useCallback, useRef, type CSSProperties, type PointerEvent, type Ref } from "react"
import { cn } from "@/lib/utils"

/*
  A 3D layered icon, like iOS 26's: a vivid colour tile at the back, a glass plate
  floating above it and a white symbol on top, stacked in depth. The layers spread
  apart when the icon is pointed at or selected and press together when pressed (put
  `icon-host` on the element that owns the hover and press, a nav tile say); the whole
  stack tilts towards the pointer (useTilt). The styling is the layered-icon block in
  globals.css.
*/
export function LayeredIcon({ icon: I, tint, active, muted, className, iconRef }: { icon: LucideIcon; tint: [string, string]; active?: boolean; muted?: boolean; className?: string; iconRef?: Ref<HTMLSpanElement> }) {
  return (
    <span ref={iconRef} aria-hidden data-active={active || undefined} data-muted={muted || undefined} className={cn("layered-icon", className)} style={{ "--li-from": tint[0], "--li-to": tint[1] } as CSSProperties}>
      <span className="li-stack">
        <span className="li-back" />
        <span className="li-plate" />
        <I className="li-glyph" strokeWidth={2.25} />
      </span>
    </span>
  )
}

const MAX_TILT = 16 // degrees

/**
 * Tilts a LayeredIcon towards the pointer while it moves over `onPointerMove`'s element
 * (a whole nav tile, say), and back when it leaves. Mouse and pen only: on touch the
 * icon just presses in.
 */
export function useTilt() {
  const iconRef = useRef<HTMLSpanElement>(null)
  const onPointerMove = useCallback((e: PointerEvent<HTMLElement>) => {
    const icon = iconRef.current
    if (!icon || e.pointerType === "touch") return
    const r = icon.getBoundingClientRect()
    const box = e.currentTarget.getBoundingClientRect()
    // how far the pointer is from the icon, as a share of the tile's size (clamped to ±1),
    // so a short, wide tile doesn't make the icon flick up and down
    const x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (box.width * 0.75)))
    const y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / box.height))
    icon.style.setProperty("--ry", `${(x * MAX_TILT).toFixed(1)}deg`)
    icon.style.setProperty("--rx", `${(-y * MAX_TILT).toFixed(1)}deg`)
  }, [])
  const onPointerLeave = useCallback(() => {
    iconRef.current?.style.removeProperty("--rx")
    iconRef.current?.style.removeProperty("--ry")
  }, [])
  return { iconRef, onPointerMove, onPointerLeave }
}
