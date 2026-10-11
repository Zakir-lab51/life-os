"use client"

import { useEffect, useRef, useState } from "react"
import type { PhotoId } from "@/lib/design/design"
import { CanvasRefraction } from "./canvas-refraction"

/*
  Liquid-glass refraction. Real glass bends what is behind it most at its edges,
  which CSS alone can't do, but Chromium browsers accept an SVG filter inside
  backdrop-filter. This finds every .glass surface, draws a displacement map for
  its size and corner radius (the outer BAND px pull the backdrop inwards,
  strongest at the rim, so the edge looks thick and magnified), and points the
  surface's --refract variable at a filter that applies it. The glass utility in
  globals.css puts var(--refract) first in its backdrop-filter. Surfaces of the same
  size share a map, and maps are rebuilt shortly after a resize rather than on every
  frame. Other browsers (Safari, Firefox) get canvas-refraction.tsx instead, which bends
  the background photo itself. localStorage "life-os.refraction" = "svg" or "webgl"
  forces one or the other, for testing.
*/

const BAND = 16 // px of edge that bends
const STRENGTH = 26 // feDisplacementMap scale: about 13px of shift right at the rim
const MAP_MAX = 320 // maps are drawn at most this big and stretched to fit

interface Lens {
  id: string
  w: number
  h: number
  href: string
}

const supported = () => typeof navigator !== "undefined" && /\bChrome\//.test(navigator.userAgent)

function refractionMode(): "svg" | "webgl" {
  try {
    const forced = localStorage.getItem("life-os.refraction")
    if (forced === "svg" || forced === "webgl") return forced
  } catch {
    // storage blocked: fall back to detection
  }
  return supported() ? "svg" : "webgl"
}

/** Liquid-glass refraction, by whichever method this browser supports. */
export function Refraction({ enabled, photo }: { enabled: boolean; photo: PhotoId }) {
  const [mode] = useState(refractionMode)
  if (mode === "webgl") return enabled && photo !== "none" ? <CanvasRefraction photo={photo} /> : null
  return <SvgRefraction enabled={enabled} />
}

/** Red/green encode how far (and which way) each point samples the backdrop; 128 = straight through. */
function drawMap(w: number, h: number, radius: number): string {
  const scale = Math.min(1, MAP_MAX / Math.max(w, h))
  const W = Math.max(2, Math.round(w * scale))
  const H = Math.max(2, Math.round(h * scale))
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")
  if (!ctx) return ""
  const img = ctx.createImageData(W, H)
  const r = Math.min(radius, w / 2, h / 2)
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / scale
      const y = (py + 0.5) / scale
      // signed distance to the rounded rectangle's edge (negative inside)
      const dx = Math.abs(x - w / 2) - (w / 2 - r)
      const dy = Math.abs(y - h / 2) - (h / 2 - r)
      const inside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r
      const d = -inside
      let vx = 0
      let vy = 0
      if (d >= -1 && d < BAND) {
        // outward normal of the nearest edge
        let nx = 0
        let ny = 0
        if (dx > 0 && dy > 0) {
          const l = Math.hypot(dx, dy) || 1
          nx = dx / l
          ny = dy / l
        } else if (dx > dy) nx = 1
        else ny = 1
        nx *= Math.sign(x - w / 2) || 1
        ny *= Math.sign(y - h / 2) || 1
        const t = 1 - Math.max(d, 0) / BAND
        const m = t * t
        vx = -nx * m
        vy = -ny * m
      }
      const i = (py * W + px) * 4
      img.data[i] = 128 + vx * 127
      img.data[i + 1] = 128 + vy * 127
      img.data[i + 2] = 128
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL()
}

const cornerRadius = (el: HTMLElement) => {
  const cs = getComputedStyle(el)
  return Math.round(Math.max(...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map((v) => parseFloat(v) || 0)))
}

function SvgRefraction({ enabled }: { enabled: boolean }) {
  const [lenses, setLenses] = useState<Lens[]>([])
  // surfaces waiting to be pointed at their filter once it is in the document
  const pending = useRef(new Map<HTMLElement, string>())

  useEffect(() => {
    if (!enabled) return
    const waiting = pending.current
    const cache = new Map<string, Lens>()
    const lensOf = new Map<HTMLElement, string>()
    const watched = new Set<HTMLElement>()
    const dirty = new Set<HTMLElement>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let scanQueued = false

    const flush = () => {
      for (const el of dirty) {
        if (!el.isConnected) continue
        const w = el.offsetWidth
        const h = el.offsetHeight
        if (w < 8 || h < 8) continue
        const key = `${w}x${h}r${cornerRadius(el)}`
        if (!cache.has(key)) cache.set(key, { id: `lg-${key}`, w, h, href: drawMap(w, h, cornerRadius(el)) })
        lensOf.set(el, key)
        waiting.set(el, key)
      }
      dirty.clear()
      const used = new Set(lensOf.values())
      for (const key of cache.keys()) if (!used.has(key)) cache.delete(key)
      setLenses([...cache.values()])
    }
    const resized = (el: HTMLElement) => {
      dirty.add(el)
      clearTimeout(timer)
      timer = setTimeout(flush, 120)
    }
    const ro = new ResizeObserver((entries) => entries.forEach((e) => resized(e.target as HTMLElement)))
    const scan = () => {
      scanQueued = false
      document.querySelectorAll<HTMLElement>(".glass").forEach((el) => {
        if (watched.has(el)) return
        watched.add(el)
        ro.observe(el)
      })
      for (const el of watched) {
        if (el.isConnected) continue
        watched.delete(el)
        lensOf.delete(el)
        ro.unobserve(el)
      }
    }
    const mo = new MutationObserver(() => {
      if (scanQueued) return
      scanQueued = true
      requestAnimationFrame(scan)
    })
    scan()
    mo.observe(document.body, { childList: true, subtree: true })
    return () => {
      ro.disconnect()
      mo.disconnect()
      clearTimeout(timer)
      waiting.clear()
      for (const el of watched) el.style.removeProperty("--refract")
    }
  }, [enabled])

  useEffect(() => {
    for (const [el, key] of pending.current) el.style.setProperty("--refract", `url(#lg-${key})`)
    pending.current.clear()
  }, [lenses])

  if (!enabled || !lenses.length) return null
  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
      {lenses.map((l) => (
        <filter key={l.id} id={l.id} x="0" y="0" width={l.w} height={l.h} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feImage href={l.href} x="0" y="0" width={l.w} height={l.h} preserveAspectRatio="none" result="map" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale={STRENGTH} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      ))}
    </svg>
  )
}
