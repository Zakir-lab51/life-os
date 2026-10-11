"use client"

import { useEffect, useRef, useState } from "react"
import { PHOTOS, type PhotoId } from "@/lib/design/design"
import { bezelFor, lensShift, maxLensShift } from "@/lib/design/lens"
import { QUALITY, useQuality } from "@/lib/design/quality"
import { CanvasRefraction } from "./canvas-refraction"

/*
  Liquid-glass refraction. Real glass bends what is behind it most at its edges,
  which CSS alone can't do, but Chromium browsers accept an SVG filter inside
  backdrop-filter. This finds every .glass surface, draws a displacement map for
  its size and corner radius (the rim's profile comes from lib/design/lens.ts: a
  convex squircle refracting like real glass, so the backdrop is pulled inwards in a
  thin, strong band at the edge), and points the surface's --refract variable at a
  filter that applies it. The glass utility in globals.css puts var(--refract) first
  in its backdrop-filter. Surfaces marked data-lens="dispersive" (the top bar) also
  split colour slightly at the rim, as real glass does: blue bends a little more than
  red. Surfaces of the same size share a map, and maps are rebuilt shortly after a
  resize rather than on every frame. Other browsers (Safari, Firefox) get
  canvas-refraction.tsx instead, which bends the background (photo or animated scene)
  itself as it draws it. The animated scene is drawn by that canvas in every browser.
  localStorage "life-os.refraction" = "svg" or "webgl" forces one or the other.

  Cost: re-filtering a bent surface is the most expensive thing on screen (measured: it
  halved the frame rate while scrolling a page of tiles). So tiles in the page bend only
  while the page is at rest: scrolling straightens them and the bend eases back in once
  it stops. The sidebar, top bar and dialogs don't move with the page and always bend.
  How much bends at all follows the rendering quality level (lib/design/quality.ts).
*/

const MAP_MAX = 512 // maps are drawn at most this big and stretched to fit
const DISPERSION = 0.09 // red bends this much less than green, blue this much more
const SCROLL_IDLE = 140 // ms without scroll events that counts as stopped
const BEND_IN = 450 // ms for tiles' bend to ease back in after scrolling

