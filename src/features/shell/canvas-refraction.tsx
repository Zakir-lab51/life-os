"use client"

import { useEffect, useRef } from "react"
import { PHOTOS, asset, type PhotoId } from "@/lib/design/design"

/*
  Liquid-glass refraction for browsers without SVG filters in backdrop-filter (Safari,
  so every browser on iPad and iPhone, and Firefox). The background photo is drawn
  with WebGL instead of CSS, and near every .glass surface's rounded edge the photo
  is sampled from further in, so the glass above it (which still blurs as usual)
  shows the same thick, bending rim as the Chromium version. Only the photo bends:
  other page content behind a glass bar doesn't. The canvas redraws only while glass
  moves (scrolling, animations, resizing) and stops once everything is still.
*/

const MAX = 32 // glass surfaces handled at once
const BAND = 16 // px of edge that bends (matches refraction.tsx)
const SHIFT = 13 // px the backdrop is pulled in right at the rim

const VERT = "attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }"
const FRAG = `
precision highp float;
uniform sampler2D photo;
uniform float heightPx;  // canvas height in device px
uniform float dpr;
uniform vec2 origin;     // canvas top-left in the viewport, CSS px
uniform vec4 fit;        // photo placement inside the canvas: offset xy, size zw (CSS px)
uniform int count;
uniform vec4 rects[${MAX}];  // x, y, width, height in the viewport (CSS px)
uniform vec2 shape[${MAX}];  // corner radius, strength 0-1
void main() {
  vec2 local = vec2(gl_FragCoord.x, heightPx - gl_FragCoord.y) / dpr;
  vec2 p = local + origin;
  vec2 shift = vec2(0.0);
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= count) break;
    vec4 r = rects[i];
    vec2 hs = r.zw * 0.5;
    vec2 c = r.xy + hs;
    float rad = min(shape[i].x, min(hs.x, hs.y));
    vec2 q = abs(p - c) - (hs - rad);
    float d = -(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad);
    if (d >= 0.0 && d < ${BAND}.0) {
      vec2 n = (q.x > 0.0 && q.y > 0.0) ? normalize(q) : (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
      n *= vec2(p.x < c.x ? -1.0 : 1.0, p.y < c.y ? -1.0 : 1.0);
      float t = 1.0 - d / ${BAND}.0;
      shift = -n * t * t * ${SHIFT}.0 * shape[i].y;
    }
  }
  gl_FragColor = texture2D(photo, clamp((local + shift - fit.xy) / fit.zw, 0.0, 1.0));
}`

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  console.warn("LIFE OS glass refraction is off: the shader didn't compile.", gl.getShaderInfoLog(shader))
  return null
}

const cornerRadius = (el: HTMLElement) => {
  const cs = getComputedStyle(el)
  return Math.max(...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map((v) => parseFloat(v) || 0))
}

export function CanvasRefraction({ photo }: { photo: PhotoId }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const files = PHOTOS[photo]
    if (!canvas || !files.src) return
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false })
    if (!gl) return
    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    const program = gl.createProgram()
    if (!vs || !fs || !program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("LIFE OS glass refraction is off: the shader didn't link.", gl.getProgramInfoLog(program))
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
    const U = { heightPx: u("heightPx"), dpr: u("dpr"), origin: u("origin"), fit: u("fit"), count: u("count"), rects: u("rects"), shape: u("shape") }

    const root = document.documentElement
    const img = new Image()
    let texture: WebGLTexture | null = null
    let ready = false
    let disposed = false
    const rects = new Float32Array(MAX * 4)
    const shape = new Float32Array(MAX * 2)
    const radii = new WeakMap<HTMLElement, number>()
    let last = ""
    let force = true
    let raf = 0
    let still = 0

    const collect = () => {
      let n = 0
      const parts: number[] = []
      for (const el of document.querySelectorAll<HTMLElement>(".glass")) {
        if (n >= MAX) break
        const r = el.getBoundingClientRect()
        if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) continue
        if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) continue
        let radius = radii.get(el)
        if (radius === undefined) {
          radius = cornerRadius(el)
          radii.set(el, radius)
        }
        const strength = Math.min(1, Number(getComputedStyle(el).opacity) || 0)
        rects.set([r.left, r.top, r.width, r.height], n * 4)
        shape.set([radius, strength], n * 2)
        parts.push(Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height), Math.round(strength * 50))
        n++
      }
      return { n, signature: parts.join(",") }
    }

    const draw = (n: number) => {
      const box = canvas.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 1.5)
      const w = Math.max(1, Math.round(box.width * dpr))
      const h = Math.max(1, Math.round(box.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
      gl.viewport(0, 0, w, h)
      // like background-size: cover, centred
      const s = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight)
      const fw = img.naturalWidth * s
      const fh = img.naturalHeight * s
      gl.uniform1f(U.heightPx, h)
      gl.uniform1f(U.dpr, dpr)
      gl.uniform2f(U.origin, box.left, box.top)
      gl.uniform4f(U.fit, (box.width - fw) / 2, (box.height - fh) / 2, fw, fh)
      gl.uniform1i(U.count, n)
      gl.uniform4fv(U.rects, rects)
      gl.uniform2fv(U.shape, shape)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const tick = () => {
      raf = 0
      if (!ready || disposed) return
      const { n, signature } = collect()
      if (force || signature !== last) {
        draw(n)
        last = signature
        force = false
        still = 0
      } else still++
      if (still < 12) raf = requestAnimationFrame(tick)
    }
    const kick = () => {
      still = 0
      if (!raf) raf = requestAnimationFrame(tick)
    }
    const resized = () => {
      force = true
      kick()
    }

    img.onload = () => {
      if (disposed) return
      texture = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img)
      ready = true
      force = true
      root.classList.add("canvas-photo") // hide the CSS photo now the canvas has it
      kick()
    }
    img.src = asset(innerWidth <= 800 && files.small ? files.small : files.src)

    const mo = new MutationObserver(kick)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "data-state"] })
    document.addEventListener("scroll", kick, { capture: true, passive: true })
    window.addEventListener("resize", resized)
    const lost = (e: Event) => {
      e.preventDefault()
      ready = false
      root.classList.remove("canvas-photo")
    }
    canvas.addEventListener("webglcontextlost", lost)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      mo.disconnect()
      document.removeEventListener("scroll", kick, { capture: true })
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
  }, [photo])

  return (
    <div aria-hidden className="canvas-photo-layer">
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  )
}
