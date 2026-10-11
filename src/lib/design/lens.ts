/*
  The shape of liquid glass at its edge, after kube.io's "Liquid Glass in the browser":
  the rim is a convex squircle, y = ⁴√(1 − (1 − x)⁴), rising from the outer edge (x = 0)
  to the flat top (x = 1) across the bezel. Looking straight down through it, each ray
  refracts at the curved surface (Snell's law, glass n = 1.5) and lands further in, so
  the backdrop seen through the rim is pulled inwards: strongly in a thin band right at
  the edge, fading to nothing where the glass turns flat. refraction.tsx (SVG maps) and
  canvas-refraction.tsx (the same formula in GLSL) both use this.
*/

export const GLASS_IOR = 1.5

/** Height of the rim at x across the bezel (0 = outer edge, 1 = flat top), 0..1. */
export const squircle = (x: number) => Math.pow(1 - Math.pow(1 - x, 4), 0.25)

/** Slope of `squircle` at x. */
export const squircleSlope = (x: number) => {
  const a = 1 - x
  return (a * a * a) / Math.pow(Math.max(1e-6, 1 - a * a * a * a), 0.75)
}

/**
 * How far inwards (px) the backdrop seen through the glass at `d` px in from its edge
 * comes from, for a rim `bezel` px wide and `thickness` px tall.
 */
export function lensShift(d: number, bezel: number, thickness: number, ior = GLASS_IOR): number {
  if (d <= 0 || d >= bezel || bezel <= 0) return 0
  const x = d / bezel
  const slope = (squircleSlope(x) * thickness) / bezel // dz/du, height per px inwards
  const z = thickness * squircle(x)
  // surface normal (pointing up and outwards), as (inward, up)
  const l = Math.hypot(slope, 1)
  const nu = -slope / l
  const nz = 1 / l
  // a ray straight down refracts into the glass (vector form of Snell's law)
  const eta = 1 / ior
  const k = 1 - eta * eta * (1 - nz * nz)
  const c = eta * nz - Math.sqrt(k)
  const tu = c * nu
  const tz = -eta + c * nz
  // ...and travels down to the backdrop at the glass's base
  return tu * (z / -tz)
}

/** The rim for a surface: width follows the corner radius, within what the size allows. */
export function bezelFor(width: number, height: number, radius: number) {
  const bezel = Math.max(4, Math.min(22, Math.max(10, radius * 0.9), width / 2 - 1, height / 2 - 1))
  return { bezel, thickness: bezel * 1.25 }
}

/** The largest inward shift anywhere on a rim (sampled finely enough to catch the peak). */
export function maxLensShift(bezel: number, thickness: number) {
  let max = 0
  for (let i = 1; i < 400; i++) max = Math.max(max, lensShift((i / 400) * bezel, bezel, thickness))
  return max
}
