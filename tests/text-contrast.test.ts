import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { DEFAULT_DESIGN, PRESETS } from "@/lib/design/design"
import { FLOW_SHADE, flowPalette, oklchToRgb, type RGB } from "@/lib/design/scene"

/*
  Secondary text has to stay readable over the vivid Liquid flow, in both themes and every
  colour preset. This models what the browser paints at the default look, from the real
  tokens in globals.css and the flow's own shading: each ribbon at its darkest (deep
  inside, under the next ribbon's shadow) and brightest (at its edge, in the sheen),
  veiled by the page colour (--bg-dim); then for text on a tile, the glass (its
  brightness filter and its surface colour); for text straight on the background, the
  on-backdrop halo. Blur is left out: it only averages, so it can't be worse than the
  extremes on their own. Checked against screenshot measurements (docs/quality-report.md).
*/

const css = readFileSync(join(__dirname, "../src/app/globals.css"), "utf8")
/** The top-level `selector { … }` block that defines the theme's colours. */
const block = (selector: string) => {
  const blocks = css.split(`\n${selector} {`).slice(1).map((b) => b.slice(0, b.indexOf("\n}")))
  return blocks.find((b) => b.includes("--muted-foreground:"))!
}
const THEMES = { light: block(":root"), dark: block(".dark") }
const GLASS_ALPHA = 28 // --glass-alpha, %

/** An OKLCH token's colour and alpha, with --tint and --brand-h filled in for a look. */
function token(theme: string, name: string, look: { hue: number; saturation: number }): { rgb: RGB; alpha: number } {
  const m = new RegExp(`--${name}: oklch\\(([^;]+)\\);`).exec(theme)
  if (!m) throw new Error(`--${name} not found`)
  const tint = 0.012 * Math.min(look.saturation, 1)
  const [body, alphaPart] = m[1].split(" / ")
  const parts = body.match(/calc\([^()]*(?:\([^()]*\)[^()]*)*\)|\S+/g)!
  const value = (s: string) => {
    if (s === "var(--brand-h)") return look.hue
    if (s === "var(--tint)") return tint
    const k = /var\(--tint\) \* ([\d.]+)/.exec(s)
    if (k) return tint * Number(k[1])
    return Number(s)
  }
  let alpha = 1
  if (alphaPart === "var(--glass-alpha)") alpha = GLASS_ALPHA / 100
  else if (alphaPart) {
    const a = /calc\(var\(--glass-alpha\) - (\d+)%\)/.exec(alphaPart)
    alpha = a ? (GLASS_ALPHA - Number(a[1])) / 100 : alphaPart.endsWith("%") ? Number(alphaPart.slice(0, -1)) / 100 : Number(alphaPart)
  }
  return { rgb: oklchToRgb(value(parts[0]), value(parts[1]), value(parts[2])), alpha }
}
const number = (theme: string, name: string) => Number(new RegExp(`--${name}: (-?[\\d.]+);`).exec(theme)![1])
const percent = (theme: string, name: string) => Number(new RegExp(`--${name}: color-mix\\(in oklab, var\\(--background\\) (\\d+)%`).exec(theme)![1]) / 100

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const luminance = ([r, g, b]: RGB) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
const mix = (under: RGB, over: RGB, alpha: number) => under.map((c, i) => c * (1 - alpha) + over[i] * alpha) as RGB
const scale = (c: RGB, k: number, add = 0) => c.map((v) => Math.min(1, Math.max(0, v * k + add))) as RGB

/** The page behind text: every ribbon at its extremes, veiled, then through glass or under the halo. */
function backdrops(dark: boolean, look: { hue: number; saturation: number }) {
  const theme = dark ? THEMES.dark : THEMES.light
  const page = token(theme, "background", look).rgb
  const ribbons = flowPalette(look.hue, look.saturation, dark).ribbons
  const shaded = ribbons.flatMap((c) => [
    scale(c, FLOW_SHADE.deep * (1 - (dark ? FLOW_SHADE.shadowDark : FLOW_SHADE.shadowLight))),
    scale(c, FLOW_SHADE.deep),
    scale(c, FLOW_SHADE.edge, FLOW_SHADE.sheen * (dark ? 1 : 0.5)),
  ])
  const veiled = shaded.map((c) => mix(c, page, DEFAULT_DESIGN.photoDim))
  const surface = token(theme, "surface", look)
  const brighten = 1 + number(theme, "sheen-brighten")
  const glass = veiled.map((c) => mix(scale(c, brighten), surface.rgb, surface.alpha))
  // the halo's tight 2 px shadow, counted at half strength (its edge, where it's weakest)
  const halo = veiled.map((c) => mix(c, page, percent(theme, "backdrop-halo") / 2))
  return { glass, halo }
}

const LOOKS = Object.entries(PRESETS).map(([name, p]) => ({ name, hue: p.look.hue, saturation: p.look.saturation }))

describe("secondary text over the Liquid flow", () => {
  for (const dark of [false, true]) {
    const mode = dark ? "dark" : "light"
    const theme = dark ? THEMES.dark : THEMES.light

    it(`is readable on tiles in ${mode} mode, every preset (AA, 4.5:1)`, () => {
      for (const look of LOOKS) {
        const muted = token(theme, "muted-foreground", look).rgb
        const worst = Math.min(...backdrops(dark, look).glass.map((c) => contrast(muted, c)))
        expect(worst, look.name).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`is readable straight on the background in ${mode} mode, every preset (AA, 4.5:1)`, () => {
      for (const look of LOOKS) {
        const muted = token(theme, "muted-backdrop", look).rgb
        const worst = Math.min(...backdrops(dark, look).halo.map((c) => contrast(muted, c)))
        expect(worst, look.name).toBeGreaterThanOrEqual(4.5)
      }
    })
  }

  it("keeps the selected item's label readable on its highlighter, over the brightest glass", () => {
    for (const look of LOOKS) {
      for (const dark of [false, true]) {
        const theme = dark ? THEMES.dark : THEMES.light
        const pill = token(theme, "pill", look)
        const label = token(theme, "pill-foreground", look).rgb
        // light glass can be near white; dark glass at its brightest is the model's extreme
        const glass = dark ? backdrops(true, look).glass : [[1, 1, 1] as RGB]
        const worst = Math.min(...glass.map((g) => contrast(label, mix(g, pill.rgb, pill.alpha))))
        expect(worst, `${look.name} ${dark ? "dark" : "light"}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it("stays secondary: quieter than the main text", () => {
    const look = LOOKS[0]
    for (const theme of Object.values(THEMES)) {
      const fg = token(theme, "foreground", look).rgb
      const page = token(theme, "background", look).rgb
      expect(contrast(fg, page)).toBeGreaterThan(contrast(token(theme, "muted-foreground", look).rgb, page))
      expect(contrast(fg, page)).toBeGreaterThan(contrast(token(theme, "muted-backdrop", look).rgb, page))
    }
  })
})