interface Lens {
  id: string
  w: number
  h: number
  href: string
  scale: number
  dispersive: boolean
  /** A tile in the page (bends only at rest), not the sidebar, top bar or a dialog. */
  tile: boolean
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

/**
 * The page background and liquid-glass refraction, by whichever method this browser
 * supports. `liquid` is the glass material; the animated scene is drawn either way.
 */
export function Backdrop({ liquid, photo, hue, saturation }: { liquid: boolean; photo: PhotoId; hue: number; saturation: number }) {
  const [mode] = useState(refractionMode)
  const quality = QUALITY[useQuality((s) => s.level)]
  const canvasBends = liquid && mode === "webgl"
  const canvas = !!PHOTOS[photo]?.scene || (canvasBends && photo !== "none")
  return (
    <>
      {canvas && <CanvasRefraction photo={photo} refract={canvasBends} hue={hue} saturation={saturation} quality={quality} />}
      {mode === "svg" && <SvgRefraction enabled={liquid && (quality.tilesBend || quality.chromeBends)} tilesBend={quality.tilesBend} chromeBends={quality.chromeBends} />}
    </>
  )
}

/**
 * Red/green encode which way and how far each point samples the backdrop (128 = straight
 * through). Returns the map and the feDisplacementMap scale that turns it back into px.
 */
function drawMap(w: number, h: number, radius: number): { href: string; scale: number } {
  const size = Math.min(1, MAP_MAX / Math.max(w, h))
  const W = Math.max(2, Math.round(w * size))
  const H = Math.max(2, Math.round(h * size))
  const canvas = document.createElement("canvas")
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext("2d")
  if (!ctx) return { href: "", scale: 0 }
  const r = Math.min(radius, w / 2, h / 2)
  const { bezel, thickness } = bezelFor(w, h, r)
  const max = maxLensShift(bezel, thickness) || 1
  // the profile, finely tabulated (sampled per pixel it's both slow and too coarse at the peak)
  const STEPS = 256
  const table = new Float32Array(STEPS + 1)
  for (let i = 0; i <= STEPS; i++) table[i] = lensShift((i / STEPS) * bezel, bezel, thickness) / max
  const shiftAt = (d: number) => {
    const t = (d / bezel) * STEPS
    const i = Math.floor(t)
    return i >= STEPS ? 0 : table[i] + (table[i + 1] - table[i]) * (t - i)
  }
  const img = ctx.createImageData(W, H)
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / size
      const y = (py + 0.5) / size
      // signed distance to the rounded rectangle's edge (negative inside)
      const dx = Math.abs(x - w / 2) - (w / 2 - r)
      const dy = Math.abs(y - h / 2) - (h / 2 - r)
      const d = -(Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - r)
      let vx = 0
      let vy = 0
      if (d > 0 && d < bezel) {
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
        const m = shiftAt(d)
        vx = -nx * m
        vy = -ny * m
      }
      const i = (py * W + px) * 4
      img.data[i] = Math.round(128 + vx * 127)
      img.data[i + 1] = Math.round(128 + vy * 127)
      img.data[i + 2] = 128
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  // a map value of 128 ± 127 is read as 0.5 ± 0.498, so this scale gives ±max px
  return { href: canvas.toDataURL(), scale: max / 0.498 }
}

const cornerRadius = (el: HTMLElement) => {
  const cs = getComputedStyle(el)
  return Math.round(Math.max(...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map((v) => parseFloat(v) || 0)))
}

/** Keeps one colour channel of the image. */
const CHANNEL = {
  r: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
  g: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
  b: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function SvgRefraction({ enabled, tilesBend, chromeBends }: { enabled: boolean; tilesBend: boolean; chromeBends: boolean }) {
  const [lenses, setLenses] = useState<Lens[]>([])
  // surfaces waiting to be pointed at their filter once it is in the document
  const pending = useRef(new Map<HTMLElement, string>())
  // what may bend right now, read by the long-lived effect below
  const allow = useRef({ tilesBend, chromeBends })
  const reapply = useRef<() => void>(() => {})

  useEffect(() => {
    if (!enabled) return
    const waiting = pending.current
    const cache = new Map<string, Lens>()
    const maps = new Map<string, { href: string; scale: number }>()
    const lensOf = new Map<HTMLElement, string>()
    const tiles = new WeakMap<HTMLElement, boolean>()
    const watched = new Set<HTMLElement>()
    const dirty = new Set<HTMLElement>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let idleTimer: ReturnType<typeof setTimeout> | undefined
    let scanQueued = false
    let scrolling = false
    let fade = 0

    const isTile = (el: HTMLElement) => {
      let tile = tiles.get(el)
      if (tile === undefined) {
        tile = !!el.closest("main")
        tiles.set(el, tile)
      }
      return tile
    }
    const mayBend = (el: HTMLElement) => (isTile(el) ? allow.current.tilesBend && !scrolling : allow.current.chromeBends)
    const apply = (el: HTMLElement, key: string) => {
      if (mayBend(el)) el.style.setProperty("--refract", `url(#lg-${key})`)
      else el.style.removeProperty("--refract")
    }
    const applyAll = () => {
      for (const [el, key] of lensOf) if (el.isConnected && !waiting.has(el)) apply(el, key)
    }

    /** Eases the tiles' bend back in, by growing their filters' displacement from nothing. */
    const bendIn = () => {
      cancelAnimationFrame(fade)
      const maps = [...document.querySelectorAll<SVGFEDisplacementMapElement>('filter[data-tile="true"] feDisplacementMap')]
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / BEND_IN)
        for (const m of maps) m.setAttribute("scale", String(Number(m.dataset.base) * easeOut(t)))
        if (t < 1 && !scrolling) fade = requestAnimationFrame(step)
      }
      fade = requestAnimationFrame(step)
    }

    const scrolled = () => {
      if (!allow.current.tilesBend) return
      if (!scrolling) {
        scrolling = true
        cancelAnimationFrame(fade)
        for (const [el, key] of lensOf) if (isTile(el)) apply(el, key)
      }
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        scrolling = false
        for (const [el, key] of lensOf) if (isTile(el)) apply(el, key)
        bendIn()
      }, SCROLL_IDLE)
    }

