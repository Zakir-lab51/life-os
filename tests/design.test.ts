import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { migratePrefs } from "@/lib/db/defaults"
import { DEFAULT_DESIGN, PHOTOS, PRESETS, designToVars } from "@/lib/design/design"
import type { Prefs } from "@/lib/domain/types"
import { designSchema } from "@/lib/validation/schemas"

describe("design system", () => {
  it("keeps the stylesheet defaults in step with the default look", () => {
    const css = readFileSync("src/app/globals.css", "utf8")
    const block = css.slice(css.indexOf("DESIGN CONTROLS"))
    const controls = block.slice(block.indexOf(":root {"), block.indexOf("}", block.indexOf(":root {")))
    for (const [name, value] of Object.entries(designToVars(DEFAULT_DESIGN))) {
      const declared = controls.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim()
      expect(declared, name).toBeDefined()
      if (Number.isNaN(parseFloat(value))) expect(declared, name).toBe(value)
      else expect(parseFloat(declared!), name).toBeCloseTo(parseFloat(value), 2)
    }
  })

  it("ships presets that are valid and named after their key", () => {
    for (const [id, p] of Object.entries(PRESETS)) {
      expect(designSchema.safeParse({ ...DEFAULT_DESIGN, ...p.look }).success, id).toBe(true)
      expect(p.look.preset).toBe(id)
    }
  })

  it("ships every photo it lists", () => {
    for (const [id, photo] of Object.entries(PHOTOS)) {
      for (const src of [photo.src, photo.small]) if (src) expect(existsSync(`public${src}`), `${id}: ${src}`).toBe(true)
    }
  })

  it("fills in photo settings missing from a design saved before photos existed", () => {
    const looksOnly: Partial<Prefs["design"]> = { ...DEFAULT_DESIGN, ...PRESETS.ocean.look }
    delete looksOnly.material
    delete looksOnly.glassBlur
    delete looksOnly.photo
    delete looksOnly.photoDim
    delete looksOnly.photoBlur
    expect(migratePrefs({ design: looksOnly as Prefs["design"] }).design).toEqual({ ...DEFAULT_DESIGN, ...PRESETS.ocean.look })
  })

  it("controls glass transparency and blur separately", () => {
    const clear = designToVars({ ...DEFAULT_DESIGN, glass: 1, glassBlur: 0 })
    const solid = designToVars({ ...DEFAULT_DESIGN, glass: 0, glassBlur: 0 })
    expect(parseFloat(clear["--glass-alpha"])).toBeLessThan(parseFloat(solid["--glass-alpha"]))
    expect([clear["--glass-blur"], solid["--glass-blur"]]).toEqual(["0px", "0px"])
    expect(designToVars({ ...DEFAULT_DESIGN, glassBlur: 30 })["--glass-alpha"]).toBe(designToVars(DEFAULT_DESIGN)["--glass-alpha"])
  })

  it("lets the material switch only the gloss, not the transparency", () => {
    const liquid = designToVars({ ...DEFAULT_DESIGN, material: "liquid" })
    const frosted = designToVars({ ...DEFAULT_DESIGN, material: "frosted" })
    expect([liquid["--glass-sheen"], frosted["--glass-sheen"]]).toEqual(["1", "0"])
    expect(liquid["--glass-alpha"]).toBe(frosted["--glass-alpha"])
  })

  it("keeps the glass when a look is picked", () => {
    for (const p of Object.values(PRESETS)) expect(p.look).not.toHaveProperty("glass")
  })

  it("clamps out-of-range values instead of breaking the page", () => {
    const vars = designToVars({ ...DEFAULT_DESIGN, hue: 999, radius: -1, scale: Number.NaN })
    expect(vars["--brand-h"]).toBe("360")
    expect(vars["--radius"]).toBe("0.000rem")
    expect(vars["--ui-scale"]).toBe("0.900")
  })

  it("gives older saved prefs the default design and keeps a saved one", () => {
    const old: Partial<Prefs> = migratePrefs({})
    delete old.design
    expect(migratePrefs(old).design).toEqual(DEFAULT_DESIGN)
    const mono = { ...DEFAULT_DESIGN, ...PRESETS.mono.look, photo: "none" as const }
    expect(migratePrefs({ design: mono }).design).toEqual(mono)
  })
})
