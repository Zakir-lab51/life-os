/*
  LIFE OS design settings. Each value maps onto one CSS variable from the
  DESIGN CONTROLS block in src/app/globals.css, so the whole interface
  restyles live without touching component code.

  To add or change a preset, edit PRESETS below; to add a background photo,
  put it in public/backgrounds and list it in PHOTOS (which also lists the animated
  backgrounds drawn in code, see lib/design/scene.ts). To change the default
  for everyone, change DEFAULT_DESIGN and the matching defaults in globals.css
  (tests/design.test.ts checks that the two agree).
*/

export const FONTS = {
  jakarta: { label: "Plus Jakarta Sans", cssVar: "var(--font-jakarta)" },
  inter: { label: "Inter", cssVar: "var(--font-inter)" },
  outfit: { label: "Outfit", cssVar: "var(--font-outfit)" },
  grotesk: { label: "Space Grotesk", cssVar: "var(--font-grotesk)" },
} as const
export type FontId = keyof typeof FONTS

/** Where the app is served from: "" locally, "/life-os" on GitHub Pages (set in next.config.ts). */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
/** A file in public/, addressed so it works under the base path too. */
export const asset = (path: string) => `${BASE_PATH}${path}`

/**
 * Backgrounds. Photos are served from public/backgrounds (a full-size and a phone-size
 * copy); a `scene` is drawn live in code instead (lib/design/scene.ts), with `preview`
 * standing in for it in the picker.
 */
export const PHOTOS = {
  flow: {
    label: "Liquid flow",
    src: null,
    small: null,
    credit: null,
    scene: "flow",
    preview: "linear-gradient(150deg, oklch(0.3 0.14 245) 0%, oklch(0.38 0.19 285) 28%, oklch(0.46 0.22 325) 52%, oklch(0.54 0.21 5) 76%, oklch(0.6 0.18 45) 100%)",
  },
  mountains: { label: "Misty mountains", src: "/backgrounds/mountains.webp", small: "/backgrounds/mountains-sm.webp", credit: "Daniel Sessler on Unsplash", scene: null, preview: null },
  none: { label: "None", src: null, small: null, credit: null, scene: null, preview: null },
} satisfies Record<string, { label: string; src: string | null; small: string | null; credit: string | null; scene: "flow" | null; preview: string | null }>
export type PhotoId = keyof typeof PHOTOS

/** How glass surfaces are finished (fixed to liquid, see FIXED_FINISH). */
export const MATERIALS = {
  frosted: { label: "Frosted", description: "Matte glass, no gloss" },
  liquid: { label: "Liquid glass", description: "Glossy, lit along the edges" },
} as const
export type MaterialId = keyof typeof MATERIALS

/** The part of a design that presets set. */
export interface Look {
  /** Preset this look started from (for the "customised" badge). */
  preset: string
  /** Accent hue, 0–360. */
  hue: number
  /** Accent saturation multiplier: 0 = greyscale, 1 = default, up to 1.4. */
  saturation: number
  /** Base corner radius in rem: 0 = sharp, 1 = default, up to 1.6. */
  radius: number
  /** Background glow strength: 0 = off, 1 = default, up to 1.6. */
  glow: number
  /** Interface size: 0.9 = compact, 1 = default, 1.1 = large. */
  scale: number
  font: FontId
}

/** A look plus the glass and background photo, which presets leave alone. */
export interface Design extends Look {
  material: MaterialId
  /** Glass transparency: 0 = solid, 1 = almost clear. */
  glass: number
  /** Glass blur in px, 0–40. */
  glassBlur: number
  photo: PhotoId
  /** How much the page colour veils the photo: 0 = clear, 0.9 = barely visible. */
  photoDim: number
  /** Photo blur in px, 0–30. */
  photoBlur: number
}

export const PRESETS: Record<string, { label: string; description: string; look: Look }> = {
  violet: {
    label: "Violet glass",
    description: "The signature look: lavender accents on clear glass",
    look: { preset: "violet", hue: 303, saturation: 1, radius: 1, glow: 1, scale: 1, font: "jakarta" },
  },
  ocean: {
    label: "Ocean",
    description: "Cool blue, crisp and calm",
    look: { preset: "ocean", hue: 235, saturation: 1, radius: 1, glow: 0.9, scale: 1, font: "inter" },
  },
  aurora: {
    label: "Aurora",
    description: "Teal-green with a stronger glow",
    look: { preset: "aurora", hue: 175, saturation: 0.95, radius: 1.15, glow: 1.4, scale: 1, font: "outfit" },
  },
  ember: {
    label: "Ember",
    description: "Warm amber, softer corners",
    look: { preset: "ember", hue: 55, saturation: 1.1, radius: 1.25, glow: 0.8, scale: 1, font: "outfit" },
  },
  rose: {
    label: "Rose",
    description: "Pink-red accent, round and friendly",
    look: { preset: "rose", hue: 355, saturation: 1, radius: 1.35, glow: 1, scale: 1, font: "jakarta" },
  },
  mono: {
    label: "Mono",
    description: "Greyscale and sharp: pure focus",
    look: { preset: "mono", hue: 286, saturation: 0, radius: 0.45, glow: 0, scale: 1, font: "grotesk" },
  },
}