    const flush = () => {
      for (const el of dirty) {
        if (!el.isConnected) continue
        const w = el.offsetWidth
        const h = el.offsetHeight
        if (w < 8 || h < 8) continue
        const radius = cornerRadius(el)
        const dispersive = el.dataset.lens === "dispersive"
        const tile = isTile(el)
        const shape = `${w}x${h}r${radius}`
        // tiles get their own filters, so easing their bend in leaves the rest alone
        const key = `${tile ? "t" : "c"}${dispersive ? "d" : "n"}${shape}`
        if (!maps.has(shape)) maps.set(shape, drawMap(w, h, radius))
        if (!cache.has(key)) cache.set(key, { id: `lg-${key}`, w, h, ...maps.get(shape)!, dispersive, tile })
        lensOf.set(el, key)
        waiting.set(el, key)
      }
      dirty.clear()
      const used = new Set(lensOf.values())
      for (const key of cache.keys()) if (!used.has(key)) cache.delete(key)
      for (const shape of maps.keys()) if (![...used].some((k) => k.slice(2) === shape)) maps.delete(shape)
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
    document.addEventListener("scroll", scrolled, { capture: true, passive: true })
    reapply.current = applyAll
    return () => {
      ro.disconnect()
      mo.disconnect()
      clearTimeout(timer)
      clearTimeout(idleTimer)
      cancelAnimationFrame(fade)
      document.removeEventListener("scroll", scrolled, { capture: true })
      reapply.current = () => {}
      waiting.clear()
      for (const el of watched) el.style.removeProperty("--refract")
    }
  }, [enabled])

  // a new quality level changes what may bend
  useEffect(() => {
    allow.current = { tilesBend, chromeBends }
    reapply.current()
  }, [tilesBend, chromeBends])

  useEffect(() => {
    for (const [el, key] of pending.current) {
      const tile = !!el.closest("main")
      if (tile ? allow.current.tilesBend : allow.current.chromeBends) el.style.setProperty("--refract", `url(#lg-${key})`)
      else el.style.removeProperty("--refract")
    }
    pending.current.clear()
  }, [lenses])

  if (!enabled || !lenses.length) return null
  return (
    <svg aria-hidden width="0" height="0" style={{ position: "absolute" }}>
      {lenses.map((l) => (
        <filter key={l.id} id={l.id} data-tile={l.tile} x="0" y="0" width={l.w} height={l.h} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feImage href={l.href} x="0" y="0" width={l.w} height={l.h} preserveAspectRatio="none" result="map" />
          {l.dispersive ? (
            <>
              <feDisplacementMap in="SourceGraphic" in2="map" scale={l.scale * (1 - DISPERSION)} xChannelSelector="R" yChannelSelector="G" result="shiftR" />
              <feColorMatrix in="shiftR" type="matrix" values={CHANNEL.r} result="red" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale={l.scale} xChannelSelector="R" yChannelSelector="G" result="shiftG" />
              <feColorMatrix in="shiftG" type="matrix" values={CHANNEL.g} result="green" />
              <feDisplacementMap in="SourceGraphic" in2="map" scale={l.scale * (1 + DISPERSION)} xChannelSelector="R" yChannelSelector="G" result="shiftB" />
              <feColorMatrix in="shiftB" type="matrix" values={CHANNEL.b} result="blue" />
              {/* screen adds the separate channels back together */}
              <feBlend in="red" in2="green" mode="screen" result="rg" />
              <feBlend in="rg" in2="blue" mode="screen" />
            </>
          ) : (
            <feDisplacementMap in="SourceGraphic" in2="map" scale={l.scale} data-base={l.scale} xChannelSelector="R" yChannelSelector="G" />
          )}
        </filter>
      ))}
    </svg>
  )
}
