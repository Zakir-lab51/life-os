/*
  "Liquid flow", the animated background: glossy ribbons of colour drifting slowly
  across the screen. It's made for liquid glass: the ribbons have clean curved edges
  and lit rims, so you can see the glass bend them at its edges, and they move, so
  the bending moves too. The colours come from the accent hue (a run of neighbouring
  hues, deep at the bottom to bright at the top) in OKLCH, so every look stays
  balanced, and follow light and dark mode. canvas-refraction.tsx draws it with WebGL.
*/

export type RGB = [number, number, number]

const toSrgb = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055)

function oklchToLinear(L: number, C: number, h: number): RGB {
  const a = C * Math.cos((h * Math.PI) / 180)
  const b = C * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
}

/** An OKLCH colour as sRGB 0..1, lowering chroma until it fits the screen's gamut (so the hue holds). */
export function oklchToRgb(L: number, C: number, h: number): RGB {
  let c = C
  let rgb = oklchToLinear(L, c, h)
  while (c > 0 && rgb.some((v) => v < -0.0001 || v > 1.0001)) {
    c = Math.max(0, c - 0.004)
    rgb = oklchToLinear(L, c, h)
  }
  return rgb.map((v) => Math.min(1, Math.max(0, toSrgb(Math.min(1, Math.max(0, v)))))) as RGB
}

/**
 * Lightness, chroma and hue offset of each ribbon, bottom to top. Dark mode keeps to
 * deep jewel tones (nothing above mid-lightness) so white text on the glass stays
 * easy to read; light mode runs to pale pastels under dark text.
 */
const RIBBONS = {
  dark: [
    [0.3, 0.14, -40],
    [0.38, 0.19, 0],
    [0.46, 0.22, 40],
    [0.54, 0.21, 80],
    [0.6, 0.18, 120],
  ],
  light: [
    [0.66, 0.15, -40],
    [0.74, 0.17, 0],
    [0.8, 0.15, 45],
    [0.87, 0.12, 95],
    [0.93, 0.08, 150],
  ],
} as const

export interface ScenePalette {
  base: RGB
  ribbons: RGB[]
}

/** The flow's colours for an accent hue and colour intensity (0 = greyscale). */
export function flowPalette(hue: number, saturation: number, dark: boolean): ScenePalette {
  const k = Math.min(1.2, Math.max(0, saturation))
  return {
    base: dark ? oklchToRgb(0.13, 0.045 * k, hue) : oklchToRgb(0.96, 0.02 * k, hue),
    ribbons: RIBBONS[dark ? "dark" : "light"].map(([L, C, dh]) => oklchToRgb(L, C * k, (hue + dh + 360) % 360)),
  }
}

/**
 * GLSL for the flow: `vec3 flow(vec2 p)` gives the colour at viewport point p (CSS px).
 * Needs uniforms time (s), view (viewport size), base, pal[5] and light (1 in light mode).
 */
export const FLOW_GLSL = `
uniform float time;
uniform vec2 view;
uniform vec3 base;
uniform vec3 pal[5];
uniform float light;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 flow(vec2 p) {
  float s = max(view.x, view.y);
  vec2 uv = (p - 0.5 * view) / s * 2.0;
  float a = -0.5; // ribbons run on a gentle diagonal
  uv = vec2(cos(a) * uv.x - sin(a) * uv.y, sin(a) * uv.x + cos(a) * uv.y);
  float t = time;
  float px = 2.0 / s; // one CSS px
  vec3 col = base;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    // each ribbon covers everything above its wavy lower edge
    float edge = -0.92 + fi * 0.36
      + 0.14 * sin(uv.x * 1.6 + t * 0.12 + fi * 1.9)
      + 0.06 * sin(uv.x * 3.7 - t * 0.19 + fi * 2.6)
      + 0.022 * sin(uv.x * 8.1 + t * 0.27 + fi * 0.8);
    float d = uv.y - edge;
    float inside = smoothstep(-px, px, d);
    // the ribbon's soft shadow on whatever lies beneath its edge
    col *= 1.0 - (1.0 - inside) * exp(min(d, 0.0) * 22.0) * (0.42 - 0.22 * light);
    // silk: brightest near its edge and deepening away from it, with a sheen running along
    vec3 c = pal[i];
    float sheen = 0.5 + 0.5 * sin(uv.x * 2.2 - t * 0.25 + fi * 1.3);
    c *= mix(1.12, 0.82, smoothstep(0.0, 0.42, d));
    c += vec3(0.07) * sheen * (1.0 - 0.5 * light);
    // a thin lit rim along the edge
    c += vec3(0.32) * exp(-max(d, 0.0) * 160.0) * inside;
    col = mix(col, c, inside);
  }
  // dither, so the long gradients don't band
  col += (hash(p + fract(t)) - 0.5) / 255.0;
  return clamp(col, 0.0, 1.0);
}`