/**
 * The glass and background finish are fixed for everyone: clear liquid glass with a 1 px
 * blur, over a background that is neither dimmed nor blurred. They stay in the Design type
 * so older saved designs, backups and design codes still load; whatever they hold, these
 * values win (designToVars and migratePrefs both apply them).
 */
export const FIXED_FINISH = { material: "liquid", glass: 1, glassBlur: 1, photoDim: 0, photoBlur: 0 } as const satisfies Partial<Design>

export const DEFAULT_DESIGN: Design = { ...PRESETS.violet.look, ...FIXED_FINISH, photo: "flow" }

export const DESIGN_LIMITS = {
  hue: [0, 360],
  saturation: [0, 1.4],
  radius: [0, 1.6],
  glass: [0, 1],
  glassBlur: [0, 40],
  glow: [0, 1.6],
  scale: [0.9, 1.1],
  photoDim: [0, 0.9],
  photoBlur: [0, 30],
} as const

const clamp = (n: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo))

/**
 * The CSS variables for a design, with the fixed finish applied. Liquid glass turns on
 * the sheen (gloss and edge light, see the glass utility in globals.css) and richer colour.
 */
export function designToVars(design: Design): Record<string, string> {
  const d = { ...design, ...FIXED_FINISH }
  const glass = clamp(d.glass, DESIGN_LIMITS.glass)
  const liquid = d.material === "liquid"
  const photo = PHOTOS[d.photo] ?? PHOTOS.none
  const url = (src: string | null) => (src ? `url("${asset(src)}")` : "none")
  return {
    "--brand-h": String(Math.round(clamp(d.hue, DESIGN_LIMITS.hue))),
    "--brand-c": clamp(d.saturation, DESIGN_LIMITS.saturation).toFixed(2),
    "--radius": `${clamp(d.radius, DESIGN_LIMITS.radius).toFixed(3)}rem`,
    "--glass-blur": `${Math.round(clamp(d.glassBlur, DESIGN_LIMITS.glassBlur))}px`,
    "--glass-alpha": `${Math.round(100 - glass * 90)}%`,
    "--glass-sheen": liquid ? "1" : "0",
    "--glass-saturate": liquid ? "200%" : "140%",
    "--glow": clamp(d.glow, DESIGN_LIMITS.glow).toFixed(2),
    "--ui-scale": clamp(d.scale, DESIGN_LIMITS.scale).toFixed(3),
    "--font-ui": (FONTS[d.font] ?? FONTS.jakarta).cssVar,
    "--bg-image": url(photo.src),
    "--bg-image-sm": url(photo.small),
    "--bg-dim": clamp(d.photoDim, DESIGN_LIMITS.photoDim).toFixed(2),
    "--bg-blur": `${Math.round(clamp(d.photoBlur, DESIGN_LIMITS.photoBlur))}px`,
  }
}

/** localStorage key read by the tiny pre-paint script in the root layout. */
export const DESIGN_CACHE_KEY = "life-os.design-vars"

/** Applies a design to the page and caches it so the next load paints with it immediately. */
export function applyDesign(d: Design) {
  const vars = designToVars(d)
  const root = document.documentElement
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
  try {
    localStorage.setItem(DESIGN_CACHE_KEY, JSON.stringify(vars))
  } catch {
    // storage blocked: the design still applies for this session
  }
}

/** Same look (accent, shape, font…), ignoring the photo and which preset it started from. */
export function sameLook(a: Look, b: Look) {
  return (Object.keys(PRESETS.violet.look) as (keyof Look)[]).filter((k) => k !== "preset").every((k) => a[k] === b[k])
}

/** Identical designs, photo and preset included. */
export function sameDesign(a: Design, b: Design) {
  return (Object.keys(DEFAULT_DESIGN) as (keyof Design)[]).every((k) => a[k] === b[k])
}

/**
 * Inline script for <head>: paints the cached design (or, on a first visit, the default
 * one) before React loads, so there is no flash and asset paths respect the base path.
 */
export const PREPAINT_SCRIPT = `try{var v=JSON.parse(localStorage.getItem(${JSON.stringify(DESIGN_CACHE_KEY)})||"null")||${JSON.stringify(designToVars(DEFAULT_DESIGN))};for(var k in v)document.documentElement.style.setProperty(k,v[k])}catch(e){}`
