import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { migratePrefs } from "@/lib/db/defaults"
import { DEFAULT_DESIGN, FIXED_FINISH, PHOTOS, PRESETS, designToVars } from "@/lib/design/design"
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

  // an older saved design, backup or pasted design code with its own glass and background finish
  const custom = { ...DEFAULT_DESIGN, ...PRESETS.ember.look, material: "frosted", glass: 0.2, glassBlur: 30, photoDim: 0.7, photoBlur: 12 } as const

  it("paints every design with the fixed finish: clear liquid glass, 1 px blur, background untouched", () => {
    const vars = designToVars(custom)
    expect(vars["--glass-alpha"]).toBe("10%")
    expect(vars["--glass-blur"]).toBe("1px")
    expect(vars["--glass-sheen"]).toBe("1")
    expect(vars["--bg-dim"]).toBe("0.00")
    expect(vars["--bg-blur"]).toBe("0px")
    // the look itself still applies
    expect(vars["--brand-h"]).toBe(String(PRESETS.ember.look.hue))
  })

  it("brings saved designs to the fixed finish and keeps their look, photo and font", () => {
    const { design } = migratePrefs({ design: { ...custom, photo: "mountains" }, designVersion: 2 })
    expect(design).toMatchObject(FIXED_FINISH)
    expect(design).toMatchObject({ ...PRESETS.ember.look, photo: "mountains" })
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
