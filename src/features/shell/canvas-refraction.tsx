"use client"

import { useEffect, useRef } from "react"
import { PHOTOS, asset, type PhotoId } from "@/lib/design/design"
import { GLASS_IOR, bezelFor } from "@/lib/design/lens"
import { FLOW_GLSL, flowPalette } from "@/lib/design/scene"

/*
  The page background, drawn with WebGL: either the animated "Liquid flow" scene
  (lib/design/scene.ts) or, in browsers without SVG filters in backdrop-filter
  (Safari, so every browser on iPad and iPhone, and Firefox), the background photo.

  With `refract` on, near every .glass surface's rounded edge the background is
  sampled from further in, so the glass above it (which still blurs as usual) shows
  the same thick, bending rim as the Chromium version. The rim's profile is the one
  in lib/design/lens.ts (a convex squircle refracting like real glass), written out
  again in GLSL below. Only the background bends: other page content behind a glass
  bar doesn't. In Chromium, `refract` is off and the glass bends the canvas itself.

  Scrolling: the canvas is redrawn from JavaScript, which can't keep pace with the
  browser's own scrolling, so a bend drawn under a moving tile would trail behind it.
  Instead, tiles in the page (and in the sidebar's list, which can scroll too) let go
  of their bend while you scroll (in about a tenth of a second) and it flows back once
  scrolling stops; the top bar, the logo and dialogs don't move, so they keep bending
  throughout. A photo is redrawn only
  while glass moves; the flow animates continuously at up to 60 frames a second,
  holding still when motion is reduced and pausing with the tab.
*/

const MOST_SURFACES = 64 // glass surfaces handled at once, if the GPU allows (see surfaceLimit)
const FADE_OUT = 120 // ms for tiles to let go of their bend when scrolling starts
const FADE_IN = 480 // ms for it to flow back once scrolling stops
const SCROLL_IDLE = 140 // ms without scroll events that counts as stopped
const FRAME_MS = 1000 / 61 // the flow's frame budget (60 fps, even on 120 Hz screens)
const STILL_TIME = 37 // s: where the flow rests when motion is reduced

const VERT = "attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }"

const PHOTO_SCENE = `
uniform sampler2D photo;
uniform vec4 fit;        // photo placement inside the canvas: offset xy, size zw (CSS px)
vec3 scene(vec2 local) { return texture2D(photo, clamp((local - fit.xy) / fit.zw, 0.0, 1.0)).rgb; }`

const FLOW_SCENE = `${FLOW_GLSL}
vec3 scene(vec2 local) { return flow(local + origin); }`

const fragment = (sceneCode: string, max: number) => `
precision highp float;
uniform float heightPx;  // canvas height in device px
uniform float dpr;
uniform vec2 origin;     // canvas top-left in the viewport, CSS px
uniform int count;
uniform vec4 rects[${max}];  // x, y, width, height in the viewport (CSS px)
uniform vec4 shape[${max}];  // corner radius, strength 0-1, bezel width, thickness
${sceneCode}

// convex squircle rim and its slope (see lib/design/lens.ts)
float squircle(float x) { return pow(max(1e-6, 1.0 - pow(1.0 - x, 4.0)), 0.25); }
float slopeAt(float x) { float a = 1.0 - x; return a * a * a / pow(max(1e-6, 1.0 - a * a * a * a), 0.75); }

// px inwards that a straight-down view through the rim, d px from the edge, lands
float lensShift(float d, float bezel, float thick) {
  float x = d / bezel;
  float s = slopeAt(x) * thick / bezel;
  float z = thick * squircle(x);
  float l = sqrt(s * s + 1.0);
  float nu = -s / l;
  float nz = 1.0 / l;
  float eta = 1.0 / ${GLASS_IOR.toFixed(2)};
  float c = eta * nz - sqrt(1.0 - eta * eta * (1.0 - nz * nz));
  return c * nu * (z / -(-eta + c * nz));
}

void main() {
  vec2 local = vec2(gl_FragCoord.x, heightPx - gl_FragCoord.y) / dpr;
  vec2 p = local + origin;
  vec2 shift = vec2(0.0);
  for (int i = 0; i < ${max}; i++) {
    if (i >= count) break;
    vec4 r = rects[i];
    vec4 sh = shape[i];
    vec2 hs = r.zw * 0.5;
    vec2 c = r.xy + hs;
    float rad = min(sh.x, min(hs.x, hs.y));
    vec2 q = abs(p - c) - (hs - rad);
    float d = -(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad);
    if (d > 0.0 && d < sh.z) {
      vec2 n = (q.x > 0.0 && q.y > 0.0) ? normalize(q) : (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
      n *= vec2(p.x < c.x ? -1.0 : 1.0, p.y < c.y ? -1.0 : 1.0);
      shift = -n * lensShift(d, sh.z, sh.w) * sh.y;
    }
  }
  gl_FragColor = vec4(scene(local + shift), 1.0);
}`

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  console.warn("LIFE OS background is off: the shader didn't compile.", gl.getShaderInfoLog(shader))
  return null
}

