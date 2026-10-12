"use client"

import type { LucideIcon } from "lucide-react"
import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

/*
  A flat app-style icon: a vivid two-tone tile with a crisp diagonal facet of light, and a
  bold white symbol casting a short, solid shadow in the tile's deep colour. Selected, it
  lifts a little and glows in its own colour; pointed at, a band of light sweeps across
  it; pressed, it dips (put `icon-host` on the element that owns the hover and press, a
  nav row say). The styling is the nav-icon block in globals.css.
*/
export function NavIcon({ icon: I, tint, active, muted, className }: { icon: LucideIcon; tint: [string, string]; active?: boolean; muted?: boolean; className?: string }) {
  return (
    <span aria-hidden data-active={active || undefined} data-muted={muted || undefined} className={cn("nav-icon", className)} style={{ "--ni-from": tint[0], "--ni-to": tint[1] } as CSSProperties}>
      <I className="ni-glyph" strokeWidth={2.4} />
    </span>
  )
}