const cornerRadius = (el: HTMLElement) => {
  const cs = getComputedStyle(el)
  return Math.max(...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map((v) => parseFloat(v) || 0))
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

/** How many glass surfaces fit in this GPU's fragment uniforms (two vec4s each, plus ~20 for the rest). */
const surfaceLimit = (gl: WebGLRenderingContext) => {
  const vectors = Number(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)) || 64
  return Math.max(8, Math.min(MOST_SURFACES, Math.floor((vectors - 20) / 2)))
}

export function CanvasRefraction({ photo, refract, hue, saturation }: { photo: PhotoId; refract: boolean; hue: number; saturation: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // the flow's colours follow the accent without restarting the renderer
  const colour = useRef({ hue, saturation, changed: true })
  const redraw = useRef<() => void>(() => {})
  useEffect(() => {
    colour.current = { hue, saturation, changed: true }
    redraw.current()
  }, [hue, saturation])

  useEffect(() => {
    const canvas = canvasRef.current
    const files = PHOTOS[photo]
    const flow = files.scene === "flow"
    if (!canvas || (!flow && !files.src)) return
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false })
    if (!gl) return
    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const MAX = surfaceLimit(gl)
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragment(flow ? FLOW_SCENE : PHOTO_SCENE, MAX))
    const program = gl.createProgram()
    if (!vs || !fs || !program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("LIFE OS background is off: the shader didn't link.", gl.getProgramInfoLog(program))
      return
    }
    gl.useProgram(program)

    // one triangle that covers the whole canvas
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const a = gl.getAttribLocation(program, "a")
    gl.enableVertexAttribArray(a)
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0)
    const u = (name: string) => gl.getUniformLocation(program, name)
    const U = {
      heightPx: u("heightPx"),
      dpr: u("dpr"),
      origin: u("origin"),
      fit: u("fit"),
      count: u("count"),
      rects: u("rects"),
      shape: u("shape"),
      time: u("time"),
      view: u("view"),
      base: u("base"),
      pal: u("pal"),
      light: u("light"),
    }

    colour.current.changed = true // a new program needs its colours
    const root = document.documentElement
    const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)")
    const img = new Image()
    let texture: WebGLTexture | null = null
    let ready = false
    let disposed = false
    const rects = new Float32Array(MAX * 4)
    const shape = new Float32Array(MAX * 4)
    const radii = new WeakMap<HTMLElement, number>()
    const inPage = new WeakMap<HTMLElement, boolean>()
    let last = ""
    let force = true
    let raf = 0
    let still = 0
    let lastFrame = 0
    let dark = root.classList.contains("dark")

    // how much tiles in the page bend right now (0 while scrolling), easing towards `tileTarget`
    let tileBend = 1
    let tileTarget = 1
    let fadeFrom = 1
    let fadeStart = 0
    let scrolling = false
    let idleTimer: ReturnType<typeof setTimeout> | undefined

    const animating = () => flow && root.dataset.motion !== "reduced" && !reducedQuery.matches

    const collect = () => {
      let n = 0
      const parts: number[] = []
      if (!refract) return { n, signature: "" }
      for (const el of document.querySelectorAll<HTMLElement>(".glass")) {
        if (n >= MAX) break
        let tile = inPage.get(el)
        if (tile === undefined) {
          tile = !!el.closest("main, [data-scroll-tiles]")
          inPage.set(el, tile)
        }
        // a tile that has let go of its bend isn't drawn, so its movement needs no redraw
        if (tile && tileBend === 0) continue
        const r = el.getBoundingClientRect()
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue
        if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) continue
        let radius = radii.get(el)
        if (radius === undefined) {
          radius = cornerRadius(el)
          radii.set(el, radius)
        }
        const strength = Math.min(1, Number(getComputedStyle(el).opacity) || 0) * (tile ? tileBend : 1)
        const { bezel, thickness } = bezelFor(r.width, r.height, Math.min(radius, r.width / 2, r.height / 2))
        rects.set([r.left, r.top, r.width, r.height], n * 4)
        shape.set([radius, strength, bezel, thickness], n * 4)
        parts.push(Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), Math.round(strength * 100))
        n++
      }
      return { n, signature: parts.join(",") }
    }

    const setColours = () => {
      const { hue, saturation } = colour.current
      const p = flowPalette(hue, saturation, dark)
      gl.uniform3f(U.base, ...p.base)
      gl.uniform3fv(U.pal, p.ribbons.flat())
      gl.uniform1f(U.light, dark ? 0 : 1)
      colour.current.changed = false
    }

    const draw = (n: number, now: number) => {
      const box = canvas.getBoundingClientRect()
      // the flow is smooth, so it's drawn at CSS-pixel resolution; photos a little sharper
      const dpr = Math.min(devicePixelRatio || 1, flow ? 1 : 1.5)
      const w = Math.max(1, Math.round(box.width * dpr))
      const h = Math.max(1, Math.round(box.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
      gl.uniform1f(U.heightPx, h)
      gl.uniform1f(U.dpr, dpr)
      gl.uniform2f(U.origin, box.left, box.top)
      if (flow) {
        if (colour.current.changed) setColours()
        gl.uniform1f(U.time, animating() ? STILL_TIME + now / 1000 : STILL_TIME)
        gl.uniform2f(U.view, innerWidth, innerHeight)
      } else {
        // like background-size: cover, centred
        const s = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight)
        const fw = img.naturalWidth * s
        const fh = img.naturalHeight * s
        gl.uniform4f(U.fit, (box.width - fw) / 2, (box.height - fh) / 2, fw, fh)
      }
      gl.uniform1i(U.count, n)
      gl.uniform4fv(U.rects, rects)
      gl.uniform4fv(U.shape, shape)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const tick = (now: number) => {
      raf = 0
      if (!ready || disposed) return
      const moving = animating()
      if (moving && now - lastFrame < FRAME_MS) {
        raf = requestAnimationFrame(tick)
        return
      }
      if (tileBend !== tileTarget) {
        const duration = tileTarget > fadeFrom ? FADE_IN : FADE_OUT
        // a frame's timestamp can be a moment earlier than the fade's start
        const t = Math.min(1, Math.max(0, (now - fadeStart) / duration))
        tileBend = t >= 1 ? tileTarget : fadeFrom + (tileTarget - fadeFrom) * easeOut(t)
        force = true
      }
      const { n, signature } = collect()
      if (moving || force || signature !== last || colour.current.changed) {
        draw(n, now)
        lastFrame = now
        last = signature
        force = false
        still = 0
      } else still++
      if (moving || still < 12 || tileBend !== tileTarget) raf = requestAnimationFrame(tick)
    }
    const kick = () => {
      still = 0
      if (!raf) raf = requestAnimationFrame(tick)
    }
    redraw.current = kick
    const fadeTiles = (target: number) => {
      if (tileTarget === target) return
      fadeFrom = tileBend
      tileTarget = target
      fadeStart = performance.now()
      kick()
    }
    const scrolled = () => {
      if (!refract) return
      if (!scrolling) {
        scrolling = true
        fadeTiles(0)
      }
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        scrolling = false
        fadeTiles(1)
      }, SCROLL_IDLE)
    }
    const resized = () => {
      force = true
      kick()
    }
    // light/dark mode and reduced motion change the flow (Lenis also toggles classes on <html>, so check)
    const rootChanged = () => {
      const nowDark = root.classList.contains("dark")
      if (nowDark !== dark) {
        dark = nowDark
        colour.current.changed = true
      }
      kick()
    }
    const start = () => {
      ready = true
      force = true
      root.classList.add("canvas-photo") // hide the CSS photo and fade the canvas in
      kick()
    }

    if (flow) start()
    else {
      img.onload = () => {
        if (disposed) return
        texture = gl.createTexture()
        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img)
        start()
      }
      img.src = asset(innerWidth <= 800 && files.small ? files.small : files.src!)
    }

    const mo = new MutationObserver(kick)
    if (refract) mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-state"] })
    const rootMo = new MutationObserver(rootChanged)
    rootMo.observe(root, { attributes: true, attributeFilter: ["class", "data-motion"] })
    reducedQuery.addEventListener("change", kick)
    document.addEventListener("scroll", scrolled, { capture: true, passive: true })
    window.addEventListener("resize", resized)
    const lost = (e: Event) => {
      e.preventDefault()
      ready = false
      root.classList.remove("canvas-photo")
    }
    canvas.addEventListener("webglcontextlost", lost)

    return () => {
      disposed = true
      redraw.current = () => {}
      cancelAnimationFrame(raf)
      clearTimeout(idleTimer)
      mo.disconnect()
      rootMo.disconnect()
      reducedQuery.removeEventListener("change", kick)
      document.removeEventListener("scroll", scrolled, { capture: true })
      window.removeEventListener("resize", resized)
      canvas.removeEventListener("webglcontextlost", lost)
      root.classList.remove("canvas-photo")
      // free what this run made; the context itself stays usable for the next mount
      gl.deleteTexture(texture)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [photo, refract])

  return (
    <div aria-hidden className="canvas-photo-layer">
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  )
}
